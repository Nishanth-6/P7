# Data Dictionary

117 synthetic patients (Synthea). 252,607 total rows across 13 files. All linked by patient ID.

**Start here:** `patient_summary` — one row per patient, pre-joined. Sort by `ed_inpatient_total_cost DESC` to find the high-utilizers immediately.

---

## patient_summary (view / CSV)

Pre-joined starting point. One row per patient.

| Column | Description |
|---|---|
| id | Patient UUID (join key — same as PATIENT in other tables) |
| first, last | Name |
| birthdate, age | Demographics |
| gender, race, ethnicity | Demographics |
| income | Annual household income estimate |
| city, state, zip | Location |
| total_visits | Total encounter count across all types |
| ed_visits | Count of emergency department visits |
| inpatient_visits | Count of inpatient admissions |
| total_cost | Total cost across all encounters |
| ed_inpatient_cost | Cost of ED + inpatient encounters only |
| ed_inpatient_total_cost | Alias for ed_inpatient_cost — use this for ranking |
| chronic_condition_count | Number of currently active conditions (STOP is null) |
| has_active_careplan | 1 if at least one active care plan exists, else 0 |
| ed_inpatient_visits | ed_visits + inpatient_visits |

**Starter queries:**
```sql
-- Top 10 most expensive patients
SELECT first, last, ed_inpatient_total_cost, ed_visits, inpatient_visits, chronic_condition_count
FROM patient_summary
ORDER BY ed_inpatient_total_cost DESC
LIMIT 10;

-- Patients with ED visits and NO active care plan
SELECT first, last, ed_visits, chronic_condition_count
FROM patient_summary
WHERE ed_visits > 0 AND has_active_careplan = 0
ORDER BY ed_visits DESC;
```

---

## patients

117 rows. One per patient.

Key columns: `Id` (UUID), `FIRST`, `LAST`, `BIRTHDATE`, `GENDER`, `RACE`, `ETHNICITY`, `INCOME`, `CITY`, `STATE`, `ZIP`, `LAT`, `LON`

Join key: `Id` = `PATIENT` in most other tables.

> **⚠️ Synthea quirk: names have numeric suffixes.**
> Real values look like `Lindsay928 Brekke496`, not `Lindsay Brekke`. This means `WHERE first = 'Lindsay'` returns nothing. Always use `LIKE` with `LOWER()`:
> ```sql
> WHERE LOWER(first) LIKE LOWER('%lindsay%') AND LOWER(last) LIKE LOWER('%brekke%')
> ```
> Your agent should expect dirty input and adapt — this is a real-world data hygiene problem you'll see in actual healthcare data. The hackathon guide's `lookupPatient` specialist Worker handles it via token-splitting; you can do the same.

> **🎨 Bonus columns for creative demos.** These aren't in `patient_summary` but they're rich material:
> - `INCOME` — annual household income. Filter to under-resourced patients, layer with SDOH flags, find the most vulnerable cohort
> - `LAT` / `LON` — every patient has lat/lon coordinates. **Plot them on a map** (Leaflet, Mapbox, etc.) with risk level color-coding. Visually striking demo. Organizations table has lat/lon too — show care deserts.
> - `RACE` / `ETHNICITY` — health equity analysis: are barriers concentrated in specific demographics?
> - `BIRTHDATE` — cohort by age bracket. Compare elderly vs working-age cost patterns.
> - `HEALTHCARE_EXPENSES` / `HEALTHCARE_COVERAGE` — patient-level lifetime spend vs what insurance covered. Different lens than `claims_transactions`.
> - `CITY` / `ZIP` — geographic clustering. The dataset is Massachusetts-heavy, so neighborhood-level patterns are visible.

---

## encounters

8,316 rows. Every healthcare interaction.

Key columns: `Id`, `PATIENT`, `START`, `STOP`, `ENCOUNTERCLASS`, `DESCRIPTION`, `BASE_ENCOUNTER_COST`, `TOTAL_CLAIM_COST`, `PAYER`

**`ENCOUNTERCLASS` values:**
- `emergency` — ED visit
- `inpatient` — Hospital admission
- `ambulatory` — Scheduled outpatient visit (primary care, specialist)
- `urgentcare` — Urgent care walk-in
- `wellness` — Annual checkup, preventive
- `outpatient` — Outpatient procedure

```sql
-- ED visits by patient (cost breakdown)
SELECT PATIENT, COUNT(*) AS ed_visits, SUM(TOTAL_CLAIM_COST) AS ed_cost
FROM encounters
WHERE ENCOUNTERCLASS = 'emergency'
GROUP BY PATIENT
ORDER BY ed_cost DESC
LIMIT 10;
```

---

## conditions

4,023 rows. Diagnosed conditions AND social determinants (SDOH).

Key columns: `START`, `STOP`, `PATIENT`, `ENCOUNTER`, `CODE`, `DESCRIPTION`

**Active conditions:** `STOP IS NULL` (no end date = still active)

**SDOH conditions to look for** (search DESCRIPTION for these terms):
- `Stress` — social stress
- `Unemployed`, `full-time employment` — employment status
- `Limited social contact`
- `Intimate partner abuse`
- `Criminal record`
- `Housing unsatisfactory`, `Homeless`
- `Refugee`
- `Education`
- `transportation` — lack of transport access

```sql
-- All active SDOH conditions for a patient
SELECT DESCRIPTION, START
FROM conditions
WHERE PATIENT = 'PATIENT_UUID_HERE'
  AND STOP IS NULL
  AND (
    DESCRIPTION LIKE '%stress%' OR
    DESCRIPTION LIKE '%employ%' OR
    DESCRIPTION LIKE '%housing%' OR
    DESCRIPTION LIKE '%transport%' OR
    DESCRIPTION LIKE '%food%' OR
    DESCRIPTION LIKE '%social contact%'
  );
```

---

## medications

5,860 rows. Prescriptions.

Key columns: `START`, `STOP`, `PATIENT`, `ENCOUNTER`, `CODE`, `DESCRIPTION`, `BASE_COST`, `TOTALCOST`, `DISPENSES`, `REASONDESCRIPTION`

**Active medications:** `STOP IS NULL`

**Opioid signal:** `DESCRIPTION LIKE '%opioid%' OR DESCRIPTION LIKE '%hydrocodone%' OR DESCRIPTION LIKE '%oxycodone%' OR DESCRIPTION LIKE '%fentanyl%' OR DESCRIPTION LIKE '%morphine%'`

```sql
-- Count active medications per patient (polypharmacy signal)
SELECT PATIENT, COUNT(*) AS active_med_count
FROM medications
WHERE STOP IS NULL
GROUP BY PATIENT
HAVING active_med_count >= 5
ORDER BY active_med_count DESC;
```

---

## observations

86,634 rows. Lab values, vitals, pain scores, and PRAPARE social screenings.

Key columns: `DATE`, `PATIENT`, `ENCOUNTER`, `CODE`, `DESCRIPTION`, `VALUE`, `UNITS`, `TYPE`

**PRAPARE screening questions** (filter DESCRIPTION for these):
- `Housing status` — response: Own, Rent, Someone else's house, Homeless
- `Are you worried about losing your housing?` — Yes/No
- `Do you have a car or can you get a ride in a car?` — Yes/No
- `In the past year, have you or any family members... had problems getting enough food?` — Never/Sometimes/Often
- `What is your current work situation?` — Employed/Unemployed/etc.
- `Stress level` — Not at all / A little / Somewhat / Quite a bit / Very much

```sql
-- PRAPARE responses for a patient
SELECT DATE, DESCRIPTION, VALUE
FROM observations
WHERE PATIENT = 'PATIENT_UUID_HERE'
  AND DESCRIPTION IN (
    'Housing status',
    'Are you worried about losing your housing?',
    'Do you have a car or can you get a ride in a car?',
    'Stress level'
  )
ORDER BY DATE DESC;
```

---

## procedures

20,322 rows. Clinical procedures performed.

Key columns: `DATE`, `PATIENT`, `ENCOUNTER`, `CODE`, `DESCRIPTION`, `BASE_COST`, `REASONDESCRIPTION`

Useful for gap detection — look for **missing** screenings:
- Depression screening: `DESCRIPTION LIKE '%depression%screening%'`
- Substance use assessment: `DESCRIPTION LIKE '%substance%'`
- Medication reconciliation: `DESCRIPTION LIKE '%medication reconciliation%'`

```sql
-- Patients who have never had a depression screening
SELECT id FROM patients
WHERE id NOT IN (
  SELECT DISTINCT PATIENT FROM procedures
  WHERE DESCRIPTION LIKE '%depression%screening%'
);
```

---

## claims_transactions

121,448 rows. Line-item financial data.

Key columns: `ID`, `CLAIMID`, `PATIENTID`, `CHARGEID`, `FROMDATE`, `AMOUNT`, `PAYMENT`, `OUTSTANDING`, `PAYMENTMETHOD`

**IMPORTANT JOIN KEY:** This table uses `PATIENTID` (not `PATIENT`) to link to the patient. Every other table uses `PATIENT`.

`OUTSTANDING = AMOUNT - PAYMENT` — outstanding balance owed by patient.

```sql
-- Total outstanding medical debt by patient
SELECT PATIENTID, SUM(OUTSTANDING) AS total_outstanding
FROM claims_transactions
WHERE OUTSTANDING > 0
GROUP BY PATIENTID
ORDER BY total_outstanding DESC
LIMIT 10;
```

---

## careplans

401 rows. Care plans.

Key columns: `Id`, `START`, `STOP`, `PATIENT`, `ENCOUNTER`, `CODE`, `DESCRIPTION`, `REASONCODE`, `REASONDESCRIPTION`

**Active care plans:** `STOP IS NULL`

A patient with multiple chronic conditions and no active care plan is a major risk signal.

---

## payer_transitions

4,811 rows. Insurance coverage history over time.

Key columns: `Id`, `PATIENT`, `MEMBERID`, `START_YEAR`, `END_YEAR`, `PAYER`, `SECONDARY_PAYER`, `OWNERSHIP`

Useful for identifying coverage gaps and insurance instability.

---

## organizations / providers / payers

Reference tables. 274 organizations, 274 providers, 10 payers. Useful for breakdowns by facility or insurance type, but not essential for the core agent prompts.

---

## Key gotchas

1. **claims_transactions uses PATIENTID, not PATIENT** — this is the most common join error
2. **Active records = STOP IS NULL** — applies to conditions, medications, careplans
3. **patient_summary.id = patients.Id = encounters.PATIENT** — same UUID, different column names
4. **SDOH is in two places** — conditions.csv (categorical diagnosis) and observations.csv (PRAPARE survey responses)
5. **Queries auto-limited to 500 rows** by the API if you don't add your own LIMIT — add explicit LIMITs for large scans
