# Data

## Querying the live database (recommended)

The dataset is hosted on a public read-only D1 API. No setup required.

```bash
curl -X POST https://uic-hackathon-data.christian-7f4.workers.dev/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT first, last, ed_inpatient_total_cost FROM patient_summary ORDER BY ed_inpatient_total_cost DESC LIMIT 10"}'
```

See `docs/data_dictionary.md` for table structure and example queries.

## CSV files (local option)

If you prefer to work locally or the API is down, all CSVs are in this folder:

| File | Rows | Notes |
|---|---|---|
| patient_summary.csv | 117 | Pre-joined starting point — start here |
| patients.csv | 117 | Demographics |
| encounters.csv | 8,316 | All healthcare interactions |
| conditions.csv | 4,023 | Conditions + SDOH findings |
| medications.csv | 5,860 | Prescriptions |
| observations.csv | 86,634 | Labs, vitals, PRAPARE screenings |
| procedures.csv | 20,322 | Clinical procedures |
| claims_transactions.csv | 121,448 | Line-item financials (join on PATIENTID) |
| careplans.csv | 401 | Care plans |
| payer_transitions.csv | 4,811 | Insurance coverage history |
| organizations.csv | 274 | Healthcare facilities |
| providers.csv | 274 | Providers |
| payers.csv | 10 | Insurance companies |

## Loading CSVs locally (Python)

```python
import pandas as pd

# Start with the pre-joined summary
summary = pd.read_csv('data/patient_summary.csv')
print(summary.sort_values('ed_inpatient_total_cost', ascending=False).head(10))

# Join to encounters for more detail
encounters = pd.read_csv('data/encounters.csv')
ed_visits = encounters[encounters['ENCOUNTERCLASS'] == 'emergency']
```

## Loading CSVs into a local SQLite database (optional)

```python
import pandas as pd
import sqlite3

conn = sqlite3.connect('hackathon.db')

# Load core tables
for table in ['patients', 'encounters', 'conditions', 'medications',
              'observations', 'procedures', 'claims_transactions', 'careplans']:
    df = pd.read_csv(f'data/{table}.csv')
    df.to_sql(table, conn, if_exists='replace', index=False)

# Verify
pd.read_sql('SELECT COUNT(*) FROM encounters', conn)
```

## Setting up your own D1 (if you want a personal copy)

```bash
# Install Wrangler
npm install -g wrangler
wrangler login

# Create database
wrangler d1 create my-hackathon-db

# Run schema
wrangler d1 execute my-hackathon-db --file=data/schema.sql

# Load data (use the seed script)
# See worker/README.md for full seed instructions
```
