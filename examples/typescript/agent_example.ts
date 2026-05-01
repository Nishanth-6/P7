/**
 * UIC Healthcare Hackathon — Agent Example (TypeScript)
 * ======================================================
 * Pattern: System Prompt + Tool Definition + Agentic Loop
 *
 * NO API KEY? Use the Cloudflare Workers path instead — it's free:
 *   See docs/cloudflare_deploy.md — Workers AI runs on Cloudflare's free tier,
 *   no external API key needed.
 *
 * If you want to run locally, you need a key from one of:
 *   Free  — Groq:      console.groq.com      (OpenAI-compatible, generous free tier)
 *   Paid  — Anthropic: console.anthropic.com (this example uses Anthropic SDK)
 *   Paid  — OpenAI:    platform.openai.com
 *
 * Setup (Anthropic):
 *   npm install
 *   export ANTHROPIC_API_KEY=your_key_here
 *   npm run start
 */

import Anthropic from "@anthropic-ai/sdk";

// ─────────────────────────────────────────────
// CONFIGURATION — update the Worker URL once it's deployed
// ─────────────────────────────────────────────

const D1_API_URL =
  "https://uic-hackathon-data.christian-7f4.workers.dev/query";


// ─────────────────────────────────────────────
// STEP 1: TOOLS — what can your agent actually do?
// ─────────────────────────────────────────────

async function queryDatabase(sql: string): Promise<object> {
  const response = await fetch(D1_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
  });
  return (await response.json()) as object;
}

// Tool schemas — the LLM reads these to know what it can call and how
const TOOLS: Anthropic.Tool[] = [
  {
    name: "query_database",
    description:
      "Execute a SQL SELECT query against the patient dataset. " +
      "Returns JSON with a 'results' array. " +
      "Available tables: patients, encounters, conditions, medications, " +
      "observations, procedures, claims_transactions, careplans. " +
      "Use the 'patient_summary' view as your starting point — it has " +
      "one row per patient with pre-computed visit counts, costs, and flags.",
    input_schema: {
      type: "object" as const,
      properties: {
        sql: {
          type: "string",
          description:
            "A valid SQL SELECT statement. Always include a LIMIT clause.",
        },
      },
      required: ["sql"],
    },
  },
  // ── ADD YOUR OWN TOOLS HERE ─────────────────────────────────────────────
];


// ─────────────────────────────────────────────
// STEP 2: SYSTEM PROMPT — the agent's job description
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a healthcare data analyst assistant helping care coordinators \
at a value-based primary care practice.

Your goal is to help coordinators find patients who need intervention, understand \
what's driving high costs, and surface barriers keeping patients from accessing care.

You have access to a database of 117 synthetic patients. Key facts:
- Total costs: $27.9M across 8,316 encounters
- Inpatient visits = 35% of cost from only 2.8% of encounters
- 83% of patients have at least 1 ED visit
- Social factors (housing, food, transport, employment) are in conditions and observations

How to investigate:
1. Start with patient_summary — sort by ed_inpatient_total_cost or total_visits
2. Use the PATIENT column as the join key across most tables
   (exception: claims_transactions uses PATIENTID)
3. Look for both clinical signals (conditions, meds) AND social signals (SDOH)
4. Always show your reasoning before drawing conclusions

Human-in-the-loop rule: Before recommending any action (outreach, care plan change, \
escalation), summarize your findings and ask the coordinator to confirm before proceeding.`;


// ─────────────────────────────────────────────
// STEP 3: THE AGENT LOOP
// ─────────────────────────────────────────────

async function runAgent(userMessage: string): Promise<void> {
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  console.log(`\nUser: ${userMessage}\n${"─".repeat(60)}`);

  while (true) {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    // Append the assistant's response to the conversation history
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      // Agent is done — print its final answer
      for (const block of response.content) {
        if (block.type === "text") {
          console.log(`\nAgent: ${block.text}`);
        }
      }
      break;
    }

    if (response.stop_reason === "tool_use") {
      // Agent called one or more tools — execute them and return results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === "tool_use") {
          console.log(`\n[Tool call: ${block.name}]`);
          console.log(`  Input: ${JSON.stringify(block.input, null, 2)}`);

          let result: object;
          if (block.name === "query_database") {
            result = await queryDatabase(
              (block.input as { sql: string }).sql
            );
          } else {
            result = { error: `Unknown tool: ${block.name}` };
          }

          const rows = (result as { results?: unknown[] }).results ?? [];
          console.log(`  Result: ${rows.length} rows returned`);

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }

      // Feed tool results back into the conversation
      messages.push({ role: "user", content: toolResults });
    }
  }
}


// ─────────────────────────────────────────────
// Try these starting prompts — pick the one that matches your challenge prompt
// ─────────────────────────────────────────────

runAgent(
  "Find the patients most at risk of a preventable ED visit. " +
  "Consider both clinical factors (chronic conditions, no care plan) " +
  "and social factors (SDOH, financial barriers). " +
  "Rank the top 5 and explain why each one is high risk."
);

// Prompt 2: Cost Explainer
// runAgent(
//   "I need to understand why Giovanni Paucek's care is so expensive. " +
//   "Walk me through the breakdown — what types of encounters, " +
//   "what conditions, and which costs look reducible."
// );

// Prompt 3: Care Barrier Agent
// runAgent(
//   "Pull a full profile for Lindsay Brekke. " +
//   "What clinical and social barriers are preventing her from getting consistent care? " +
//   "Generate a barrier-informed care plan for me to review."
// );
