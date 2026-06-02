# Data Model — Breathe ESG Emissions Ingestion Platform

## Overview

The model is designed around four concerns: multi-tenancy, source traceability, unit normalization, and audit integrity. Every design choice traces back to one of these.

---

## Tables

### `ingestions`

Represents a single upload event from a client. The unit of provenance — every emission record traces back to exactly one ingestion.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| source_type | enum (sap, utility, travel) | Determines which parser runs |
| client_name | text | Tenant discriminator (multi-tenancy via row-level partitioning by name) |
| file_name | text | Original filename for human traceability |
| status | enum (processing, completed, failed) | Processing lifecycle |
| total_rows | integer | Raw row count including failures |
| success_rows | integer | Rows that produced emission records |
| failed_rows | integer | Rows that could not be parsed |
| suspicious_rows | integer | Rows flagged for analyst attention |
| created_at | timestamptz | When the upload arrived |
| completed_at | timestamptz | When parsing finished (null during processing) |

**Why**: An ingestion is not just a log entry — it's the unit analysts use to batch-review data. "What came in from the SAP export on March 15?" is a natural question. The ingestion row answers it.

---

### `ingestion_errors`

Parse failures with enough context to fix the source file.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| ingestion_id | FK → ingestions | |
| row_number | integer | Line number in original file |
| raw_data | text (truncated 1000 chars) | Enough to identify the bad row |
| error_message | text | Human-readable parse failure reason |

**Why**: Silently dropping bad rows is how you miscount emissions. Analysts need to see exactly what failed and why, not just a count.

---

### `emission_records`

The normalized, auditable unit of emissions data. Each row represents one discrete activity with a CO2e value derived from a traceable emission factor.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| ingestion_id | FK → ingestions | Source-of-truth link back to origin |
| source_type | text | sap / utility / travel |
| scope | enum (scope1, scope2, scope3) | GHG Protocol scope classification |
| category | text | Sub-category e.g. `fuel_combustion_diesel`, `purchased_electricity`, `business_travel_flight_economy` |
| client_name | text | Tenant discriminator |
| activity_date | date | ISO date of the activity (not the billing date) |
| activity_description | text | Human-readable description of what happened |
| raw_quantity | numeric(20,6) | Original quantity as parsed, in raw_unit |
| raw_unit | text | Unit as received (L, m3, kWh, km, nights) |
| normalized_quantity_kwh | numeric(20,6) | Energy equivalent in kWh (null for non-energy activities like travel) |
| co2e_kg | numeric(20,6) | Calculated CO2e in kilograms |
| emission_factor | numeric(20,8) | Factor used for the calculation (units: kgCO2e per raw_unit) |
| emission_factor_source | text | Citation: IPCC AR6, DESNZ 2023, HCMI, etc. |
| status | enum (pending, approved, flagged, rejected) | Analyst review state |
| suspicious_flags | text[] | Array of machine-detected anomalies |
| review_note | text | Analyst annotation (optional) |
| reviewed_by | text | Analyst identifier |
| reviewed_at | timestamptz | When review action was taken |
| source_ref | text | Original source identifier (SAP doc number, meter ID + period, trip ID) |
| created_at | timestamptz | |
| updated_at | timestamptz | Auto-updates on every change |

**Why CO2e is stored as numeric not float**: Floating-point rounding errors accumulate across thousands of rows and become audit liabilities. Numeric with explicit precision is the correct choice for financial and regulatory data.

**Why `source_ref` is a string not FK**: Source systems are heterogeneous. SAP document numbers, utility meter IDs, and Concur trip IDs live in different namespaces. A composite string (`SAP:4900012301:1000`) is more flexible and still unique enough for deduplication.

**Why `activity_date` not `billing_date`**: Billing periods (utility) and posting dates (SAP) don't align to calendar months. For emissions aggregation by period, you need the activity date — the date the energy was actually consumed, not when it was invoiced. For utilities with billing period ranges, we use the midpoint.

---

### `audit_log`

Immutable record of every state change to every record and every ingestion event.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| record_id | FK → emission_records (nullable) | Null for ingestion-level events |
| ingestion_id | FK → ingestions (nullable) | Null for record-level events |
| action | text | e.g. `record_approved`, `record_flagged`, `ingestion_completed` |
| actor | text | Who performed the action (analyst name/id) |
| previous_value | text | Prior state (for status changes) |
| new_value | text | New state |
| note | text | Analyst comment at time of action |
| created_at | timestamptz | Immutable — no updated_at |

**Why**: Auditors need to answer: "Who approved this, when, and why?" Without an audit trail, the answer is always "we don't know." Audit log rows are never updated or deleted.

---

## Multi-Tenancy

Multi-tenancy is implemented via `client_name` on `ingestions` and `emission_records`. This is a pragmatic choice for a prototype:

- No cross-tenant joins possible with a simple `WHERE client_name = ?` filter
- Simple to query and understand
- Scales to tens of clients without schema changes

**What a production system would do**: Add a `tenants` table with a UUID PK, replace `client_name` text with `tenant_id` FK on all tables, enforce row-level security at the Postgres level (RLS policies), and issue per-tenant JWTs. The prototype establishes the field but not the enforcement.

---

## Scope Classification

| Scope | Sources | Categories |
|---|---|---|
| Scope 1 | SAP fuel/procurement | Direct combustion: diesel, petrol, natural gas, LPG, HFO, coal |
| Scope 2 | Utility electricity | Purchased electricity (location-based or market-based) |
| Scope 3 | Corporate travel | Business flights (by class), hotel stays, rail, car rental, ground transport |

Scope is derived from `source_type` at ingestion time (SAP → scope1, utility → scope2, travel → scope3) and stored explicitly on the record. This is correct for the data sources in scope; a more complete system would also handle Scope 3 categories 1 (purchased goods), 4 (upstream transport), 11 (use of sold products), etc.

---

## Emission Factor Sourcing

All factors are stored on the record at time of ingestion, with an explicit citation:

- **SAP/fuel**: IPCC AR6 WG1 / UK DESNZ 2023 Conversion Factors
- **Utility/electricity**: DESNZ 2023 location-based grid averages (by country)
- **Flight**: DESNZ 2023 passenger km factors, including RFI multiplier of 1.9x for high-altitude warming
- **Hotel**: HCMI (Hotel Carbon Measurement Initiative) global average 2023
- **Rail**: DESNZ 2023 National Rail
- **Ground transport/car rental**: DESNZ 2023

Factors are embedded at parse time, not looked up at query time. This ensures historical records remain stable even when factors are updated — an audit requirement.

---

## Unit Normalization

Raw quantities are preserved exactly as parsed. Normalized values (e.g., `normalized_quantity_kwh`) are additive where they make sense. CO2e in kg is the single comparable currency across all sources.

Conversion chain examples:
- Diesel (L) → kgCO2e: `quantity_L × 2.68 kgCO2e/L`
- Natural gas (m³) → kgCO2e: `quantity_m3 × 2.04 kgCO2e/m3`
- Electricity (kWh) → kgCO2e: `quantity_kWh × 0.207 kgCO2e/kWh` (UK grid 2023)
- Flight economy (km) → kgCO2e: `distance_km × 0.1552 kgCO2e/km` (incl. RFI)
