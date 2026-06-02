# Sources : Research Notes on Each Data Source

For each of the three sources: what real-world format was researched, what was learned, what the sample data looks like and why, and what would break in a real deployment.

---

## Source 1: SAP : Fuel & Procurement

### What I researched

SAP exposes procurement and material movement data through several mechanisms:

- **Transactions MM60** (material consumption list), **ME2M** (purchase orders by material), **FAGLL03** (G/L account line items for cost accounts linked to fuel purchase orders)
- **Export formats**: SAP GUI → List → Export → Spreadsheet produces a tab-delimited or semicolon-delimited flat file. The column headers are localized — in German SAP configurations (very common in European enterprises), headers appear in German: `Werk` (plant), `Matnr` (material number), `Menge` (quantity), `Meins` (unit of measure), `Budat` (posting date), `Belnr` (document number), `Kostl` (cost center).
- **IDoc format**: Structured XML/text interchange format used for SAP-to-SAP and SAP-to-third-party integration. Segments like `E1MARAM` (material master) and `E1MSEG` (goods movement item) contain the relevant fields. Requires an IDoc parser and pre-configured SAP port configuration.
- **OData v2 via SAP Gateway**: REST-like API, available if the client has SAP Gateway configured. Endpoint like `/sap/opu/odata/sap/MM_PUR_PURCHASEORDER_MONI_SRV_01/` exposes purchase order data.

### What I learned

The realistic data shape for a facilities or sustainability team is the flat file export. IDoc and OData require IT involvement and SAP configuration that most sustainability teams don't control. The flat file export from MM60 is something a procurement analyst can produce without opening an IT ticket.

Key challenges in real exports:
- German number format: `1.234.567,89` (thousands separator is `.`, decimal separator is `,`)
- Date format inconsistency: same export can have `YYYYMMDD` in some columns and `DD.MM.YYYY` in others
- Plant codes like `1000` are meaningless without the enterprise's plant master table (`T001W`)
- Material codes are alphanumeric with no inherent meaning  a lookup against MARA/MAKT is needed to map them to fuel types
- Units of measure are SAP-internal codes: `L` (litres), `KG` (kilograms), `M3` (cubic metres), `PC` (pieces  should not appear for fuel but sometimes does)

### What the sample data looks like and why

My sample SAP CSV uses:
- Semicolon delimited (common in German SAP configs)
- Plant codes `1000`, `1100`, `2000`, `2100`, `3000`, `3100`, `9000` mapped to realistic European/US site names
- Material codes `DIESEL`, `PETROL`, `NATGAS`, `LPG`, `HFO`, `COAL` (simplified vs. the client's actual SAP material numbers, which would be `100000123` style)
- Posting dates in `YYYYMMDD` format
- Quantities reflecting realistic volumes: diesel 3,000-5,000L per plant per month, natural gas 7,000-10,000m³

I included one row with an unknown material code (`XXXXX`) and one with an anomalously large quantity (62,000L) to test the suspicious flag pipeline.

### What would break in production

1. **Material code lookup**: My parser handles 6 fuel codes. A real client SAP system might have 200 material codes including non-fuel items (lubricants, refrigerants, packaging) that incorrectly appear in the fuel purchase order list. Needs a full material-to-category lookup table built with the client's procurement team.

2. **Plant code resolution**: The `T001W` plant master table is client-specific. My placeholder map won't match a real client's plant codes.

3. **Multi-currency cost data**: Fuel cost is often in the export. If needed for spend tracking, currency conversion is required (fuel prices vary by currency and period). I ignore cost columns.

4. **Retroactive posting corrections**: SAP allows posting corrections to prior periods. A March posting might correct a January quantity. Without handling reversal documents (movement type 102, 122), re-ingesting a monthly export can double-count.

---

## Source 2: Utility — Electricity

### What I researched

Utility data access options for commercial accounts:

- **PDF bill**: The universal fallback. Every utility sends a PDF invoice. Parsing is possible (pdfplumber, camelot-py for tabular data in PDFs) but fragile format changes with billing software updates, tariff changes, and utility mergers.
- **Portal CSV export**: EDF Business, British Gas for Business, E.ON Business, ComEd (US), National Grid (US/UK) all have online portals with CSV download functionality. The format is more consistent than PDF. A facilities manager can download it without IT involvement.
- **Green Button / ESPI API**: US Department of Energy standard for utility data sharing. Some US utilities (PG&E, ComEd, Eversource) support it. UK utilities do not. Requires OAuth with the utility and client setup.
- **Automated meter reading (AMI) / smart meter API**: Available for some UK smart meter deployments via SMETS2 standard, but commercial access for third parties (not the meter operator) is limited.

### What I learned

Portal CSV is the only option that works universally across UK and US utilities without IT integration dependencies. The schema is reasonably consistent:

- Account number (typically 8-12 digits)
- Meter ID / MPAN (Meter Point Administration Number in UK, varies in US)
- Billing period: START_DATE and END_DATE  critically, these do NOT align to calendar months. Billing cycles are often 28-35 days starting from the meter read date, not the 1st of the month.
- Energy consumed in kWh (sometimes split into day/night units for Economy 7 tariffs in UK)
- Peak demand in kW (not relevant for emissions)
- Cost (not relevant for emissions)
- Tariff code (relevant: renewable tariffs have different market-based emission factors)

Key challenges:
- Billing periods crossing month boundaries: a billing period from 2024-01-18 to 2024-02-15 straddles January and February
- Multi-meter sites: a large building has multiple MPANs (sub-metered). Each meter should be a separate record
- Economy 7 / time-of-use tariffs: different kWh quantities at different times. Emissions for each TOU band differ in grids with dynamic emission factors
- Half-hourly data: large commercial accounts receive 30-minute interval data, not monthly. 17,520 rows per meter per year

### What the sample data looks like and why

My sample utility CSV uses:
- Meter IDs in the format `MTR-EU-001` (EU) and `MTR-US-001` (US) to show multi-country capability
- Billing periods deliberately not aligned to calendar months (e.g., 2024-01-01 to 2024-01-31 is clean, but the US meter has 2024-01-01 to 2024-02-15 to exercise the long-billing-period flag)
- Consumption values realistic for commercial buildings: 20,000-65,000 kWh/month for UK offices, 95,000 kWh for a US distribution hub
- Different grid emission factors for UK (0.207 kgCO2e/kWh), DE (0.384), US (0.386) to show country-aware normalization

### What would break in production

1. **MPAN validation**: UK meter point administration numbers have a check digit algorithm. My parser accepts any string as a meter ID. Real deployments should validate MPAN/MPRN format.

2. **Market-based vs. location-based**: If the client has renewable electricity contracts (PPAs, REGOs), the market-based emission factor may be 0 kgCO2e/kWh for that meter. My system uses location-based only. Would need a REGO certificate ingestion pathway.

3. **Half-hourly data at scale**: A large client with 50 meters × 17,520 half-hourly readings = 876,000 rows per year. The current paginated API handles this, but the review UX needs aggregation to monthly for analyst-facing display.

4. **Bill correction and estimated reads**: Utilities issue corrected bills and estimated reads. A corrected bill re-states a previous period. Without detecting corrections (some CSVs have a `bill_type` column), re-ingesting will double-count.

---

## Source 3: Corporate Travel - Flights, Hotels, Ground Transport

### What I researched

Corporate travel platform data:

- **Concur (SAP Concur)**: Market leader. Expense reports exported as CSV via the admin portal or retrieved via the Concur Expense Report API (OAuth 2.0 + client credentials). CSV export columns: ReportId, ReportName, EmployeeName, SpendDate, ExpenseType, VendorName, Amount, Currency, ApprovalStatus, and custom fields that vary by client configuration.
- **Navan (formerly TripActions)**: Modern alternative to Concur. Has a reporting API and CSV export. Columns similar to Concur but with more structured travel data: BookingType (AIR/HOTEL/CAR/RAIL), Origin, Destination, FlightClass, Distance.
- **Egencia (Amex GBT)**: Similar structure to Concur. API available.
- **Manual tracking**: Many companies have a sustainability lead maintaining a spreadsheet manually compiled from travel bookings. This is common in mid-market.

What the data actually contains depends heavily on how the platform is configured. Concur expense reports are built from expense types configured by the company's travel admin  the column headers and expense type names vary client to client. There is no universal schema.

### What I learned

Key challenges across all platforms:

- **Distance is usually not provided**: Concur records city pairs or airport codes (sometimes), not distances. Navan's modern API does provide distance for flights. For historical data and Concur, distance must be calculated.
- **Airport codes are city codes not IATA codes in some exports**: Concur sometimes exports city names ("London", "New York") rather than airport codes (LHR/LGW, JFK/EWR/LGA). City-to-airport disambiguation is non-trivial.
- **Class of service is often missing or inconsistent**: ExpenseType might be "Air Travel" with no cabin class distinction. Class of service may appear in a custom field, or may need to be inferred from the ticket cost (unreliable).
- **Hotel data is nights-based, not distance-based**: Unlike flights, hotel emission factors use a per-night model (HCMI standard). The number of nights must be extracted  sometimes it's explicit (Navan), sometimes inferred from check-in/checkout dates.
- **Ground transport is heterogeneous**: Taxi, Uber, Lyft, car rental, rail  all appear as different expense types. Emissions methodologies differ significantly (Uber pooled vs. solo, EV vs. ICE rental car).

### What the sample data looks like and why

My sample travel CSV follows a Concur-style format with:
- TripId, EmployeeName, TravelDate, ExpenseType (Air/Hotel/Rail/Car Rental/Ground), Origin, Destination, DistanceKm (sometimes blank to test estimation), Nights (for hotels), Class (Economy/Business/First), Vendor

I included:
- LHR→JFK economy (Sarah Chen): realistic transatlantic trip, known airport codes
- LHR→SIN business (James Park): long-haul business class, high emission factor
- JFK→LHR first class (Director): flagged as quantity_outlier - 3.3 tCO2e for one person in one trip is notable and warrants analyst attention
- Hotel 7 nights NYC: same trip, flagged because policy allows 5

These choices reflect what real analyst review queues look like: mostly routine, some patterns requiring judgment.

### What would break in production

1. **Airport code coverage**: My lookup table covers 30 major airports. A real deployment needs IATA's full database of 10,000+ airports. Any route between two airports not in my table falls back to 1,000km, which is wrong for short-haul or ultra-long-haul routes.

2. **Concur custom fields**: Concur's column headers are configured per client. "ExpenseType" might be "Expense Category" in one client's export and "Category" in another. The header normalization in the parser handles common aliases but will fail on unusual configurations.

3. **Hotel attribution to a city not site**: The HCMI global average (23.2 kgCO2e/night) is a reasonable global average but hides significant variance: a London hotel might be 15 kgCO2e/night (UK grid, efficient building) while a US hotel could be 35 (US grid, older HVAC). City-level factors exist but require a city lookup table.

4. **Carbon offsets and SAF**: Some companies purchase Sustainable Aviation Fuel or carbon offsets for travel. These should reduce the reported emissions but require a separate data stream (SAF certificates, offset retirement records). Not handled.

5. **Employee home country**: The GHG Protocol allows some companies to exclude commuting from Scope 3 Category 6 (Business Travel) vs. include it. Distinguishing commuting from business travel requires knowing employee home location and normal work location  data that lives in HR systems, not travel platforms.
