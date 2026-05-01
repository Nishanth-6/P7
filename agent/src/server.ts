import { createWorkersAI } from "workers-ai-provider";
import { callable, routeAgentRequest } from "agents";
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

const DB_URL = "https://uic-hackathon-data.christian-7f4.workers.dev/query";

async function query(sql: string): Promise<unknown> {
  const res = await fetch(DB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql })
  });
  return res.json();
}

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
      system: `You are an Emergency Response Agent. Patients contact you during emergencies. You start every call knowing NOTHING about the patient — you learn by talking to them, then silently pull their medical records once they give you their name.

You serve TWO audiences:
1. THE PATIENT — warm, human, calm. They are frightened. Be the steady voice.
2. THE ED NURSE — clinical, direct, action-ready. They need to act in seconds.

---

STRICT WORKFLOW — 2 exchanges, then act:

STEP 1 — OPEN
Always open with exactly:
"Emergency line — your name?"

STEP 2 — GET THE EMERGENCY & PULL RECORDS
Reply with their name + one question only:
"[Name] — what happened?"
Immediately call getPatientBriefing. Do not wait for the answer first.

STEP 3 — BRIDGE
One short line while records load. Never repeat phrases you've already used. Pick a different one each time:
- "On it."
- "Team's being notified."
- "Got it — stay still."

STEP 4 — DELIVER
One sentence to the patient confirming what was sent. Then generate the nurse briefing and call confirmBriefing.

VARIETY RULE: Never use the same opening phrase, reassurance, or filler twice in a conversation. Vary every response. Be brief. Cut any word that isn't necessary.

---

## 🚨 INCOMING PATIENT — [Name], Age [X]
**Reported emergency:** [what the patient described in their own words]

### ⚠️ Critical Alerts
List only what changes treatment RIGHT NOW. Be specific:
- On warfarin → elevated bleeding risk
- Opioid use disorder → NO opioid pain management
- Insulin-dependent diabetes → check glucose immediately
- Seizure disorder → seizure precautions on arrival
- Overdose history → naloxone ready
- Substance use → monitor for withdrawal

### 🩺 Immediate Treatment Actions
Numbered steps. Verb first. Derived ONLY from actual data — never invent.
1. [Action based on a real condition or medication]
2. [Action based on a real condition or medication]
...

### 🚫 Do NOT Do
Contraindications from the record only:
- No NSAIDs → renal disease on record
- No opioids → active use disorder
- No contrast dye → CKD present
- No benzos → liver disease present

### 🏥 Active Conditions
Most dangerous first. Flag anything relevant to trauma or ER care.

### 💊 Current Medications
Flag high-risk: opioids, anticoagulants, insulin, antiepileptics, immunosuppressants, psych meds, BP meds.

### 🏘️ Social Factors
Substance use, homelessness, no support system — affects discharge safety.

### 📋 Care Plan
Active care plan? If no → flag for social work referral before discharge.

### 💳 Medical Debt
Flag if outstanding debt >$10K — refer to financial counselor at discharge.

---
⚠️ AI-generated from medical records. Clinical judgment takes precedence. Nurse must confirm before forwarding to attending physician.

---

RULES:
- Never show raw JSON or SQL
- If patient not found: "I want to make sure I have the right file — can you spell your last name for me?"
- Patient names have numeric suffixes in the database (e.g. "Lindsay928 Brekke496") — getPatientBriefing handles this
- Treatment actions must come from actual data only
- One question at a time to the patient — always`,

      messages: pruneMessages({
        messages: inlineDataUrls(await convertToModelMessages(this.messages)),
        toolCalls: "before-last-2-messages"
      }),

      tools: {
        ...mcpTools,

        getPatientBriefing: tool({
          description:
            "Look up a patient by name and pull their full medical profile: conditions, medications, SDOH flags, care plan status, and outstanding debt. " +
            "Call this as soon as the patient gives their name. Handles numeric suffixes automatically.",
          inputSchema: z.object({
            name: z.string().describe("Patient name as given — partial names and first-name-only are fine")
          }),
          execute: async ({ name }) => {
            const parts = name.trim().split(/\s+/);
            const first = parts[0] ?? "";
            const last = parts[1] ?? "";

            // Step 1: resolve to a patient ID — avoids fragile string substitution in joins
            const nameFilter = last
              ? `LOWER(first) LIKE '%${first.toLowerCase()}%' AND LOWER(last) LIKE '%${last.toLowerCase()}%'`
              : `LOWER(first) LIKE '%${first.toLowerCase()}%' OR LOWER(last) LIKE '%${first.toLowerCase()}%'`;

            const lookup = await query(
              `SELECT id, first, last FROM patients WHERE ${nameFilter} LIMIT 1`
            ) as { results?: { id: string; first: string; last: string }[] };

            if (!lookup.results?.length) {
              return { error: "Patient not found", searched: name };
            }

            const { id, first: dbFirst, last: dbLast } = lookup.results[0];

            // Step 2: fire all profile queries in parallel using the resolved ID
            const [summary, conditions, medications, sdoh, prapare, debt, careplan] =
              await Promise.all([
                query(`SELECT first, last, birthdate, age, gender, race, ethnicity, income,
                         ed_visits, inpatient_visits, total_visits, chronic_condition_count,
                         has_active_careplan, ed_inpatient_total_cost
                       FROM patient_summary WHERE id = '${id}' LIMIT 1`),

                query(`SELECT DESCRIPTION, START FROM conditions
                       WHERE PATIENT = '${id}' AND STOP IS NULL
                       ORDER BY START DESC LIMIT 30`),

                query(`SELECT DESCRIPTION, REASONDESCRIPTION, START FROM medications
                       WHERE PATIENT = '${id}' AND STOP IS NULL
                       ORDER BY START DESC LIMIT 20`),

                query(`SELECT DESCRIPTION FROM conditions
                       WHERE PATIENT = '${id}' AND STOP IS NULL
                         AND (LOWER(DESCRIPTION) LIKE '%employment%'
                           OR LOWER(DESCRIPTION) LIKE '%housing%'
                           OR LOWER(DESCRIPTION) LIKE '%homeless%'
                           OR LOWER(DESCRIPTION) LIKE '%social contact%'
                           OR LOWER(DESCRIPTION) LIKE '%intimate partner%'
                           OR LOWER(DESCRIPTION) LIKE '%substance%'
                           OR LOWER(DESCRIPTION) LIKE '%drug%'
                           OR LOWER(DESCRIPTION) LIKE '%alcohol%'
                           OR LOWER(DESCRIPTION) LIKE '%criminal%')
                       LIMIT 15`),

                query(`SELECT DESCRIPTION, VALUE, UNITS FROM observations
                       WHERE PATIENT = '${id}' AND LOWER(DESCRIPTION) LIKE '%prapare%'
                       ORDER BY DATE DESC LIMIT 15`),

                query(`SELECT SUM(OUTSTANDING) as total_debt FROM claims_transactions
                       WHERE PATIENTID = '${id}'`),

                query(`SELECT DESCRIPTION, START FROM careplans
                       WHERE PATIENT = '${id}' AND STOP IS NULL
                       ORDER BY START DESC LIMIT 5`)
              ]);

            return {
              patient: { id, name: `${dbFirst} ${dbLast}` },
              summary, conditions, medications, sdoh, prapare, debt, careplan
            };
          }
        }),

        queryDatabase: tool({
          description:
            "Run a custom SQL SELECT query for follow-up lookups — e.g. checking specific encounter history or lab values. " +
            "Always include a LIMIT clause. Use LIKE with LOWER() for patient name searches.",
          inputSchema: z.object({
            sql: z.string().describe("A valid SQL SELECT statement with a LIMIT clause.")
          }),
          execute: async ({ sql }) => query(sql)
        }),

        // No execute = requires ED nurse to click Confirm before briefing reaches the attending physician
        confirmBriefing: tool({
          description:
            "Send the completed clinical briefing to the ED nursing team for review and sign-off before it is forwarded to the attending physician. " +
            "Call this after the full nurse briefing is assembled. The nurse must confirm, modify, or reject it. " +
            "This is the human-in-the-loop gate — the nurse may add notes or override AI recommendations.",
          inputSchema: z.object({
            patientName: z.string().describe("Full name of the patient"),
            incomingEmergency: z.string().describe("Brief description of the emergency as reported by the patient"),
            criticalAlerts: z.array(z.string()).describe("List of critical alerts that affect immediate treatment"),
            immediateActions: z.array(z.string()).describe("Numbered treatment actions for the nurse to execute"),
            patientSummary: z.string().describe("Plain-language summary shown to the patient confirming what was shared with the care team")
          })
        })
      },

      stopWhen: stepCountIs(10),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
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
