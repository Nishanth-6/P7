# Deploy a Live Agent on Cloudflare Workers

Build locally, deploy globally. No API key needed — Cloudflare Workers AI is free on the free tier.

**Total time: ~20 minutes to first live URL. After that, every change deploys in ~30 seconds.**

---

## Step 1 — Create a free Cloudflare account

Go to **dash.cloudflare.com** and sign up. No credit card required. This account is also what `wrangler deploy` authenticates against.

---

## Step 2 — Scaffold the agent

```bash
npx create-cloudflare@latest my-agent --template cloudflare/agents-starter
cd my-agent
npm install
```

When the CLI prompts you:
- **"Use git for version control?"** → **No** (your hackathon fork is already a git repo)
- **"Deploy your application?"** → **No** (we'll deploy manually in Step 5)

You may see a `WARNING Failed to update tsconfig.json` message — this is harmless, the scaffold worked fine.

---

## Step 3 — Test locally

```bash
npm run dev
```

Open **http://localhost:5173** — you should see a working chat UI. Send a message and confirm it responds. The default agent has weather and calculator tools; that's expected.

> **Windows ARM64 only:** If `npm run dev` fails with `Error: Unsupported platform: win32 arm64 LE`, `workerd` (Cloudflare's local runtime) doesn't support ARM64 Windows yet. Skip local dev and go straight to Step 5 — use the deploy-to-test loop instead. See [cloudflare/workerd#6486](https://github.com/cloudflare/workerd/issues/6486).

---

## Step 4 — Add the queryDatabase tool

Open `src/server.ts` in your editor. Find the `tools` object inside `onChatMessage()` and add `queryDatabase` after `getWeather`:

```typescript
queryDatabase: tool({
  description:
    "Execute a SQL SELECT query against the patient dataset. " +
    "Use patient_summary as your starting point — it has one row per patient " +
    "with pre-computed visit counts, costs, and care plan flags. " +
    "Tables: patients, encounters, conditions, medications, " +
    "observations, procedures, claims_transactions, careplans. " +
    "IMPORTANT: claims_transactions joins on PATIENTID, not PATIENT.",
  inputSchema: z.object({
    sql: z.string().describe("A valid SQL SELECT statement. Always include a LIMIT clause."),
  }),
  execute: async ({ sql }) => {
    const res = await fetch(
      "https://uic-hackathon-data.christian-7f4.workers.dev/query",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      }
    );
    return res.json() as object;
  },
}),
```

Save the file. Hot reload kicks in within 1-2 seconds. Switch to the browser and ask **"find the highest cost patients"** — the agent should call the tool and return a formatted table.

> **`inputSchema` not `parameters`:** agents-starter uses the AI SDK convention (`inputSchema`). The standalone Python/TypeScript examples in `examples/` use the Anthropic SDK convention (`input_schema`). Both are correct for their respective frameworks — don't mix them.

**Also update the system prompt** — find the `system:` string in `onChatMessage()` and replace it:

```typescript
system: `You are a healthcare data analyst helping care coordinators at a value-based primary care practice.

You have access to a database of 117 synthetic patients. Use the queryDatabase tool to investigate patient data.

Start every investigation with:
SELECT * FROM patient_summary ORDER BY ed_inpatient_total_cost DESC LIMIT 10

Key tables:
- patient_summary: start here — one row per patient, pre-computed costs and visit counts
- encounters: filter by ENCOUNTERCLASS (emergency, inpatient, ambulatory, urgentcare, wellness)
- conditions: active when STOP IS NULL — includes both clinical and SDOH conditions
- observations: PRAPARE social screenings (housing, food, transport, stress)
- claims_transactions: financial data — join on PATIENTID (not PATIENT)
- medications: active when STOP IS NULL

Rules:
- Never show raw JSON to users — always format results as a table or clear summary
- Always include a LIMIT clause in SQL queries
- Before recommending any action, summarize findings and ask the coordinator to confirm`
```

---

## Step 5 — Deploy live

```bash
npx wrangler login   # opens browser — authorize your Cloudflare account (one time only)
npx wrangler deploy  # builds and deploys — live URL in ~30 seconds
```

Your live URL will be printed: `https://my-agent.YOUR_SUBDOMAIN.workers.dev`

Open it, test the same query, confirm it works on the live URL.

---

## The iteration loop

**Mac / Linux / Windows x64:**
```
Edit src/server.ts → save
        ↓ (1-2 sec hot reload, automatic)
Test at localhost:5173
        ↓ (looks good)
npx wrangler deploy
        ↓ (~30 sec)
Share live URL with team / demo to judges
```

**Windows ARM64** (no local dev):
```
Edit src/server.ts → save
        ↓
npx wrangler deploy  (~30 sec)
        ↓
Test on live URL
        ↓
Repeat
```

---

## Extending your agent

Once `queryDatabase` is working, extend from here:

**Add more tools** — each tool is a function the agent can call. Keep them focused:
```typescript
// Example: a tool that formats a care plan for coordinator review
formatCarePlan: tool({
  description: "Format a structured care plan for coordinator review and approval.",
  inputSchema: z.object({
    patientName: z.string(),
    barriers: z.array(z.string()),
    recommendations: z.array(z.string()),
  }),
  execute: async ({ patientName, barriers, recommendations }) => {
    return { patientName, barriers, recommendations, status: "pending_approval" };
  },
}),
```

**Human-in-the-loop** — remove `execute` and add `needsApproval` to make the agent pause and show a confirmation dialog before running a tool:
```typescript
sendOutreach: tool({
  description: "Send an outreach message to a patient care coordinator.",
  inputSchema: z.object({
    patientId: z.string(),
    message: z.string(),
  }),
  // No execute function = requires human confirmation in the UI
}),
```

**Connect to Cloudflare Builds (optional)** — for auto-deploy on every git push:
1. Cloudflare dashboard → Workers & Pages → your worker → Settings → Builds
2. Connect your GitHub fork, set root directory to your agent folder
3. Every `git push` triggers a redeploy automatically

---

## Common issues

| Problem | Fix |
|---|---|
| `npm run dev` fails on Windows ARM64 | Expected — skip to Step 5, use deploy-to-test loop |
| Tool not being called by the agent | Make the description more explicit: "Call this tool whenever you need patient data" |
| Raw JSON showing in chat | Add "never show raw JSON, always format as a table" to the system prompt |
| `wrangler deploy` auth error | Run `npx wrangler login` first — opens browser auth |
| Workers AI slow to respond | Normal on free tier — fine for demos, not a bug |
| Need to roll back a bad deploy | `git revert HEAD && npx wrangler deploy` |

---

## If setup takes more than 20 minutes

Pivot to the local Python or TypeScript path (`examples/python/` or `examples/typescript/`). A working terminal agent demoed well beats a broken live URL. You can return to Cloudflare once your agent logic is solid.
