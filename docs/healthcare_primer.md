# Healthcare Primer for Business Students

You don't need clinical knowledge to do well today. You need to understand the *economic* and *operational* problems. Here's what matters.

---

## The core problem: $4.5 trillion/year

The U.S. spends ~$4.5 trillion/year on healthcare. A huge share is waste. Not fraud — waste. The wrong care at the wrong time in the wrong setting.

The two biggest drivers:

**1. Chronic conditions escalating into acute events.** A patient with diabetes who can't get to their primary care doctor ends up in the ED with a foot infection. A patient with hypertension who ran out of medication has a stroke. These are preventable. They're also enormously expensive — one inpatient admission costs more than a year of preventive primary care.

**2. Care coordination failures.** Patients fall through the cracks between providers, insurers, and systems. Nobody knows who's responsible for following up. Patients don't know what resources are available to them. The system has no mechanism to find people before they hit a crisis.

---

## Value-Based Care (VBC)

In traditional fee-for-service healthcare, providers get paid per visit, per test, per procedure. More care = more revenue. There's no incentive to prevent visits.

In **value-based care**, a provider gets a fixed payment per patient per year (a "capitation" payment). They keep what they don't spend on medical costs. Now the incentives flip: *preventing* a hospitalization saves money.

Hopscotch Primary Care (who organized this event) operates under value-based care. Every avoidable ED visit or hospitalization is money that should have gone to prevention.

**For your agent:** The economic framing is: if your agent prevents one inpatient admission (~$30K average cost in this dataset), it has paid for itself many times over.

---

## ED Utilization and Why It Matters

~145 million ED visits/year in the U.S. A significant share are "avoidable" — conditions that could have been treated in a primary care setting if the patient had been reached in time.

**Avoidable ED conditions** (called ACSCs — Ambulatory Care-Sensitive Conditions):
- Diabetes complications (A1c out of control, foot infections)
- Hypertension (uncontrolled, crisis)
- Asthma/COPD exacerbations
- Heart failure (fluid overload, missed medication)
- UTIs (escalated to sepsis)
- Substance use (overdose, withdrawal)

In the dataset: 97 of 117 patients have at least one ED visit. 3 patients account for $8.7M in ED + inpatient costs. That concentration is real — a small number of high-utilization patients drive a disproportionate share of costs.

---

## Social Determinants of Health (SDOH)

Clinical factors explain part of why patients end up in the ED. Social factors often explain more.

A patient who is **food insecure** can't manage diabetes well. A patient with **no transportation** can't make it to follow-up appointments. A patient in **unstable housing** has nowhere to store medications. A patient experiencing **intimate partner violence** can't prioritize preventive care.

These aren't side issues — they're primary drivers of health outcomes.

**In the dataset (two sources):**

*conditions.csv* — 13 SDOH types flagged as medical conditions:
- Stress (social)
- Unemployment / full-time employment
- Limited social contact
- Intimate partner abuse
- Criminal record
- Housing unsatisfactory / Homeless
- Refugee status
- Education below high school diploma
- Lack of access to transportation

*observations.csv* — PRAPARE screening responses (11 questions):
- Housing status and housing insecurity
- Food insecurity
- Transportation barriers
- Employment status
- Education level
- Incarceration history
- Social connectedness
- Safety at home
- Migrant/seasonal worker status
- Stress level

**For your agent:** These are already in the data. You don't need an external dataset. Filter `conditions.csv` for rows where the DESCRIPTION contains "Stress", "employment", "housing", "transport", etc. Or query `observations.csv` for PRAPARE screening responses.

---

## Key clinical concepts

**Chronic condition:** A long-term health condition that doesn't go away — diabetes, hypertension, COPD, heart failure, depression. In the dataset, these are rows in `conditions.csv` where `STOP` is blank (still active).

**Care plan:** A documented plan for managing a patient's conditions — goals, medications, follow-up schedule. In the dataset, `careplans.csv` with `STOP` blank = active care plan. A patient with multiple chronic conditions and NO active care plan is a major red flag.

**Polypharmacy:** Taking 5+ medications simultaneously. Risk of drug interactions increases. Adherence decreases. In the dataset, 25 patients are on 5+ active meds; 4 are on 10+.

**Medication adherence:** Whether a patient actually takes their medications as prescribed. Opioids + ED frequent flyers = a pattern worth flagging. 21 patients in the dataset are on opioids; 19 are also ED frequent flyers.

**Readmission:** Returning to the hospital within 30 days of discharge. Expensive, often preventable, and a marker of failed care transitions.

---

## The connection between the two themes

Medical expenditure reduction and ED hospitalization reduction are the same problem at different altitudes.

Avoidable ED utilization is one of the largest single drivers of medical expenditure. An agent that prevents an ED visit has reduced medical spend. This framing is important when you're building your story:

*"We built an agent that identifies patients likely to have a preventable ED visit in the next 30 days. For each patient, it drafts an intervention for a coordinator to review. Each prevented visit saves $3,000–$30,000 depending on whether it would have converted to an inpatient admission."*

That's a healthcare problem AND a business problem. Both are relevant to your judges.
