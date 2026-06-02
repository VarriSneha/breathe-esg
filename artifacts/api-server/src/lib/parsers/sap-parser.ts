/**
 * SAP Flat-File Parser for Fuel & Procurement Data
 *
 * SAP exports in flat-file (IDoc segment-style or BAPI-style delimiter format)
 * are tab-delimited or semicolon-delimited with German-style headers in some configs.
 * We handle:
 *  - Semicolon or tab delimited (auto-detect)
 *  - German number formats (1.234,56 → 1234.56)
 *  - Date formats: YYYYMMDD, DD.MM.YYYY, YYYY-MM-DD
 *  - Plant codes mapped to location descriptions
 *  - Unit normalization to a canonical set
 *  - Scope 1 categorization (direct fuel combustion)
 */

export interface SapRow {
  rowNumber: number;
  plantCode: string;
  materialCode: string;
  materialDescription: string;
  quantity: number;
  unit: string;
  postingDate: string; // ISO YYYY-MM-DD
  documentNumber: string;
  costCenter: string;
  rawLine: string;
}

export interface ParseResult<T> {
  rows: T[];
  errors: Array<{ rowNumber: number; rawData: string; errorMessage: string }>;
}

// Plant code → human readable site
const PLANT_CODE_MAP: Record<string, string> = {
  "1000": "Frankfurt HQ",
  "1100": "Munich Plant",
  "2000": "London Office",
  "2100": "Manchester Warehouse",
  "3000": "New York Hub",
  "3100": "Chicago Depot",
  "9000": "Corporate Central",
};

// Fuel material codes → emission categories
const FUEL_MATERIAL_CODES: Record<string, { category: string; emissionFactor: number; unit: string }> = {
  "DIESEL": { category: "fuel_combustion_diesel", emissionFactor: 2.68, unit: "L" },
  "PETROL": { category: "fuel_combustion_petrol", emissionFactor: 2.31, unit: "L" },
  "NATGAS": { category: "fuel_combustion_natural_gas", emissionFactor: 2.04, unit: "m3" },
  "LPG":    { category: "fuel_combustion_lpg", emissionFactor: 1.63, unit: "kg" },
  "HFO":    { category: "fuel_combustion_heavy_fuel_oil", emissionFactor: 3.18, unit: "L" },
  "COAL":   { category: "fuel_combustion_coal", emissionFactor: 2.42, unit: "kg" },
};

// Unit normalization — SAP can export in many unit codes
const UNIT_ALIASES: Record<string, string> = {
  "L": "L", "LTR": "L", "GAL": "L", "US_GAL": "L",
  "KG": "kg", "KGS": "kg", "T": "t", "MT": "t",
  "M3": "m3", "CBM": "m3",
  "KWH": "kWh", "MWH": "MWh",
  "MMBTU": "MMBtu",
};

function normalizeUnit(raw: string): string {
  return UNIT_ALIASES[raw.toUpperCase().replace(/\s/g, "_")] ?? raw;
}

function parseGermanNumber(s: string): number {
  // German: 1.234.567,89 → 1234567.89
  const cleaned = s.trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  if (isNaN(n)) throw new Error(`Cannot parse number: "${s}"`);
  return n;
}

function parseSapDate(s: string): string {
  const str = s.trim();
  // YYYYMMDD
  if (/^\d{8}$/.test(str)) {
    return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
  }
  // DD.MM.YYYY
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(str)) {
    const [d, m, y] = str.split(".");
    return `${y}-${m}-${d}`;
  }
  // YYYY-MM-DD (already ISO)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  throw new Error(`Unrecognised date format: "${str}"`);
}

function detectDelimiter(header: string): string {
  if (header.includes("\t")) return "\t";
  if (header.split(";").length > 3) return ";";
  return ",";
}

// Column aliases: SAP German headers → canonical keys
const COLUMN_ALIASES: Record<string, string> = {
  "werks": "plant", "werk": "plant", "plant": "plant",
  "matnr": "material", "material": "material", "materialnummer": "material",
  "maktx": "description", "description": "description", "bezeichnung": "description", "materialbezeichnung": "description",
  "menge": "quantity", "quantity": "quantity", "mengeinheit": "quantity",
  "meins": "unit", "einheit": "unit", "unit": "unit",
  "budat": "posting_date", "posting_date": "posting_date", "buchungsdatum": "posting_date", "date": "posting_date",
  "belnr": "document", "document": "document", "belegnummer": "document", "doc_number": "document",
  "kostl": "cost_center", "cost_center": "cost_center", "kostenstelle": "cost_center",
};

function normalizeHeader(h: string): string {
  const lower = h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  return COLUMN_ALIASES[lower] ?? lower;
}

export function parseSapFile(content: string): ParseResult<SapRow> {
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], errors: [{ rowNumber: 0, rawData: content.slice(0, 200), errorMessage: "File has no data rows" }] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = lines[0].split(delimiter).map(normalizeHeader);

  const col = (row: string[], name: string): string => {
    const idx = headers.indexOf(name);
    if (idx === -1) return "";
    return (row[idx] ?? "").trim();
  };

  const rows: SapRow[] = [];
  const errors: ParseResult<SapRow>["errors"] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const parts = rawLine.split(delimiter);
    try {
      const plantCode = col(parts, "plant") || "UNKNOWN";
      const materialCode = col(parts, "material") || col(parts, "matnr") || "";
      if (!materialCode) throw new Error("Missing material code");

      const rawQty = col(parts, "quantity");
      if (!rawQty) throw new Error("Missing quantity");
      const quantity = parseGermanNumber(rawQty);
      if (quantity <= 0) throw new Error(`Non-positive quantity: ${quantity}`);

      const rawDate = col(parts, "posting_date");
      if (!rawDate) throw new Error("Missing posting date");
      const postingDate = parseSapDate(rawDate);

      const rawUnit = col(parts, "unit") || "L";
      const unit = normalizeUnit(rawUnit);

      rows.push({
        rowNumber: i,
        plantCode,
        materialCode: materialCode.toUpperCase(),
        materialDescription: col(parts, "description") || materialCode,
        quantity,
        unit,
        postingDate,
        documentNumber: col(parts, "document") || `DOC-${i}`,
        costCenter: col(parts, "cost_center") || "UNKNOWN",
        rawLine,
      });
    } catch (err) {
      errors.push({ rowNumber: i, rawData: rawLine, errorMessage: String(err instanceof Error ? err.message : err) });
    }
  }

  return { rows, errors };
}

export interface NormalizedSapRecord {
  sourceRef: string;
  category: string;
  activityDescription: string;
  activityDate: string;
  rawQuantity: number;
  rawUnit: string;
  co2eKg: number;
  emissionFactor: number;
  emissionFactorSource: string;
  suspiciousFlags: string[];
}

export function normalizeSapRow(row: SapRow): NormalizedSapRecord {
  const fuels = FUEL_MATERIAL_CODES;
  const matchedKey = Object.keys(fuels).find(k => row.materialCode.includes(k)) ?? null;
  const fuelInfo = matchedKey ? fuels[matchedKey] : null;

  const category = fuelInfo?.category ?? "fuel_combustion_other";
  const emissionFactor = fuelInfo?.emissionFactor ?? 2.5;
  const co2eKg = row.quantity * emissionFactor;

  const plantName = PLANT_CODE_MAP[row.plantCode] ?? `Plant ${row.plantCode}`;
  const activityDescription = `${row.materialDescription} — ${plantName}`;

  const suspiciousFlags: string[] = [];
  if (row.quantity > 50000) suspiciousFlags.push("quantity_outlier");
  if (!fuelInfo) suspiciousFlags.push("unknown_material_code");
  const date = new Date(row.postingDate);
  if (date > new Date()) suspiciousFlags.push("future_date");

  return {
    sourceRef: `SAP:${row.documentNumber}:${row.plantCode}`,
    category,
    activityDescription,
    activityDate: row.postingDate,
    rawQuantity: row.quantity,
    rawUnit: row.unit,
    co2eKg,
    emissionFactor,
    emissionFactorSource: "IPCC AR6 / UK DESNZ 2023",
    suspiciousFlags,
  };
}
