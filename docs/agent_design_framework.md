# Agent Design Framework

Before you write a single line of code, answer these five questions. Your tool list, architecture, and demo storyline fall out of the answers — and you'll spot the bad design decisions before you've sunk an hour into them.

This is how real engineers scope tools. Your hackathon agent should be designed the same way.

---

## 1. Where is the data?

What does your agent need to read, and where does it live?

| Source | When to use it | Cost | Example |
|---|---|---|---|
| **System prompt (in-context)** | Small, static facts the agent always needs | Cheap, but stale and bloats every call | "$27.9M total costs, 117 patients" |
| **Live tool query (D1)** | Dynamic data that changes per question | One round trip per call | `queryDatabase("SELECT ... patient_summary")` |
| **Specialist Worker** | Multi-step query you'll call many times | One round trip, structured output | `lookupPatient(name)` returns enriched profile |
| **Vector search (Vectorize)** | "Find similar to ___" without exact match | Index upfront, fast at query time | "Patients with cost patterns like Giovanni's" |
| **Cache (KV)** | Slow lookup, results don't change often | Fast reads, manual invalidation | Pre-computed risk scores |

**Heuristic:** Start with live tool queries. Move to specialist Workers once you find yourself running the same 3-query sequence repeatedly. Don't reach for Vectorize unless you genuinely need fuzzy matching.

---

## 2. Where does the work happen?

The model isn't always the right place for everything. Decide for each piece of work:

| Approach | When it's right | When it's wrong |
|---|---|---|
| **Pure code (no AI)** | Deterministic logic — math, lookups, filtering, formatting | Anything requiring judgment or natural language |
| **Single AI agent** | One coherent flow, one persona, < 5 tools | Many specialized sub-tasks crammed into one prompt |
| **Specialist Worker (no AI)** | Focused multi-step query that returns structured data | Anything needing language understanding |
| **Specialist + coordinator (Pattern 2)** | One agent calls a specialist Worker via Service Binding for focused work | Premature abstraction — start single-agent first |
| **Multi-agent ensemble** | Genuinely parallel reasoning streams that aggregate | A 2-hour hackathon |

**Heuristic:** "Could this be deterministic code instead of an LLM call?" If yes, write the code. The model is for judgment and language, not for arithmetic. The hackathon guide chatbot uses a *code-only* specialist Worker (`uic-patient-lookup`) — no LLM in the specialist, just SQL and rules.

**The dangerous default:** Don't make the LLM do work that 10 lines of Python could do better. It's slower, more expensive, and less reliable.

---

## 3. Where does the human enter?

This is worth 20% of your judging score. The pattern matters:

| Pattern | Strength | Demo signal |
|---|---|---|
| **Read-only (no human)** | Investigation, analysis, recommendations only — agent never acts | Weak — judges will ask "but who acts on this?" |
| **Approval gate** | "Approve y/n?" before writing/sending | Bare minimum — passes the bar, doesn't impress |
| **Targeted question** | Agent asks a specific question only a human's local knowledge can answer | Strong — demonstrably changes the next action |
| **Iterative refinement** | Human edits → agent regenerates affected sections | Strongest — feels like real co-authoring |

**Heuristic:** The judges are looking for a moment where the human's input *visibly changes the agent's next action*. If you can't point to that moment in your demo, you don't have human-in-the-loop — you have a confirmation dialog.

**Real example:** "I see Lindsay has transportation flagged. Does she have family who can drive her, or should I recommend medical transport?" → human answers → outreach message changes accordingly. That's the bar.

---

## 4. Where does the product go?

What does your agent actually produce, and where does it land? This is the question most teams skip — and it's why so many hackathon agents feel like demos but not products.

| Destination | When | Tooling |
|---|---|---|
| **Chat response only** | Investigation, exploration | Default — nothing to build |
| **Structured DB record** | Decisions, tasks, audit trail (the closed loop) | Your own D1 + `INSERT` tool |
| **Generated artifact (PDF/markdown)** | Care plans, briefings, outreach letters | Generate text → save to R2 → return URL |
| **Email / notification** | Outreach to a real coordinator | Cloudflare Email Routing or webhook |
| **Callable API endpoint** | Other systems consume your agent's output | Worker route returning JSON |
| **Updated UI component** | Sidebar, dashboard, map populated by tool calls | Client-side tool (no `execute`) — browser handles render |

**Heuristic:** Pick the simplest destination that makes the demo coherent. A chat response says "I recommend X" — fine but ephemeral. A DB record + downloadable PDF says "this is a real workflow product." Judges feel the difference.

**Closed-loop signal:** if your demo can be refreshed and the work persists, you've crossed from chatbot to operating tool. The hackathon guide chatbot demonstrates this — try approving a decision, refresh the page, the audit trail is still there.

---

## 5. Where does state persist?

State = what your agent remembers between turns and between sessions.

| Layer | Persistence | When to use |
|---|---|---|
| **Conversation history** | Across turns, single session | Default in agents-starter (`AIChatAgent`) |
| **Durable Object state** | Across sessions, per-instance | "Resume my investigation tomorrow" — persists in the DO's SQLite |
| **D1 database** | Forever, shared across instances | Decisions, tasks, audit trails, anything queryable |
| **R2 (object storage)** | Forever, file blobs | Generated PDFs, care plans, screenshots |
| **KV (key-value)** | Forever, fast lookup | Cached scores, feature flags |
| **Stateless** | Nothing persists | Pure investigation tools, one-shot queries |

**Heuristic:** Default to stateless. Add state only when the demo requires it. "Refresh the page and the data is still there" is a strong demo moment that justifies the complexity.

---

## A worked example: scoping the Preventable Visit Detector

Apply the framework before writing code:

| Question | Answer |
|---|---|
| **Where is the data?** | Live D1 queries on `patient_summary`, `conditions`, `observations` |
| **Where does the work happen?** | Single AI agent with 3 tools. Risk scoring is *code* (deterministic), not LLM judgment. |
| **Where does the human enter?** | Targeted question: "Lindsay has transport flagged — does she have family support?" Answer changes outreach text. |
| **Where does the product go?** | Approved outreach saved to D1 as a `decisions` row. Optionally write the outreach text to R2 as a markdown file. |
| **Where does state persist?** | D1 for decisions table. Conversation history is automatic. |

Now your tool list writes itself:
1. `query_high_risk_patients` — pure code, returns ranked list
2. `score_patient` — pure code with weights, returns risk level + reasoning
3. `draft_outreach` — LLM-generated text, returns string
4. `record_decision` — writes to D1, returns success
5. (Optional) `save_outreach_pdf` — writes to R2, returns URL

Notice: only ONE of those tools needs an LLM. The others are deterministic code. That's intentional — most of an "AI agent" should be regular code with the LLM doing the judgment-heavy parts.

---

## Common scoping mistakes

**Mistake 1: Making the LLM do math.** "Calculate the risk score" should be deterministic code, not a prompt. The LLM picks the weights once, the code applies them every time.

**Mistake 2: One mega-tool.** A `do_everything_for_this_patient` tool that returns 20 fields. Break it into focused tools: `get_demographics`, `get_conditions`, `get_costs`. Smaller tools = better LLM judgment about what to call.

**Mistake 3: Auto-executing risky actions.** Sending an email, modifying records, creating tasks — these should require human approval. Use `needsApproval` in agents-starter or a confirm prompt in Python.

**Mistake 4: No state.** Demoing a chatbot, calling it an agent. If your demo ends with "and then the coordinator would do X" — that X should be in your agent. Even just persisting the recommendation to a DB row.

**Mistake 5: Premature multi-agent.** "We'll have a risk agent, a barrier agent, and a coordinator agent" — and now you have three system prompts to debug. Start with one. Split only when one is genuinely doing too much.

---

## The one-page worksheet

Before your team writes any code, fill this in on a whiteboard:

```
PROMPT (1, 2, or 3): _______________________________

1. Where is the data?
   → _______________________________________________

2. Where does the work happen?
   → Single agent / Specialist + coordinator / Multi-agent
   → Which work is deterministic code (not LLM)? ____

3. Where does the human enter?
   → _______________________________________________
   → What specific question will the human answer? __

4. Where does the product go?
   → Chat / D1 record / R2 artifact / Email / API
   → After your demo refresh, what's still there? __

5. Where does state persist?
   → Stateless / DO / D1 / R2 / KV

TOOL LIST (write these, they don't exist yet):
   1. _______________  (LLM or code? ___)
   2. _______________  (LLM or code? ___)
   3. _______________  (LLM or code? ___)
```

If you can fill this in, you have an agent design. If you can't, you have a chatbot.
