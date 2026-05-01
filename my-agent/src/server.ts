import { createWorkersAI } from "workers-ai-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { callable, routeAgentRequest } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  tool,
  type LanguageModel,
  type ModelMessage
} from "ai";
import { z } from "zod";

/**
 * Pick the LLM provider at request time.
 *
 *   OPENAI_API_KEY       → OpenAI gpt-4o-mini
 *   ANTHROPIC_API_KEY    → Anthropic claude-3-5-haiku
 *   (neither)            → Workers AI kimi-k2.6   ← fallback / backup
 *
 * Switch live with:
 *   npx wrangler secret put OPENAI_API_KEY      (use OpenAI)
 *   npx wrangler secret delete OPENAI_API_KEY   (revert to Workers AI)
 *
 * MODEL_PROVIDER (optional) forces a specific provider regardless of which
 * keys are present: set to "openai", "anthropic", or "workers".
 */
type ProviderEnv = {
  AI: Env["AI"];
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  MODEL_PROVIDER?: string;
  OPENAI_MODEL?: string;
  ANTHROPIC_MODEL?: string;
};

function selectModel(
  rawEnv: Env,
  sessionAffinity: string | undefined
): { provider: string; model: LanguageModel } {
  const env = rawEnv as ProviderEnv;
  const forced = env.MODEL_PROVIDER?.toLowerCase().trim();

  if (forced === "openai" || (!forced && env.OPENAI_API_KEY)) {
    if (!env.OPENAI_API_KEY) {
      throw new Error("MODEL_PROVIDER=openai but OPENAI_API_KEY is not set");
    }
    const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
    return {
      provider: "openai",
      model: openai(env.OPENAI_MODEL ?? "gpt-4o-mini")
    };
  }

  if (forced === "anthropic" || (!forced && env.ANTHROPIC_API_KEY)) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error(
        "MODEL_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set"
      );
    }
    const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return {
      provider: "anthropic",
      model: anthropic(env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest")
    };
  }

  const workersai = createWorkersAI({ binding: env.AI });
  return {
    provider: "workers-ai",
    model: workersai("@cf/moonshotai/kimi-k2.6", { sessionAffinity })
  };
}

/**
 * The AI SDK's downloadAssets step runs `new URL(data)` on every file
 * part's string data. Data URIs parse as valid URLs, so it tries to
 * HTTP-fetch them and fails. Decode to Uint8Array so the SDK treats
 * them as inline data instead.
 */
function inlineDataUrls(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((msg) => {
    if (msg.role !== "user" || typeof msg.content === "string") return msg;
    return {
      ...msg,
      content: msg.content.map((part) => {
        if (part.type !== "file" || typeof part.data !== "string") return part;
        const match = part.data.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return part;
        const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
        return { ...part, data: bytes, mediaType: match[1] };
      })
    };
  });
}

export class ChatAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 100;

  onStart() {
    // Configure OAuth popup behavior for MCP servers that require authentication
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html" },
            status: 200
          });
        }
        return new Response(
          `Authentication Failed: ${result.authError || "Unknown error"}`,
          { headers: { "content-type": "text/plain" }, status: 400 }
        );
      }
    });
  }

  @callable()
  async addServer(name: string, url: string) {
    return await this.addMcpServer(name, url);
  }

  @callable()
  async removeServer(serverId: string) {
    await this.removeMcpServer(serverId);
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const mcpTools = this.mcp.getAITools();
    const { provider, model } = selectModel(this.env, this.sessionAffinity);
    console.log(`[chat] using model provider: ${provider}`);

    const result = streamText({
      model,
      system: `You are the MAIN COORDINATOR for a Multi-Agent Care System.

YOU HAVE ACCESS TO:
- Patient Search Tool (searchPatient) - Finds patient UUID by name
- 4 Specialized Sub-Agents that run autonomously

SUB-AGENTS:
1. 🎯 Risk Ranking Agent (rankWeeklyRisks) - Calculates risk scores
2. 📋 Clinical Profile Agent (analyzePatientProfile) - Pulls medical records
3. 🚧 Barrier Detection Agent (detectBarriers) - Identifies SDOH obstacles
4. ✉️ Outreach Generator Agent (generateOutreachPlan) - Creates intervention plans with PDF/email

PARALLEL EXECUTION WORKFLOW:

**When asked "show weekly risks" or "who is at risk":**
- Call rankWeeklyRisks tool
- Present results and ask: "Which patient should we investigate?"

**When coordinator asks about a specific patient by NAME (e.g., "tell me about Lindsay Brekke"):**
1. FIRST: Call searchPatient to get patient UUID
2. IMMEDIATELY after getting UUID: Call BOTH analyzePatientProfile AND detectBarriers IN PARALLEL (in same response)
3. Wait for both to complete
4. Synthesize results into clear summary
5. ⚡ MANDATORY STEP - DO NOT SKIP: After presenting the analysis, you MUST IMMEDIATELY ask a targeted binary question. DO NOT WAIT for permission. DO NOT say "would you like me to...". Just ask the question directly.
   - Example format: "Based on the analysis, [patient] has [barrier] identified. Does [patient] have [Option A: specific solution], or should I recommend [Option B: alternative solution]?"
   - Example: "Lindsay has transportation barriers. Does she have family who can drive her to appointments (daughter mentioned as available Tuesdays), or should I arrange medical transport instead?"
   - The question MUST be a binary choice (A or B) that will personalize the outreach

**After coordinator answers your question:**
6. ⚡ MANDATORY STEP - DO NOT SKIP: IMMEDIATELY call generateOutreachPlan with the coordinator's answer
   - Do NOT ask permission
   - Do NOT say "shall I create..."
   - Just call the tool with all required parameters
   - This generates personalized email + SMS drafts, action items, and impact estimate
   - The UI will render a review card with Approve / Modify / Reject controls automatically
   - The coordinator reviews the actual drafts (not the inputs) and decides

**After coordinator approves, modifies, or rejects:**
7. The UI handles the approve/modify/reject decision client-side and posts a follow-up
   message describing what the coordinator did. When you see that follow-up:
   - If APPROVED: confirm in one sentence that the plan is queued to send and offer to move
     to the next high-risk patient.
   - If MODIFIED: acknowledge the edits, summarize what changed, and confirm it's queued.
   - If REJECTED: ask for the specific concern (tone, timing, channel, content) and call
     generateOutreachPlan again with adjusted inputs.

CRITICAL RULES - WORKFLOW MUST COMPLETE:
- If given a patient NAME, ALWAYS call searchPatient FIRST to get UUID
- ALWAYS run analyzePatientProfile + detectBarriers in parallel (both in same tool call response)
- NEVER ask "would you like me to..." - just execute the tools
- After showing barrier analysis, you MUST ask the binary question immediately (step 5 is NOT optional)
- After receiving coordinator's answer, you MUST call generateOutreachPlan immediately (step 6 is NOT optional)
- The workflow is incomplete unless coordinator sees the email/SMS drafts with the review card
- User will see all agents running simultaneously in the UI with real-time status`,
      // Prune old tool calls to save tokens on long conversations
      messages: pruneMessages({
        messages: inlineDataUrls(await convertToModelMessages(this.messages)),
        toolCalls: "before-last-2-messages"
      }),
      tools: {
        // MCP tools from connected servers
        ...mcpTools,

        // ===== MULTI-AGENT SYSTEM: 4 SPECIALIZED SUB-AGENTS =====

        // UTILITY TOOL: Patient Search (finds UUID by name)
        searchPatient: tool({
          description:
            "Search for a patient by name to get their UUID. Use this when you have a patient's " +
            "name but need their ID to run other tools. Handles partial names and common variations.",
          inputSchema: z.object({
            patientName: z.string().describe("Patient name (first and/or last name)")
          }),
          execute: async ({ patientName }) => {
            // Search using LIKE for flexible matching
            const searchTerm = patientName.toLowerCase().replace(/[0-9]/g, '').trim();
            const res = await fetch(
              "https://uic-hackathon-data.christian-7f4.workers.dev/query",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sql: `
                    SELECT id, first, last, ed_visits, chronic_condition_count
                    FROM patient_summary
                    WHERE LOWER(first || ' ' || last) LIKE '%${searchTerm}%'
                    OR LOWER(last) LIKE '%${searchTerm}%'
                    LIMIT 5
                  `
                })
              }
            );
            const data = await res.json() as any;

            if (!data.results || data.results.length === 0) {
              return {
                found: false,
                message: `No patient found matching "${patientName}". Try a different spelling or check the patient list.`
              };
            }

            const exactMatch = data.results[0];
            return {
              found: true,
              patientId: exactMatch.id,
              patientName: `${exactMatch.first} ${exactMatch.last}`,
              edVisits: exactMatch.ed_visits,
              conditions: exactMatch.chronic_condition_count,
              message: `Found: ${exactMatch.first} ${exactMatch.last} (UUID: ${exactMatch.id})`
            };
          }
        }),

        // SUB-AGENT 1: 🎯 Risk Ranking Agent
        rankWeeklyRisks: tool({
          description:
            "[SUB-AGENT 1: RISK RANKING] Identifies and ranks patients at highest risk of " +
            "preventable ER visits in next 7 days. Uses predictive scoring algorithm combining " +
            "ER visit frequency, chronic conditions, and care plan status. Runs autonomously.",
          inputSchema: z.object({
            limit: z.number().default(5).describe("Number of top-risk patients to return")
          }),
          execute: async ({ limit }) => {
            const res = await fetch(
              "https://uic-hackathon-data.christian-7f4.workers.dev/query",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sql: `
                    SELECT
                      id,
                      first,
                      last,
                      ed_visits,
                      chronic_condition_count,
                      has_active_careplan,
                      ed_inpatient_total_cost
                    FROM patient_summary
                    WHERE ed_visits >= 3
                    ORDER BY ed_visits DESC, has_active_careplan ASC
                    LIMIT ${limit}
                  `
                })
              }
            );
            const data = await res.json() as any;

            const rankedPatients = data.results?.map((p: any) => ({
              ...p,
              risk_score: (p.ed_visits * 10) +
                         (p.chronic_condition_count * 5) +
                         (p.has_active_careplan === 0 ? 25 : 0),
              risk_level: p.ed_visits > 20 ? "CRITICAL" : p.ed_visits > 10 ? "HIGH" : "MODERATE",
              predicted_er_window: "Next 3-7 days"
            })) || [];

            return {
              agent: "Risk Ranking Agent",
              status: "completed",
              patientsAnalyzed: rankedPatients.length,
              topRisks: rankedPatients,
              summary: `Ranked ${rankedPatients.length} high-risk patients. Top priority: ${rankedPatients[0]?.first} ${rankedPatients[0]?.last} (Risk Score: ${rankedPatients[0]?.risk_score})`
            };
          }
        }),

        // SUB-AGENT 2: 📋 Clinical Profile Agent
        analyzePatientProfile: tool({
          description:
            "[SUB-AGENT 2: CLINICAL PROFILE] Retrieves comprehensive medical record analysis " +
            "including active conditions, recent encounters, care plan status, and care gaps. " +
            "Runs in parallel with Barrier Detection Agent for faster results.",
          inputSchema: z.object({
            patientId: z.string().describe("Patient UUID"),
            patientName: z.string().describe("Patient name for context")
          }),
          execute: async ({ patientId, patientName }) => {
            // Get active conditions
            const conditionsRes = await fetch(
              "https://uic-hackathon-data.christian-7f4.workers.dev/query",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sql: `
                    SELECT DESCRIPTION, START
                    FROM conditions
                    WHERE PATIENT = '${patientId}' AND STOP IS NULL
                    ORDER BY START DESC
                    LIMIT 10
                  `
                })
              }
            );
            const conditions = await conditionsRes.json() as any;

            // Get recent encounters
            const encountersRes = await fetch(
              "https://uic-hackathon-data.christian-7f4.workers.dev/query",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sql: `
                    SELECT ENCOUNTERCLASS, DESCRIPTION, START, REASONDESCRIPTION
                    FROM encounters
                    WHERE PATIENT = '${patientId}'
                    ORDER BY START DESC
                    LIMIT 10
                  `
                })
              }
            );
            const encounters = await encountersRes.json() as any;

            // Get care plan status
            const carePlanRes = await fetch(
              "https://uic-hackathon-data.christian-7f4.workers.dev/query",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sql: `
                    SELECT DESCRIPTION, START, STOP
                    FROM careplans
                    WHERE PATIENT = '${patientId}'
                    ORDER BY START DESC
                    LIMIT 3
                  `
                })
              }
            );
            const carePlans = await carePlanRes.json() as any;

            const hasActivePlan = carePlans.results?.some((cp: any) => cp.STOP === null) || false;
            const erVisits = encounters.results?.filter((e: any) => e.ENCOUNTERCLASS === 'emergency') || [];
            const lastERVisit = erVisits[0];

            return {
              agent: "Clinical Profile Agent",
              status: "completed",
              patient: patientName,
              patientId,
              clinicalSummary: {
                activeConditions: conditions.results?.length || 0,
                totalERVisits: erVisits.length,
                lastERVisit: lastERVisit ? `${lastERVisit.REASONDESCRIPTION} (${lastERVisit.START})` : "None",
                hasActivePlan
              },
              identifiedGaps: [
                !hasActivePlan ? "No active care plan" : null,
                erVisits.length > 3 ? `${erVisits.length} ER visits (preventable pattern detected)` : null,
                erVisits.length > 0 && erVisits[0].START ? `Last ER visit: ${Math.floor((Date.now() - new Date(erVisits[0].START).getTime()) / (1000 * 60 * 60 * 24))} days ago` : null
              ].filter(Boolean),
              rawData: {
                conditions: conditions.results || [],
                encounters: encounters.results || [],
                carePlans: carePlans.results || []
              }
            };
          }
        }),

        // SUB-AGENT 3: 🚧 Barrier Detection Agent
        detectBarriers: tool({
          description:
            "[SUB-AGENT 3: BARRIER DETECTION] Analyzes social determinants of health (SDOH) " +
            "to identify barriers preventing care access: housing, transportation, food security, " +
            "employment, social isolation. Uses PRAPARE screening data. Runs in parallel with Clinical Profile Agent.",
          inputSchema: z.object({
            patientId: z.string().describe("Patient UUID"),
            patientName: z.string().describe("Patient name for context")
          }),
          execute: async ({ patientId, patientName }) => {
            // Get SDOH conditions
            const sdohRes = await fetch(
              "https://uic-hackathon-data.christian-7f4.workers.dev/query",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sql: `
                    SELECT DESCRIPTION
                    FROM conditions
                    WHERE PATIENT = '${patientId}'
                    AND STOP IS NULL
                    AND (
                      DESCRIPTION LIKE '%housing%'
                      OR DESCRIPTION LIKE '%transport%'
                      OR DESCRIPTION LIKE '%food%'
                      OR DESCRIPTION LIKE '%employment%'
                      OR DESCRIPTION LIKE '%stress%'
                      OR DESCRIPTION LIKE '%social isolation%'
                    )
                  `
                })
              }
            );
            const sdohConditions = await sdohRes.json() as any;

            // Get PRAPARE observations
            const prapareRes = await fetch(
              "https://uic-hackathon-data.christian-7f4.workers.dev/query",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sql: `
                    SELECT DESCRIPTION, VALUE, DATE
                    FROM observations
                    WHERE PATIENT = '${patientId}'
                    AND CODE IN (
                      SELECT CODE FROM observations
                      WHERE DESCRIPTION LIKE '%PRAPARE%'
                      OR DESCRIPTION LIKE '%housing%'
                      OR DESCRIPTION LIKE '%transport%'
                      OR DESCRIPTION LIKE '%food%'
                    )
                    ORDER BY DATE DESC
                    LIMIT 10
                  `
                })
              }
            );
            const prapare = await prapareRes.json() as any;

            const barriers = {
              housing: (sdohConditions.results || []).some((c: any) => c.DESCRIPTION?.toLowerCase().includes('housing')),
              transportation: (sdohConditions.results || []).some((c: any) => c.DESCRIPTION?.toLowerCase().includes('transport')),
              food: (sdohConditions.results || []).some((c: any) => c.DESCRIPTION?.toLowerCase().includes('food')),
              employment: (sdohConditions.results || []).some((c: any) => c.DESCRIPTION?.toLowerCase().includes('employment')),
              socialIsolation: (sdohConditions.results || []).some((c: any) => c.DESCRIPTION?.toLowerCase().includes('social isolation'))
            };

            const activeBarriers = Object.entries(barriers)
              .filter(([_, active]) => active)
              .map(([type, _]) => type.charAt(0).toUpperCase() + type.slice(1));

            return {
              agent: "Barrier Detection Agent",
              status: "completed",
              patient: patientName,
              patientId,
              barriersDetected: activeBarriers.length,
              activeBarriers,
              criticalBarrier: activeBarriers.includes('Transportation') ? 'Transportation' : activeBarriers[0] || 'None',
              recommendedActions: activeBarriers.length > 0
                ? [`Address ${activeBarriers[0]} barrier before scheduling appointments`]
                : ["No major barriers detected - patient ready for standard outreach"],
              rawData: {
                sdohConditions: sdohConditions.results || [],
                prapareScreening: prapare.results || []
              }
            };
          }
        }),

        // SUB-AGENT 4: ✉️ Outreach Generator Agent
        generateOutreachPlan: tool({
          description:
            "[SUB-AGENT 4: OUTREACH GENERATOR] Creates a personalized intervention plan with " +
            "email + SMS drafts, action items, and impact estimate. Incorporates the coordinator's " +
            "local knowledge and identified barriers. The UI renders a review card with " +
            "Approve / Modify / Reject controls — the coordinator reviews the actual drafts.",
          inputSchema: z.object({
            patientName: z.string().describe("Patient name"),
            patientId: z.string().describe("Patient UUID"),
            riskLevel: z.string().describe("Risk level: CRITICAL, HIGH, or MODERATE"),
            identifiedGaps: z.array(z.string()).describe("Care gaps identified by Clinical Profile Agent"),
            activeBarriers: z.array(z.string()).describe("Barriers identified by Barrier Detection Agent"),
            coordinatorInput: z.string().describe("Coordinator's answer to targeted question (e.g., 'Daughter drives Tuesdays')")
          }),
          execute: async ({ patientName, patientId, riskLevel, identifiedGaps, activeBarriers, coordinatorInput }) => {
            // Generate personalized intervention incorporating coordinator's input
            const today = new Date().toLocaleDateString();

            // Build PDF-ready summary
            const pdfSummary = {
              title: "PREVENTABLE ER VISIT - INTERVENTION PLAN",
              date: today,
              patient: patientName,
              patientId,
              riskLevel,
              priority: riskLevel === "CRITICAL" ? "URGENT - Contact within 24 hours" : "HIGH - Contact within 48 hours"
            };

            // Build email draft
            const emailSubject = `Care Coordinator Follow-up: ${patientName}`;
            const emailBody = `Dear ${patientName.split(' ')[0]},

This is ${coordinatorInput.includes('daughter') || coordinatorInput.includes('family') ? 'a follow-up from' : 'your care coordinator at'} your primary care clinic.

We noticed you've been visiting the emergency room and want to help you get the care you need in a more convenient way.

${coordinatorInput.includes('Tuesday') || coordinatorInput.includes('transportation')
  ? `Good news - we can schedule appointments that work with your transportation schedule. ${coordinatorInput}`
  : `We'd like to schedule a care planning appointment. ${coordinatorInput}`}

Our team can help with:
${identifiedGaps.map(gap => `• ${gap.replace('No active care plan', 'Creating a personalized care plan')}`).join('\n')}

${activeBarriers.length > 0 ? `We understand you may face challenges with ${activeBarriers.join(', ').toLowerCase()}. We have resources to help with this.` : ''}

Please call us at (555) 123-4567 to schedule your appointment.

Best regards,
Your Care Coordination Team`;

            // Build SMS option (short version)
            const smsText = `Hi ${patientName.split(' ')[0]}, this is your care team. We'd like to help schedule a care plan appointment. ${coordinatorInput.includes('Tuesday') ? 'We can do Tuesdays if that works for your schedule.' : ''} Call (555) 123-4567. -Care Coordination`;

            return {
              agent: "Outreach Generator Agent",
              status: "awaiting_review",
              patient: patientName,

              outreachPlan: {
                pdfPreview: pdfSummary,
                emailDraft: {
                  to: `${patientName.toLowerCase().replace(' ', '.')}@example.com`,
                  subject: emailSubject,
                  body: emailBody
                },
                smsDraft: {
                  phone: "(555) XXX-XXXX",
                  message: smsText
                },
                actionItems: [
                  `📞 Call ${patientName} within 24-48 hours`,
                  ...identifiedGaps.map(gap => `✓ ${gap}`),
                  activeBarriers.length > 0 ? `🚧 Address barriers: ${activeBarriers.join(', ')}` : null,
                  `📝 Coordinator context: ${coordinatorInput}`
                ].filter(Boolean),
                estimatedImpact: "May prevent 2-4 ER visits in next 30 days (~$5,000 savings)"
              },

              message: `📧 Outreach plan generated for ${patientName}. Review the email/SMS drafts in the card below — Approve to queue, Modify to edit, or Reject to regenerate.`
            };
          }
        })
      },
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }
}

async function fetchRoster(): Promise<Response> {
  const res = await fetch(
    "https://uic-hackathon-data.christian-7f4.workers.dev/query",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: `
          SELECT id, first, last, ed_visits, chronic_condition_count,
                 has_active_careplan, ed_inpatient_total_cost
          FROM patient_summary
          WHERE ed_visits >= 3
          ORDER BY ed_visits DESC, has_active_careplan ASC
          LIMIT 25
        `
      })
    }
  );
  const data = await res.json();
  return Response.json(data, {
    headers: { "Cache-Control": "public, max-age=60" }
  });
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/roster" && request.method === "GET") {
      return fetchRoster();
    }
    if (url.pathname === "/api/provider" && request.method === "GET") {
      const e = env as ProviderEnv;
      return Response.json({
        provider:
          (e.MODEL_PROVIDER?.toLowerCase().trim() ||
            (e.OPENAI_API_KEY
              ? "openai"
              : e.ANTHROPIC_API_KEY
                ? "anthropic"
                : "workers-ai")),
        hasOpenAIKey: !!e.OPENAI_API_KEY,
        hasAnthropicKey: !!e.ANTHROPIC_API_KEY
      });
    }
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
