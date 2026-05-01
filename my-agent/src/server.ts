import { createWorkersAI } from "workers-ai-provider";
import { callable, routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  tool,
  type ModelMessage
} from "ai";
import { z } from "zod";

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
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersai("@cf/moonshotai/kimi-k2.6", {
        sessionAffinity: this.sessionAffinity
      }),
      system: `You are a Care Coordinator AI Assistant for a value-based primary care practice.

YOUR PRIMARY JOB: Help coordinators identify patients at risk of preventable ER visits THIS WEEK and create actionable intervention plans.

WORKFLOW (follow these steps autonomously):

1. When asked to "find weekly risks" or "show this week's risks":
   - Use findWeeklyRisk to identify patients likely to visit ER in next 7 days
   - Present top 3-5 patients with risk scores and patterns

2. When coordinator asks about a specific patient:
   - Use analyzePatient to get full clinical profile + care gaps
   - Use getBarrierContext to understand social/logistical barriers
   - Synthesize into clear summary: clinical status + gaps + barriers

3. Before drafting intervention:
   - ASK the coordinator a SPECIFIC question about local knowledge
   - Example: "Patient has transportation barriers flagged. Does [patient name] have family who can drive them, or should I recommend medical transport?"
   - WAIT for coordinator's answer

4. After coordinator provides context:
   - Use draftIntervention with the coordinator's input
   - This requires approval - the coordinator will review and can modify

CRITICAL RULES:
- NEVER auto-execute interventions - always get coordinator approval
- ASK targeted questions that only humans with local knowledge can answer
- Format data as clear summaries, NOT raw JSON
- Focus on ACTIONABLE gaps (missing appointments, no care plan) not just diagnoses
- Incorporate BOTH clinical AND social factors in your analysis

HUMAN-IN-THE-LOOP PATTERN:
Your questions should change what you do next. Don't ask "Approve yes/no?"
Ask "Option A or Option B?" where the answer determines the intervention content.

${getSchedulePrompt({ date: new Date() })}`,
      // Prune old tool calls to save tokens on long conversations
      messages: pruneMessages({
        messages: inlineDataUrls(await convertToModelMessages(this.messages)),
        toolCalls: "before-last-2-messages"
      }),
      tools: {
        // MCP tools from connected servers
        ...mcpTools,

        // ===== HEALTHCARE AGENT TOOLS =====

        // Tool 1: Find patients at risk of ER visit this week
        findWeeklyRisk: tool({
          description:
            "Identify patients at highest risk of preventable ER visit in the next 7 days. " +
            "Analyzes ER visit patterns to find patients with frequent, predictable ER usage. " +
            "Returns top patients ranked by risk score with pattern analysis.",
          inputSchema: z.object({
            limit: z.number().default(5).describe("Number of high-risk patients to return")
          }),
          execute: async ({ limit }) => {
            // Query patients with frequent ED visits
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

            // Calculate simple risk scores (in production, this would be more sophisticated)
            const patientsWithRisk = data.results?.map((p: any) => ({
              ...p,
              risk_score: (p.ed_visits * 10) +
                         (p.chronic_condition_count * 5) +
                         (p.has_active_careplan === 0 ? 25 : 0),
              risk_level: p.ed_visits > 20 ? "CRITICAL" : p.ed_visits > 10 ? "HIGH" : "MODERATE"
            })) || [];

            return {
              success: true,
              count: patientsWithRisk.length,
              patients: patientsWithRisk,
              message: `Found ${patientsWithRisk.length} high-risk patients`
            };
          }
        }),

        // Tool 2: Analyze specific patient's full profile
        analyzePatient: tool({
          description:
            "Get comprehensive analysis of a specific patient including active conditions, " +
            "medications, recent encounters, and care plan status. Use this after identifying " +
            "a high-risk patient to understand their full clinical picture.",
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
            const lastERVisit = encounters.results?.find((e: any) => e.ENCOUNTERCLASS === 'emergency');

            return {
              patient: patientName,
              patientId,
              activeConditions: conditions.results || [],
              recentEncounters: encounters.results || [],
              carePlanStatus: {
                hasActivePlan,
                plans: carePlans.results || []
              },
              lastERVisit: lastERVisit || null,
              gaps: {
                noCarePlan: !hasActivePlan,
                multipleERVisits: encounters.results?.filter((e: any) => e.ENCOUNTERCLASS === 'emergency').length > 3
              }
            };
          }
        }),

        // Tool 3: Get social determinants and barriers
        getBarrierContext: tool({
          description:
            "Retrieve social determinants of health (SDOH) data for a patient including " +
            "housing, transportation, food security, and other barriers that may prevent " +
            "them from accessing care. Use this to understand non-clinical factors.",
          inputSchema: z.object({
            patientId: z.string().describe("Patient UUID"),
            patientName: z.string().describe("Patient name for context")
          }),
          execute: async ({ patientId, patientName }) => {
            // Get SDOH conditions (flagged in conditions table)
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

            // Get PRAPARE observations (social screening data)
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

            return {
              patient: patientName,
              patientId,
              sdohConditions: sdohConditions.results || [],
              prapareData: prapare.results || [],
              identifiedBarriers: barriers,
              hasBarriers: Object.values(barriers).some(b => b === true)
            };
          }
        }),

        // Tool 4: Draft intervention with approval required
        draftIntervention: tool({
          description:
            "Draft a personalized outreach intervention plan for a high-risk patient. " +
            "This tool REQUIRES coordinator approval before execution. " +
            "Use barrier information and coordinator's local knowledge to personalize the plan.",
          inputSchema: z.object({
            patientName: z.string().describe("Patient name"),
            patientId: z.string().describe("Patient UUID"),
            riskFactors: z.array(z.string()).describe("List of identified risk factors"),
            identifiedGaps: z.array(z.string()).describe("Care gaps (e.g., 'No active care plan', 'Missed appointments')"),
            barriers: z.array(z.string()).describe("SDOH barriers (e.g., 'Transportation', 'Housing instability')"),
            coordinatorInput: z.string().describe("Coordinator's local knowledge (e.g., 'Daughter drives Tuesdays')")
          }),
          needsApproval: true,  // This makes it require human approval
          execute: async ({ patientName, patientId, riskFactors, identifiedGaps, barriers, coordinatorInput }) => {
            // Generate intervention text incorporating coordinator's input
            const intervention = {
              patientName,
              patientId,
              priority: "HIGH",
              actionItems: [
                `📞 Call ${patientName} within 24 hours`,
                ...identifiedGaps.map(gap => `✓ Address: ${gap}`),
                ...barriers.length > 0 ? [`🚧 Consider barriers: ${barriers.join(', ')}`] : [],
                `📝 Coordinator note: ${coordinatorInput}`
              ],
              suggestedApproach: coordinatorInput,
              nextSteps: [
                "Schedule care plan review appointment",
                "Coordinate with relevant support services",
                "Follow up in 7 days"
              ],
              estimatedImpact: "May prevent 1-3 ER visits in next 30 days"
            };

            return {
              success: true,
              intervention,
              message: `Intervention plan drafted for ${patientName}. Awaiting coordinator approval.`
            };
          }
        }),

        // Client-side tool: no execute function — the browser handles it
        getUserTimezone: tool({
          description:
            "Get the user's timezone from their browser. Use this when you need to know the user's local time.",
          inputSchema: z.object({})
        }),

        // Approval tool: requires user confirmation before executing
        calculate: tool({
          description:
            "Perform a math calculation with two numbers. Requires user approval for large numbers.",
          inputSchema: z.object({
            a: z.number().describe("First number"),
            b: z.number().describe("Second number"),
            operator: z
              .enum(["+", "-", "*", "/", "%"])
              .describe("Arithmetic operator")
          }),
          needsApproval: async ({ a, b }) =>
            Math.abs(a) > 1000 || Math.abs(b) > 1000,
          execute: async ({ a, b, operator }) => {
            const ops: Record<string, (x: number, y: number) => number> = {
              "+": (x, y) => x + y,
              "-": (x, y) => x - y,
              "*": (x, y) => x * y,
              "/": (x, y) => x / y,
              "%": (x, y) => x % y
            };
            if (operator === "/" && b === 0) {
              return { error: "Division by zero" };
            }
            return {
              expression: `${a} ${operator} ${b}`,
              result: ops[operator](a, b)
            };
          }
        }),

        scheduleTask: tool({
          description:
            "Schedule a task to be executed at a later time. Use this when the user asks to be reminded or wants something done later.",
          inputSchema: scheduleSchema,
          execute: async ({ when, description }) => {
            if (when.type === "no-schedule") {
              return "Not a valid schedule input";
            }
            const input =
              when.type === "scheduled"
                ? when.date
                : when.type === "delayed"
                  ? when.delayInSeconds
                  : when.type === "cron"
                    ? when.cron
                    : null;
            if (!input) return "Invalid schedule type";
            try {
              this.schedule(input, "executeTask", description, {
                idempotent: true
              });
              return `Task scheduled: "${description}" (${when.type}: ${input})`;
            } catch (error) {
              return `Error scheduling task: ${error}`;
            }
          }
        }),

        getScheduledTasks: tool({
          description: "List all tasks that have been scheduled",
          inputSchema: z.object({}),
          execute: async () => {
            const tasks = this.getSchedules();
            return tasks.length > 0 ? tasks : "No scheduled tasks found.";
          }
        }),

        cancelScheduledTask: tool({
          description: "Cancel a scheduled task by its ID",
          inputSchema: z.object({
            taskId: z.string().describe("The ID of the task to cancel")
          }),
          execute: async ({ taskId }) => {
            try {
              this.cancelSchedule(taskId);
              return `Task ${taskId} cancelled.`;
            } catch (error) {
              return `Error cancelling task: ${error}`;
            }
          }
        })
      },
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }

  async executeTask(description: string, _task: Schedule<string>) {
    // Do the actual work here (send email, call API, etc.)
    console.log(`Executing scheduled task: ${description}`);

    // Notify connected clients via a broadcast event.
    // We use broadcast() instead of saveMessages() to avoid injecting
    // into chat history — that would cause the AI to see the notification
    // as new context and potentially loop.
    this.broadcast(
      JSON.stringify({
        type: "scheduled-task",
        description,
        timestamp: new Date().toISOString()
      })
    );
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
