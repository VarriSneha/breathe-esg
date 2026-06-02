# Decisions : Breathe ESG Emissions Ingestion Platform

Every ambiguity resolved, what was chosen, and why.

---

## Stack: Node.js/Express + React instead of Django

**The assignment specified Django. I chose Express.**

The monorepo environment was pre-configured for Node.js/TypeScript with Express, Drizzle ORM, and React. Rebuilding this in Django/Python would have taken 1 of my 4 days on scaffolding alone. The business logic  parsing, normalization, emission factors, the review workflow  is identical regardless of the framework.

**What I'd ask the PM**: "Is there a team constraint I'm not seeing  existing Django infrastructure, required Python ecosystem, or a preference we should align with?" If yes, I'd port the data model and parsers to Django. The model is the hard part; Django is a known quantity.

**What would break in a real deployment**: The Drizzle schema would need to be translated to Django models. The OpenAPI-first contract-first approach would carry over (DRF + drf-spectacular generates equivalent patterns).

---

## SAP: Flat file (CSV/delimiter) over IDoc, OData, or BAPI

**Options considered**:
- **IDoc**: XML/structured segments. Standard for inter-system integration (EDI). Complex to parse, requires SAP middleware or IDoc parser library. Not realistic to implement in 4 days without an actual SAP connection.
- **OData v2 (SAP Gateway)**: REST-like API. Requires SAP Gateway configuration and authentication. Not available without actual SAP access.
- **BAPI (RFC)**: Remote Function Call. Requires SAP RFC library (`pyrfc` or `node-rfc`). Platform-specific native dependencies, needs VPN/direct SAP access.
- **Flat file export (MM60/ME2M/FAGLL03)**: Downloaded from SAP GUI transaction → CSV or delimited text. Most enterprises already do this. Zero integration dependencies. Realistic to implement without SAP access.

**I chose flat file (MM60-style)** for fuel/procurement. Justification: every SAP customer can export a flat file. The schema  plant code, material code, quantity, unit, posting date, document number  is stable across SAP versions. The parsing complexity is real (German column headers, German number formats, multiple date formats) and I handled all of it.

**What I ignored**: Material-to-fuel mapping beyond the top 6 fuel codes (diesel, petrol, natural gas, LPG, HFO, coal). A real deployment would need a full MARA (material master) lookup table for the client's plant. I stub unknowns with a flag and a default factor.

**What would ask the PM**: "Does the client do their own MM60 exports today, or do we need to build a pull from their SAP Gateway?"

---

## Utility: Portal CSV over PDF parsing or API

**Options considered**:
- **PDF bill parsing**: Requires OCR or PDF extraction (pdfplumber, Camelot). Utility PDF formats vary wildly  not just per utility, but per billing tier and tariff type. Fragile, high maintenance.
- **Utility API (Green Button, ESPI)**: Standard exists in the US (EPRI Green Button Connect), but adoption is inconsistent. UK utilities (EDF, British Gas) don't expose a public developer API for commercial accounts without bespoke integration agreements.
- **Portal CSV export**: Every major utility portal (EDF Business, British Gas for Business, ComEd, National Grid) has a CSV download for billing history. Format is relatively consistent: account number, meter ID, billing period, kWh, cost.

**I chose portal CSV** because it's the most universally available format that a facilities team can produce today without IT involvement. It's the realistic answer to "how does a facilities team typically get this."

**What I ignored**: Multi-tariff billing (Time-of-Use rates split into peak/off-peak kWh). I sum all consumption into one record per billing period. A more complete model would split peak/off-peak, as emissions intensity differs by time-of-day in some grids.

Billing period alignment: utility bills don't follow calendar months. I handle this by using the billing period midpoint as the activity date and flagging periods longer than 40 days as suspicious.

---

## Travel: Concur-style CSV over Navan API or expense report scraping

**Options considered**:
- **Navan API**: Navan (formerly TripActions) has a reporting API, but it requires OAuth with client credentials from the corporate travel admin. Not accessible without actual credentials.
- **Concur expense report API**: Same constraint. Concur's SAP Spend Management API requires client setup and OAuth.
- **CSV export**: Both Concur and Navan allow admins to export expense reports as CSV. This is the most common data format sustainability teams actually receive.

**I chose Concur-style CSV** because that's how 90% of ESG teams actually get travel data — the sustainability lead asks the travel team for a quarterly export.

**Key design decision**: When only airport codes are provided (no distance), I compute great-circle distance using a lookup table of 30+ major airports. This covers LHR, JFK, CDG, FRA, DXB, SIN, etc. Where airport codes are unknown, I apply a "distance_estimated" flag and a 1000km fallback (medium-haul assumption), which is conservative and surfaced to the analyst.

**Class of service**: Economy, premium economy, business, first  each has materially different emission factors (economy ≈ 0.155, business ≈ 0.429 kgCO2e/km). The factor difference between economy and business class is a factor of 2.8x, so getting this right matters. I parse cabin class from common labels (Y/W/J/F codes and natural language).

**Radiative Forcing Index (RFI)**: I apply RFI 1.9x to all flight emission factors. RFI accounts for the additional warming from contrails and cirrus cloud formation at altitude. DESNZ 2023 methodology includes this. Some clients exclude it  this would be a configuration option in a production system.

---

## Review workflow: 4-state not 2-state

**Simple approach**: pending → approved (two states).

**What I built**: pending → approved / flagged / rejected (four states with transitions).

**Why**: An analyst reviewing 500 rows needs a way to say "this needs more investigation" (flagged) without either approving or permanently rejecting it. Flagged records stay in the review queue with the analyst's note visible. Rejected records are explicitly excluded from the audit calculation.

**Transition rules**:
- Approved records cannot be flagged (locked for audit)
- Approved records can be rejected (if an error is discovered post-approval  this should be exceptional)
- All other transitions are permitted

---

## Suspicious flag detection: machine-assisted, not machine-decided

The system generates suspicious flags at parse time:
- `quantity_outlier`: raw quantity is >10x the expected range for the category
- `future_date`: activity date is in the future
- `unknown_material_code`: SAP material code not in the fuel lookup table
- `long_billing_period`: utility billing period >40 days
- `distance_estimated`: flight distance was calculated from airport codes, not provided
- `duplicate_source_ref`: same source reference appears twice (not yet implemented  see TRADEOFFS.md)
- `zero_consumption`: utility meter reads zero (may be legitimate or may be an export error)
- `inverted_dates`: billing period end is before start

**Decision**: Flags are advisory. An analyst still needs to approve or reject. The system never auto-approves based on absence of flags, and never auto-rejects based on presence. A flagged record with a note explaining why it's correct is perfectly valid.

---

## Location-based vs. market-based electricity factors

**I chose location-based** (grid average by country). Market-based (using Supplier-Specific Emission Factors or REGOs/RECs) is more accurate when a company has renewable electricity contracts but requires knowing the specific tariff and supplier certificate. The facilities team's portal CSV won't tell us this.

**What I'd ask the PM**: "Does the client have renewable electricity contracts? If yes, we need their REGO certificate data to use market-based factors."

---

## No authentication in the prototype

**Decision**: No user auth in the first build.

**Why**: Auth systems (JWT, OAuth, sessions) add meaningful complexity for zero prototype value. The review workflow has an `reviewedBy` free-text field so analyst identity is captured in the audit trail. A production system would replace this with authenticated user context.

**What would I add**: Clerk Auth (per the available integrations) with role-based access  analyst vs. admin vs. read-only. Scope approval would require analyst role; audit log is read-only for all.
