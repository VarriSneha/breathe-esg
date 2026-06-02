/**
 * Utility Electricity CSV Parser
 *
 * We handle the portal CSV export format — the most common way facilities teams
 * retrieve electricity data. Utility portal CSVs (National Grid, EDF, British Gas,
 * E.ON, ComEd, etc.) typically include:
 *  - Account number / meter ID
 *  - Billing period start/end dates (not always aligned to calendar months)
 *  - kWh consumed (sometimes split into peak/off-peak)
 *  - Demand kW (ignored for emissions)
 *  - Tariff code
 *  - Cost (ignored)
 *
 * Scope 2 — purchased electricity (market-based or location-based).
 * Emission factor: location-based UK grid average (DESNZ 2023).
 */

export interface UtilityRow {
  rowNumber: number;
  accountNumber: string;
  meterId: string;
  siteDescription: string;
  billingPeriodStart: string; // ISO date
  billingPeriodEnd: string;   // ISO date
  consumptionKwh: number;
  tariffCode: string;
  rawLine: string;
}

export interface ParseResult<T> {
  rows: T[];
  errors: Array<{ rowNumber: number; rawData: string; errorMessage: string }>;
}

// Location-based grid emission factors (kgCO2e/kWh), DESNZ 2023
const GRID_FACTORS: Record<string, number> = {
  UK:  0.20700,
  US:  0.38600,
  EU:  0.27600,
  IE:  0.29500,
  DE:  0.38400,
  FR:  0.05200,
  DEFAULT: 0.23300,
};

function parseUtilityDate(s: string): string {
  const str = s.trim().replace(/"/g, "");
  // MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [m, d, y] = str.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // DD/MM/YYYY (UK)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // DD-MMM-YYYY e.g. 01-Jan-2023
  const monthMap: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const monthMatch = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (monthMatch) {
    const [, d, mon, y] = monthMatch;
    const m = monthMap[mon.toLowerCase()];
    if (m) return `${y}-${m}-${d.padStart(2, "0")}`;
  }
  throw new Error(`Unrecognised date: "${s}"`);
}

const HEADER_ALIASES: Record<string, string> = {
  "account_number": "account", "account": "account", "accountno": "account",
  "meter_id": "meter", "meterid": "meter", "meter_number": "meter", "meter": "meter",
  "site": "site", "site_name": "site", "sitedescription": "site", "location": "site",
  "period_start": "start", "billing_period_start": "start", "start_date": "start", "from": "start", "start": "start",
  "period_end": "end", "billing_period_end": "end", "end_date": "end", "to": "end", "end": "end",
  "consumption_kwh": "kwh", "kwh": "kwh", "energy_kwh": "kwh", "net_kwh": "kwh", "usage_kwh": "kwh",
  "tariff": "tariff", "tariff_code": "tariff", "rate_code": "tariff",
};

function normalizeHeader(h: string): string {
  const lower = h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return HEADER_ALIASES[lower] ?? lower;
}

function detectDelimiter(line: string): string {
  if (line.includes("\t")) return "\t";
  if (line.split(";").length > 3) return ";";
  return ",";
}

function parseNumber(s: string): number {
  const cleaned = s.trim().replace(/[",]/g, "");
  const n = parseFloat(cleaned);
  if (isNaN(n)) throw new Error(`Cannot parse number: "${s}"`);
  return n;
}

export function parseUtilityFile(content: string): ParseResult<UtilityRow> {
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], errors: [{ rowNumber: 0, rawData: content.slice(0, 200), errorMessage: "File has no data rows" }] };
  }

  // Skip comment lines (some exports prefix with #)
  const firstDataLine = lines.findIndex(l => !l.startsWith("#"));
  const dataLines = lines.slice(firstDataLine);

  const delimiter = detectDelimiter(dataLines[0]);
  const headers = dataLines[0].split(delimiter).map(normalizeHeader);

  const col = (parts: string[], name: string): string => {
    const idx = headers.indexOf(name);
    if (idx === -1) return "";
    return (parts[idx] ?? "").trim().replace(/^"|"$/g, "");
  };

  const rows: UtilityRow[] = [];
  const errors: ParseResult<UtilityRow>["errors"] = [];

  for (let i = 1; i < dataLines.length; i++) {
    const rawLine = dataLines[i];
    const parts = rawLine.split(delimiter);
    try {
      const rawKwh = col(parts, "kwh");
      if (!rawKwh) throw new Error("Missing kWh consumption");
      const consumptionKwh = parseNumber(rawKwh);
      if (consumptionKwh < 0) throw new Error(`Negative consumption: ${consumptionKwh}`);

      const rawStart = col(parts, "start");
      const rawEnd = col(parts, "end");
      if (!rawStart || !rawEnd) throw new Error("Missing billing period dates");

      const billingPeriodStart = parseUtilityDate(rawStart);
      const billingPeriodEnd = parseUtilityDate(rawEnd);

      rows.push({
        rowNumber: firstDataLine + i,
        accountNumber: col(parts, "account") || "UNKNOWN",
        meterId: col(parts, "meter") || "UNKNOWN",
        siteDescription: col(parts, "site") || "Unknown Site",
        billingPeriodStart,
        billingPeriodEnd,
        consumptionKwh,
        tariffCode: col(parts, "tariff") || "STANDARD",
        rawLine,
      });
    } catch (err) {
      errors.push({
        rowNumber: firstDataLine + i,
        rawData: rawLine,
        errorMessage: String(err instanceof Error ? err.message : err),
      });
    }
  }

  return { rows, errors };
}

export interface NormalizedUtilityRecord {
  sourceRef: string;
  category: string;
  activityDescription: string;
  activityDate: string;
  rawQuantity: number;
  rawUnit: string;
  normalizedQuantityKwh: number;
  co2eKg: number;
  emissionFactor: number;
  emissionFactorSource: string;
  suspiciousFlags: string[];
}

export function normalizeUtilityRow(row: UtilityRow, gridRegion = "UK"): NormalizedUtilityRecord {
  const emissionFactor = GRID_FACTORS[gridRegion.toUpperCase()] ?? GRID_FACTORS["DEFAULT"];
  const co2eKg = row.consumptionKwh * emissionFactor;

  // Activity date = mid-point of billing period
  const start = new Date(row.billingPeriodStart);
  const end = new Date(row.billingPeriodEnd);
  const mid = new Date((start.getTime() + end.getTime()) / 2);
  const activityDate = mid.toISOString().slice(0, 10);

  const suspiciousFlags: string[] = [];
  if (row.consumptionKwh > 500000) suspiciousFlags.push("quantity_outlier");
  if (row.consumptionKwh === 0) suspiciousFlags.push("zero_consumption");

  // Check billing period is not abnormally long (> 40 days)
  const periodDays = (end.getTime() - start.getTime()) / (1000 * 86400);
  if (periodDays > 40) suspiciousFlags.push("long_billing_period");
  if (periodDays < 0) suspiciousFlags.push("inverted_dates");

  if (new Date(row.billingPeriodEnd) > new Date()) suspiciousFlags.push("future_date");

  return {
    sourceRef: `UTIL:${row.meterId}:${row.billingPeriodStart}`,
    category: "purchased_electricity",
    activityDescription: `Electricity — ${row.siteDescription} (meter ${row.meterId}), ${row.billingPeriodStart} to ${row.billingPeriodEnd}`,
    activityDate,
    rawQuantity: row.consumptionKwh,
    rawUnit: "kWh",
    normalizedQuantityKwh: row.consumptionKwh,
    co2eKg,
    emissionFactor,
    emissionFactorSource: `DESNZ 2023 Location-Based (${gridRegion} grid)`,
    suspiciousFlags,
  };
}
