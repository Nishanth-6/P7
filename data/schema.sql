-- UIC Healthcare Hackathon — D1 Database Schema
-- Synthea synthetic patient records: 117 patients

-- ─────────────────────────────────────────────
-- Core tables
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS patients (
  Id          TEXT PRIMARY KEY,
  BIRTHDATE   TEXT,
  DEATHDATE   TEXT,
  SSN         TEXT,
  DRIVERS     TEXT,
  PASSPORT    TEXT,
  PREFIX      TEXT,
  FIRST       TEXT,
  MIDDLE      TEXT,
  LAST        TEXT,
  SUFFIX      TEXT,
  MAIDEN      TEXT,
  MARITAL     TEXT,
  RACE        TEXT,
  ETHNICITY   TEXT,
  GENDER      TEXT,
  BIRTHPLACE  TEXT,
  ADDRESS     TEXT,
  CITY        TEXT,
  STATE       TEXT,
  COUNTY      TEXT,
  FIPS        TEXT,
  ZIP         TEXT,
  LAT         REAL,
  LON         REAL,
  HEALTHCARE_EXPENSES REAL,
  HEALTHCARE_COVERAGE REAL,
  INCOME      INTEGER
);

CREATE TABLE IF NOT EXISTS encounters (
  Id                  TEXT PRIMARY KEY,
  START               TEXT,
  STOP                TEXT,
  PATIENT             TEXT,
  ORGANIZATION        TEXT,
  PROVIDER            TEXT,
  PAYER               TEXT,
  ENCOUNTERCLASS      TEXT,   -- emergency | inpatient | ambulatory | urgentcare | wellness | outpatient
  CODE                TEXT,
  DESCRIPTION         TEXT,
  BASE_ENCOUNTER_COST REAL,
  TOTAL_CLAIM_COST    REAL,
  PAYER_COVERAGE      REAL,
  REASONCODE          TEXT,
  REASONDESCRIPTION   TEXT
);

CREATE TABLE IF NOT EXISTS conditions (
  START       TEXT,
  STOP        TEXT,           -- NULL = still active
  PATIENT     TEXT,
  ENCOUNTER   TEXT,
  SYSTEM      TEXT,
  CODE        TEXT,
  DESCRIPTION TEXT
);

CREATE TABLE IF NOT EXISTS medications (
  START           TEXT,
  STOP            TEXT,       -- NULL = still active
  PATIENT         TEXT,
  PAYER           TEXT,
  ENCOUNTER       TEXT,
  CODE            TEXT,
  DESCRIPTION     TEXT,
  BASE_COST       REAL,
  PAYER_COVERAGE  REAL,
  DISPENSES       INTEGER,
  TOTALCOST       REAL,
  REASONCODE      TEXT,
  REASONDESCRIPTION TEXT
);

CREATE TABLE IF NOT EXISTS observations (
  DATE        TEXT,
  PATIENT     TEXT,
  ENCOUNTER   TEXT,
  CATEGORY    TEXT,
  CODE        TEXT,
  DESCRIPTION TEXT,
  VALUE       TEXT,
  UNITS       TEXT,
  TYPE        TEXT
);

CREATE TABLE IF NOT EXISTS procedures (
  START           TEXT,
  STOP            TEXT,
  PATIENT         TEXT,
  ENCOUNTER       TEXT,
  SYSTEM          TEXT,
  CODE            TEXT,
  DESCRIPTION     TEXT,
  BASE_COST       REAL,
  REASONCODE      TEXT,
  REASONDESCRIPTION TEXT
);

CREATE TABLE IF NOT EXISTS claims_transactions (
  ID              TEXT PRIMARY KEY,
  CLAIMID         TEXT,
  CHARGEID        INTEGER,
  PATIENTID       TEXT,       -- NOTE: join key is PATIENTID (not PATIENT) in this table
  TYPE            TEXT,
  AMOUNT          REAL,
  METHOD          TEXT,
  FROMDATE        TEXT,
  TODATE          TEXT,
  PLACEOFSERVICE  TEXT,
  PROCEDURECODE   TEXT,
  MODIFIER1       TEXT,
  MODIFIER2       TEXT,
  DIAGNOSISREF1   TEXT,
  DIAGNOSISREF2   TEXT,
  DIAGNOSISREF3   TEXT,
  DIAGNOSISREF4   TEXT,
  UNITS           INTEGER,
  DEPARTMENTID    INTEGER,
  NOTES           TEXT,
  UNITAMOUNT      REAL,
  TRANSFEROUTID   TEXT,
  TRANSFERTYPE    TEXT,
  PAYMENTS        REAL,
  ADJUSTMENTS     REAL,
  TRANSFERS       REAL,
  OUTSTANDING     REAL,
  APPOINTMENTID   TEXT,
  LINENOTE        TEXT,
  PATIENTINSURANCEID TEXT,
  FEESCHEDULEID   INTEGER,
  PROVIDERID      TEXT,
  SUPERVISINGPROVIDERID TEXT
);

CREATE TABLE IF NOT EXISTS careplans (
  Id              TEXT,
  START           TEXT,
  STOP            TEXT,       -- NULL = still active
  PATIENT         TEXT,
  ENCOUNTER       TEXT,
  CODE            TEXT,
  DESCRIPTION     TEXT,
  REASONCODE      TEXT,
  REASONDESCRIPTION TEXT
);

CREATE TABLE IF NOT EXISTS payer_transitions (
  PATIENT         TEXT,
  MEMBERID        TEXT,
  START_DATE      TEXT,
  END_DATE        TEXT,
  PAYER           TEXT,
  SECONDARY_PAYER TEXT,
  PLAN_OWNERSHIP  TEXT,
  OWNER_NAME      TEXT
);

CREATE TABLE IF NOT EXISTS organizations (
  Id      TEXT PRIMARY KEY,
  NAME    TEXT,
  ADDRESS TEXT,
  CITY    TEXT,
  STATE   TEXT,
  ZIP     TEXT,
  LAT     REAL,
  LON     REAL,
  PHONE   TEXT,
  REVENUE REAL,
  UTILIZATION INTEGER
);

CREATE TABLE IF NOT EXISTS providers (
  Id              TEXT PRIMARY KEY,
  ORGANIZATION    TEXT,
  NAME            TEXT,
  GENDER          TEXT,
  SPECIALITY      TEXT,
  ADDRESS         TEXT,
  CITY            TEXT,
  STATE           TEXT,
  ZIP             TEXT,
  LAT             REAL,
  LON             REAL,
  ENCOUNTERS      INTEGER,
  PROCEDURES      INTEGER
);

CREATE TABLE IF NOT EXISTS payers (
  Id                      TEXT PRIMARY KEY,
  NAME                    TEXT,
  OWNERSHIP               TEXT,
  ADDRESS                 TEXT,
  CITY                    TEXT,
  STATE_HEADQUARTERED     TEXT,
  ZIP                     TEXT,
  PHONE                   TEXT,
  AMOUNT_COVERED          REAL,
  AMOUNT_UNCOVERED        REAL,
  REVENUE                 REAL,
  COVERED_ENCOUNTERS      INTEGER,
  UNCOVERED_ENCOUNTERS    INTEGER,
  COVERED_MEDICATIONS     INTEGER,
  UNCOVERED_MEDICATIONS   INTEGER,
  COVERED_PROCEDURES      INTEGER,
  UNCOVERED_PROCEDURES    INTEGER,
  COVERED_IMMUNIZATIONS   INTEGER,
  UNCOVERED_IMMUNIZATIONS INTEGER,
  UNIQUE_CUSTOMERS        INTEGER,
  QOLS_AVG                REAL,
  MEMBER_MONTHS           INTEGER
);

-- ─────────────────────────────────────────────
-- patient_summary view (pre-joined starting point)
-- ─────────────────────────────────────────────

CREATE VIEW IF NOT EXISTS patient_summary AS
SELECT
  p.Id                                                          AS id,
  p.FIRST                                                       AS first,
  p.LAST                                                        AS last,
  p.BIRTHDATE                                                   AS birthdate,
  CAST(
    (strftime('%Y', 'now') - strftime('%Y', p.BIRTHDATE))
  AS INTEGER)                                                   AS age,
  p.GENDER                                                      AS gender,
  p.RACE                                                        AS race,
  p.ETHNICITY                                                   AS ethnicity,
  p.INCOME                                                      AS income,
  p.CITY                                                        AS city,
  p.STATE                                                       AS state,
  p.ZIP                                                         AS zip,

  -- Visit counts
  COUNT(DISTINCT e.Id)                                          AS total_visits,
  COUNT(DISTINCT CASE WHEN e.ENCOUNTERCLASS = 'emergency'  THEN e.Id END) AS ed_visits,
  COUNT(DISTINCT CASE WHEN e.ENCOUNTERCLASS = 'inpatient'  THEN e.Id END) AS inpatient_visits,
  COUNT(DISTINCT CASE WHEN e.ENCOUNTERCLASS = 'emergency'
                        OR e.ENCOUNTERCLASS = 'inpatient'  THEN e.Id END) AS ed_inpatient_visits,

  -- Costs
  ROUND(SUM(e.TOTAL_CLAIM_COST), 2)                             AS total_cost,
  ROUND(SUM(CASE WHEN e.ENCOUNTERCLASS IN ('emergency','inpatient')
                 THEN e.TOTAL_CLAIM_COST ELSE 0 END), 2)        AS ed_inpatient_cost,
  ROUND(SUM(CASE WHEN e.ENCOUNTERCLASS IN ('emergency','inpatient')
                 THEN e.TOTAL_CLAIM_COST ELSE 0 END), 2)        AS ed_inpatient_total_cost,

  -- Clinical flags
  (SELECT COUNT(*) FROM conditions c
   WHERE c.PATIENT = p.Id AND c.STOP IS NULL)                   AS chronic_condition_count,
  (SELECT CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END
   FROM careplans cp WHERE cp.PATIENT = p.Id AND cp.STOP IS NULL) AS has_active_careplan

FROM patients p
LEFT JOIN encounters e ON e.PATIENT = p.Id
GROUP BY p.Id, p.FIRST, p.LAST, p.BIRTHDATE, p.GENDER, p.RACE,
         p.ETHNICITY, p.INCOME, p.CITY, p.STATE, p.ZIP;

-- ─────────────────────────────────────────────
-- Indexes for common query patterns
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_encounters_patient       ON encounters(PATIENT);
CREATE INDEX IF NOT EXISTS idx_encounters_class         ON encounters(ENCOUNTERCLASS);
CREATE INDEX IF NOT EXISTS idx_conditions_patient       ON conditions(PATIENT);
CREATE INDEX IF NOT EXISTS idx_conditions_stop          ON conditions(STOP);
CREATE INDEX IF NOT EXISTS idx_medications_patient      ON medications(PATIENT);
CREATE INDEX IF NOT EXISTS idx_medications_stop         ON medications(STOP);
CREATE INDEX IF NOT EXISTS idx_observations_patient     ON observations(PATIENT);
CREATE INDEX IF NOT EXISTS idx_procedures_patient       ON procedures(PATIENT);
CREATE INDEX IF NOT EXISTS idx_claims_patientid         ON claims_transactions(PATIENTID);
CREATE INDEX IF NOT EXISTS idx_careplans_patient        ON careplans(PATIENT);
