# Tradeoffs - Things Deliberately Not Built

Three things I chose not to build, and why.

---

## 1. Deduplication on re-ingestion

**What it is**: If a client uploads the same SAP export twice (or uploads overlapping billing periods for utility data), the system currently creates duplicate emission records. There's no check for `source_ref` collisions.

**Why I didn't build it**:

Deduplication requires a decision about what "duplicate" means  and that decision is domain-specific in ways that need PM input. For SAP: does re-uploading the same document number mean replace-in-place or flag-and-hold? For utility: does an overlapping billing period mean the vendor corrected an error, or the analyst uploaded the wrong file? For travel: Concur allows expense report amendments, so the same trip ID can legitimately appear twice with different amounts.

Getting this wrong (e.g., automatically overwriting an approved record with a re-upload) would be an audit integrity failure. The safe default is: create a new ingestion, let the analyst see both, and decide.

**What production needs**: A deduplication policy per source type, configurable per client. UI showing "this source_ref was previously ingested in Ingestion #X — override?" The data model already supports this (source_ref is indexed-friendly), so adding the check is a contained change.

---

## 2. Time-series visualization and trend analysis

**What it is**: Charts showing emissions over time by scope, source, category. Month-over-month variance alerts. Rolling 12-month totals for Scope 1/2/3. The kind of output that goes into a sustainability report.

**Why I didn't build it**:

The assignment is about ingestion and review, not reporting. The priority is: get data in cleanly, get analysts to sign off, lock for audit. Trend analysis is downstream of having reliable, approved data. Building charts before the data quality layer is solid is backwards  you'd be visualizing noise.

The dashboard summary (approved CO2e totals by scope) gives analysts the aggregate they need during review. A reporting layer is a separate product concern.

**What production needs**: A separate reporting module with Recharts/D3, date range selectors, export to PDF/CSV for sustainability report input. This is a well-understood UI problem once the data model is settled. The scope/source breakdown endpoints already return the right data shape; they need range parameters added.

---

## 3. Automated emission factor updates

**What it is**: When DESNZ publishes their annual conversion factors update (typically June each year), all historical records should be recalculated, or at minimum flagged for re-review, using the new factors.

**Why I didn't build it**:

This is a data governance problem, not an engineering problem. The decision of whether to retroactively recalculate approved records  and whether that triggers a new audit cycle is something that needs to be agreed with auditors before you implement it. Different carbon accounting standards (GHG Protocol, ISO 14064, CDP) have different rules about factor vintage.

More practically: recalculating approved records requires a migration strategy, a new audit trail event type, and potentially re-opening records the analyst signed off on. Without knowing the client's auditor requirements, implementing this would be guessing at a standard.

**What the data model enables**: `emission_factor` and `emission_factor_source` are stored per record, not looked up at query time. This means historical records are stable — the factor used is always retrievable. Adding a "recalculate with new factors" batch job is a contained operation once the policy is defined.

**What I'd ask the PM**: "When DESNZ updates, does the client want us to recalculate historical records, or are those locked at the factor vintage in effect at ingestion time? What does their auditor say?"
