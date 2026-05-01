# Hackathon Challenge Prompts

Three prompts. Five teams per prompt. Pick one at kickoff — you're locked in.

---

## Prompt 1: The Preventable Visit Detector

**The problem**

Many ED visits are for conditions manageable in primary care — if the patient had been reached in time. A care coordinator with 800 patients can't manually review everyone. They need an agent that can find the patients most at risk of an avoidable ED visit and draft a specific, actionable intervention for each one.

**What you're building**

An agent that:
1. Analyzes the patient population to identify those at highest risk of a preventable ED visit
2. Incorporates both clinical factors (chronic conditions, medication non-adherence, care plan gaps) and social factors (SDOH barriers from conditions and observations tables)
3. Ranks patients by risk and explains the reasoning
4. Drafts an outreach recommendation for the coordinator to review
5. Waits for the coordinator to approve, modify, or reject before taking action

**The human-in-the-loop moment**

The coordinator reviews the agent's recommendation and either approves it as-is, edits it with local knowledge ("I know she has a daughter who can drive her — change the transport recommendation"), or rejects it. The coordinator's input should change what happens next.

**Key data**

| Table | What to use it for |
|---|---|
| patient_summary | Start here — sort by ed_visits, filter to has_active_careplan = 0 |
| conditions | Chronic conditions (STOP IS NULL) + SDOH flags |
| observations | PRAPARE screenings (housing, food, transport, stress) |
| careplans | Who has an active care plan vs. gap |
| medications | Opioids, polypharmacy, adherence signals |

**Suggested agent tools**
1. `query_patients` — filter/rank patients by clinical and social risk factors
2. `get_patient_profile` — pull all conditions, SDOH, care plan status for a specific patient
3. `calculate_risk_score` — synthesize clinical + social factors into a risk level
4. `draft_outreach` — generate a coordinator-ready intervention recommendation
5. `confirm_with_coordinator` — present the recommendation and wait for approval (human-in-the-loop)

**Scope tip**

Build the simplest version first: query patients with >3 ED visits and no active care plan. Get the loop working. Then add the SDOH layer. Don't start with a complex risk model — start with something that runs.

---

## Prompt 2: The Cost Explainer

**The problem**

A care manager needs to understand *why* a patient is expensive before they can do anything about it. "Patient X costs $3.4M" is not useful. "Patient X has 63 ED visits driven by substance use, with $2.1M in inpatient costs, $892K in ED costs, $186K in outstanding debt, and no active care plan since 2022" — that's actionable.

**What you're building**

A conversational investigation agent that:
1. Accepts a patient name or ID as input
2. Breaks down costs by encounter type, condition, and time period
3. Identifies which costs look reducible (avoidable ED, missed preventive care, medication management opportunities)
4. Compares to cohort averages where relevant
5. Answers follow-up questions from the care manager to drill deeper

**The human-in-the-loop moment**

The conversation itself is the human-in-the-loop. The care manager steers the investigation — asks follow-up questions, requests different breakdowns, and decides what to act on. The agent should never surface more than the care manager asked for; it should respond to what they're actually investigating.

**Key data**

| Table | What to use it for |
|---|---|
| patient_summary | Cost overview, visit counts |
| encounters | Cost by encounter class and time period |
| claims_transactions | Line-item charges vs. payments vs. outstanding (use PATIENTID) |
| conditions | What conditions are driving utilization |
| medications | Prescription costs, opioid patterns |
| procedures | Procedure-level spend |

**Suggested agent tools**
1. `lookup_patient` — find patient by name or ID
2. `get_cost_breakdown` — costs by encounter type, time range
3. `get_claims_detail` — outstanding balances, payment history from claims_transactions
4. `compare_to_cohort` — how does this patient compare to average?
5. `get_conditions_and_meds` — what clinical factors are driving utilization?
6. `generate_briefing` — produce a summary the care manager can share

**Scope tip**

The multi-turn conversation is technically more demanding than the other prompts. If you're running low on time, scope to: "given a patient ID, produce a full cost analysis in one shot." That's still a real agent — it uses tools, reasons over data, and produces structured output.

**Good demo patients:** Giovanni Paucek ($3.4M, 63 visits), Chad ($2.8M, 46 visits), Chantelle Oberbrunner ($2.5M, 52 visits)

---

## Prompt 3: The Care Barrier Agent

**The problem**

Patients fall through the cracks not because they don't want care, but because barriers — financial, social, logistical — prevent them from accessing it. A coordinator reviewing a chart can see the clinical picture. But the barriers are often invisible in the data, scattered across social conditions, PRAPARE screenings, financial records, and prescription history.

An agent that can synthesize the full picture — clinical + social + financial — and generate a barrier-informed care plan is genuinely useful.

**What you're building**

An agent that:
1. Accepts a patient ID
2. Pulls the patient's full clinical and social profile (conditions, SDOH, medications, care plan status, outstanding debt)
3. Identifies specific barriers: What is this patient dealing with that's making it hard to access care?
4. Checks for preventive care gaps: Missing screenings? No medication reconciliation? No care plan?
5. Generates a barrier-informed care plan that addresses both the clinical and social dimensions
6. Presents the plan to the coordinator for review and personalization

**The human-in-the-loop moment**

The coordinator reviews the plan and personalizes it with knowledge the data can't capture: "I know Maria — her daughter drives her on Tuesdays. Change the transport recommendation to Tuesday afternoon appointments." The coordinator's local knowledge makes the plan better. The agent can't do this alone.

**Key data**

| Table | What to use it for |
|---|---|
| conditions | Active conditions + SDOH flags (housing, employment, transport) |
| observations | PRAPARE responses (most granular social data) |
| medications | Polypharmacy, opioids, adherence signals |
| claims_transactions | Outstanding medical debt (financial barrier) |
| procedures | Missing screenings (care gaps) |
| careplans | Active vs. no plan |

**Suggested agent tools**
1. `get_clinical_profile` — all active conditions, medications, care plan status
2. `get_social_profile` — SDOH conditions + PRAPARE screening responses
3. `get_financial_profile` — outstanding debt from claims_transactions
4. `check_care_gaps` — which screenings and follow-ups are missing
5. `generate_barrier_plan` — synthesize everything into a structured care plan
6. `confirm_with_coordinator` — present plan, accept edits, finalize

**Scope tip**

Start with one patient (Lindsay Brekke — 44 ED visits, no active care plan, chronic migraine). Get the full profile pulling working. Then write the barrier identification logic. Then generate the plan. Don't try to process the whole population until you have it working for one patient.

**Good demo patients:** Lindsay Brekke (no care plan, complex), Soledad White (35 chronic conditions, highest complexity), any patient with outstanding debt + SDOH flags

---

## Shared tips for all prompts

**On human-in-the-loop:** Judges will evaluate whether the human's input *meaningfully changes the outcome*. Don't just add a "confirm? [y/n]" prompt. Ask the coordinator something that only a human with local knowledge could answer, and use that answer to do something different.

**On data exploration:** Start every investigation with `SELECT * FROM patient_summary ORDER BY ed_inpatient_total_cost DESC LIMIT 10`. Know who your outliers are before you build anything.

**On scope:** The agents that work in demos are narrow and deep, not wide and shallow. "An agent that produces a full risk profile for one patient" is better than "an agent that tries to manage the whole population."

**On storytelling:** Your 5-minute demo should have: (1) the problem statement in one sentence, (2) a live agent run with a protagonist patient, (3) the human-in-the-loop moment, (4) the punchline ("this would have prevented X, which costs $Y and leads to Z outcome").

**On dirty data:** Synthea names have numeric suffixes (`Lindsay928 Brekke496`). `WHERE first = 'Lindsay'` returns nothing — you have to use `LIKE` with `LOWER()`. This is intentional friction — real healthcare data is messy too. Your agent (or code design) should handle it gracefully (try-and-adapt is a strong signal of agent design).

**Bonus angles to differentiate your demo:**

- **Map view** — every patient has `LAT` / `LON`. Plot them with risk-level color coding. The hackathon guide's sidebar pattern shows how to populate UI components from agent tool calls — extend it to a Leaflet map. Visually unforgettable.
- **Health equity lens** — `RACE`, `ETHNICITY`, `INCOME` columns let you ask "are SDOH barriers concentrated in specific demographics?" Answer in the demo with real numbers.
- **Care deserts** — `organizations` has `LAT` / `LON` too. Cross-reference patient locations with provider locations. Find patients far from a provider with active SDOH transport flags.
- **Cost trajectories** — `encounters.START` lets you build a timeline. "Patient X's costs accelerated after admission #5" tells a story.
- **Specialist Workers** — Pattern 2 from the agent guide: spin up a focused Worker (like `uic-patient-lookup`) that does one thing well, then have your main agent call it via Service Binding. See `docs/cloudflare_deploy.md` for the pattern.
- **Closed-loop writeback** — most demos are read-only (agent recommends, then nothing). Add your own D1 database to track coordinator decisions and follow-up tasks. After approval, `INSERT INTO decisions ...`; after the agent identifies a next-action, `INSERT INTO tasks ...`. Refresh the UI → the audit trail persists. This is the difference between an agent that *talks* and an agent that *operates*. The hackathon guide chatbot at `https://uic-hackathon-guide.christian-7f4.workers.dev` demonstrates this — try it and watch the sidebar update after you approve a recommendation.
