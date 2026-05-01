# UIC INFORMS Hackathon — Build with Claude: Agents for Healthcare
## May 1, 2026 | UIC College of Business

You are helping a team of business students build an AI agent for a 2-hour healthcare hackathon. You have full access to the repo. Read the docs and examples before writing code.

---

## The single most important thing

The patient dataset is live and publicly queryable. No setup needed:

```bash
curl -X POST https://uic-hackathon-data.christian-7f4.workers.dev/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT first, last, ed_inpatient_total_cost FROM patient_summary ORDER BY ed_inpatient_total_cost DESC LIMIT 5"}'
```

Only SELECT is allowed. Returns `{ "success": true, "results": [...] }`.

---

## The three challenge prompts

**Prompt 1 — The Preventable Visit Detector**
Find patients at highest risk of an avoidable ED visit. Score them using clinical (conditions, meds, no care plan) AND social (SDOH, financial barriers) factors. Draft outreach for a coordinator to approve.
Pattern: Filter → Score → Rank → Recommend → Human reviews

**Prompt 2 — The Cost Explainer**
Conversational agent for a care manager to interrogate why a patient is expensive and which costs are reducible.
Pattern: Human asks → Agent queries → Presents findings → Human digs deeper

**Prompt 3 — The Care Barrier Agent**
Analyze a patient's full record. Identify barriers (financial, social, logistical). Generate a barrier-informed care plan for a coordinator to review and personalize.
Pattern: Pull profile → Identify barriers → Check care gaps → Generate plan → Human edits

Full prompts: `Hackathon/prompts.md`

---

## Database tables

Start with `patient_summary` — one row per patient, pre-joined, sortable by cost.

| Table | Key use |
|---|---|
| `patient_summary` | Start here. ed_inpatient_total_cost, ed_visits, chronic_condition_count, has_active_careplan |
| `encounters` | Filter by ENCOUNTERCLASS: emergency, inpatient, ambulatory, urgentcare, wellness |
| `conditions` | Chronic conditions + SDOH flags. STOP IS NULL = active |
| `medications` | Prescriptions. STOP IS NULL = active. Opioid + polypharmacy signals |
| `observations` | PRAPARE social screenings (housing, food, transport, stress) |
| `procedures` | Care gap detection (missing screenings, med reconciliation) |
| `claims_transactions` | Financial data. JOIN KEY IS PATIENTID (not PATIENT) |
| `careplans` | Active care plans. STOP IS NULL = active |

Full schema: `data/schema.sql` | Full dictionary: `docs/data_dictionary.md`

**Critical gotcha:** `claims_transactions` uses `PATIENTID` as the join key. Every other table uses `PATIENT`.

**Synthea names have numeric suffixes** (`Lindsay928 Brekke496`). Use `LIKE` with `LOWER()`, not `=`. Your agent should handle this gracefully — judges reward that.

**Bonus data for creative demos:** `patients` table has `INCOME`, `LAT`, `LON`, `RACE`, `ETHNICITY`, `HEALTHCARE_EXPENSES`. Use them for map visualizations, health equity analysis, or care desert detection.

---

## Demo patients

| Patient | Why compelling |
|---|---|
| Giovanni385 Paucek755 | $3.4M, 53 inpatient + 6 ED visits, 21 chronic conditions, overdose |
| Chad48 Gerhold939 | $2.8M, 45 inpatient + 1 ED visits, 17 conditions, drug abuse |
| Chantelle310 Oberbrunner298 | $2.5M, 42 inpatient + 8 ED visits, 17 conditions, overdose |
| Lindsay Brekke | 44 ED visits, chronic migraine, NO active care plan |
| Soledad678 White193 | 35 chronic conditions (highest), $276K |

---

## Judging criteria

| Criterion | Weight |
|---|---|
| Problem Framing | 20% |
| Agent Design (multi-step, tool-using, goal-directed) | 25% |
| Human-in-the-Loop (does human input meaningfully change the outcome?) | 20% |
| Data Use | 15% |
| Demo & Storytelling | 20% |

---

## Building the agent

**The pattern:** System prompt + Tools + Loop

The working examples are in `examples/python/agent_example.py` and `examples/typescript/agent_example.ts`. Read one before writing anything.

**For a live web app demo (Cloudflare Workers — free, no API key):**
Scaffold agents-starter into `agent/` inside your fork. See `docs/cloudflare_deploy.md`.
- Edit only `agent/src/server.ts`: system prompt + add `queryDatabase` tool
- The tool POSTs to `https://uic-hackathon-data.christian-7f4.workers.dev/query`
- Workers AI is pre-wired — free, no external API key needed
- Dev loop: `npm run dev` (test locally) → `git push` → Cloudflare auto-deploys in ~30 sec
- Connect GitHub fork to Cloudflare Builds once — every push after that is automatic

**Scope rule:** A narrow agent that runs end-to-end beats an ambitious one that crashes. Build the smallest thing that demonstrates prompt + tools + loop + human decision point.

---

## Key docs in this repo

- `docs/healthcare_primer.md` — MedEx, VBC, ED utilization, SDOH explained
- `docs/data_dictionary.md` — every table, key columns, join keys, gotchas
- `docs/agent_building_guide.md` — the pattern, tool design, HITL, scope tips
- `docs/agent_design_framework.md` — 5 scoping questions students should answer before writing code (where is data? where does work happen? where does human enter? where does product go? where does state persist?)
- `Hackathon/prompts.md` — all 3 prompts in full with data guidance
- `docs/cloudflare_deploy.md` — GitHub → Cloudflare Builds → live URL
- `docs/shepherd_system_prompt.md` — paste into Claude Projects for a no-code fallback
