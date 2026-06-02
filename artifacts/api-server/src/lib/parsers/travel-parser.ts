/**
 * Corporate Travel Parser — Concur/Navan-style CSV export
 *
 * Concur expense reports and travel bookings export CSVs that include:
 *  - Trip/booking reference
 *  - Traveler name/ID
 *  - Travel date
 *  - Category: Air, Hotel, Rail, Car Rental, Ground Transport
 *  - Origin/Destination (airport codes for flights, city for hotels)
 *  - Distance or duration
 *  - Class of service (economy, business, first)
 *  - Vendor
 *
 * Scope 3 — business travel (Category 6: Business Travel, GHG Protocol).
 * For flights: distance computed from airport codes where provided.
 * Emission factors: BEIS/DESNZ 2023 for flights; ECTA for ground/hotel.
 */

export interface TravelRow {
  rowNumber: number;
  tripId: string;
  travelerName: string;
  travelDate: string; // ISO date
  category: "air" | "hotel" | "rail" | "car_rental" | "ground";
  origin: string;
  destination: string;
  distanceKm: number | null;
  nights: number | null;
  classOfService: "economy" | "premium_economy" | "business" | "first" | "unknown";
  vendor: string;
  rawLine: string;
}

export interface ParseResult<T> {
  rows: T[];
  errors: Array<{ rowNumber: number; rawData: string; errorMessage: string }>;
}

// Airport code → lat/lon for great-circle distance estimation
const AIRPORTS: Record<string, [number, number]> = {
  LHR: [51.477, -0.461], LGW: [51.156, -0.179], MAN: [53.354, -2.275],
  EDI: [55.950, -3.373], JFK: [40.641, -73.778], LAX: [33.943, -118.408],
  ORD: [41.978, -87.905], ATL: [33.637, -84.428], SFO: [37.619, -122.374],
  BOS: [42.365, -71.009], DFW: [32.897, -97.038], DEN: [39.856, -104.674],
  SEA: [47.450, -122.309], MIA: [25.796, -80.287], EWR: [40.690, -74.174],
  CDG: [49.013, 2.550],   AMS: [52.309, 4.764],   FRA: [50.037, 8.562],
  MAD: [40.472, -3.561],  BCN: [41.297, 2.078],   FCO: [41.800, 12.239],
  ZRH: [47.458, 8.548],   MUC: [48.354, 11.787],  BRU: [50.902, 4.484],
  CPH: [55.618, 12.656],  HEL: [60.317, 24.963],  ARN: [59.652, 17.919],
  DXB: [25.253, 55.365],  SIN: [1.350, 103.994],  HKG: [22.309, 113.915],
  NRT: [35.765, 140.386], SYD: [-33.947, 151.179], MEL: [-37.673, 144.843],
  BOM: [19.089, 72.868],  DEL: [28.556, 77.100],  PEK: [40.080, 116.585],
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function airportDistance(orig: string, dest: string): number | null {
  const o = AIRPORTS[orig.toUpperCase()];
  const d = AIRPORTS[dest.toUpperCase()];
  if (!o || !d) return null;
  return haversineKm(o[0], o[1], d[0], d[1]);
}

// Emission factors (kgCO2e per passenger-km or per night)
const FLIGHT_FACTORS: Record<string, number> = {
  economy: 0.1552,
  premium_economy: 0.2293,
  business: 0.4286,
  first: 0.5986,
  unknown: 0.1552,
};

const GROUND_FACTORS: Record<string, number> = {
  hotel: 23.2,    // kgCO2e per night (HCMI global average)
  rail: 0.0410,   // kgCO2e per km
  car_rental: 0.1715, // kgCO2e per km (average car)
  ground: 0.1490, // kgCO2e per km (taxi/rideshare)
};

function parseTravelDate(s: string): string {
  const str = s.trim().replace(/"/g, "");
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [m, d, y] = str.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(str)) {
    const monthMap: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const [d, mon, y] = str.split("-");
    const m = monthMap[mon.toLowerCase()];
    if (m) return `${y}-${m}-${d.padStart(2, "0")}`;
  }
  throw new Error(`Unrecognised date: "${s}"`);
}

function parseCategory(raw: string): TravelRow["category"] {
  const s = raw.trim().toLowerCase();
  if (s.includes("air") || s.includes("flight") || s.includes("avion")) return "air";
  if (s.includes("hotel") || s.includes("accommodation") || s.includes("lodging")) return "hotel";
  if (s.includes("rail") || s.includes("train") || s.includes("eurostar")) return "rail";
  if (s.includes("car") && s.includes("rent")) return "car_rental";
  if (s.includes("taxi") || s.includes("ground") || s.includes("uber") || s.includes("lyft")) return "ground";
  return "ground";
}

function parseClass(raw: string): TravelRow["classOfService"] {
  const s = raw.trim().toLowerCase();
  if (s.includes("first") || s.includes("f")) return "first";
  if (s.includes("business") || s.includes("biz") || s.includes("c") || s.includes("j")) return "business";
  if (s.includes("premium") || s.includes("w")) return "premium_economy";
  if (s.includes("economy") || s.includes("eco") || s.includes("y")) return "economy";
  return "unknown";
}

const HEADER_ALIASES: Record<string, string> = {
  "trip_id": "trip_id", "booking_ref": "trip_id", "reference": "trip_id", "report_id": "trip_id",
  "employee": "traveler", "traveler": "traveler", "traveller": "traveler", "employee_name": "traveler",
  "travel_date": "date", "departure_date": "date", "check_in_date": "date", "date": "date",
  "expense_type": "category", "category": "category", "travel_type": "category", "type": "category",
  "from": "origin", "origin": "origin", "departure": "origin", "departure_city": "origin",
  "to": "destination", "destination": "destination", "arrival": "destination", "arrival_city": "destination",
  "distance_km": "distance", "distance": "distance", "km": "distance",
  "nights": "nights", "duration_nights": "nights",
  "class": "class", "cabin_class": "class", "service_class": "class", "travel_class": "class",
  "vendor": "vendor", "airline": "vendor", "hotel_chain": "vendor", "carrier": "vendor",
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

export function parseTravelFile(content: string): ParseResult<TravelRow> {
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], errors: [{ rowNumber: 0, rawData: content.slice(0, 200), errorMessage: "File has no data rows" }] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = lines[0].split(delimiter).map(normalizeHeader);

  const col = (parts: string[], name: string): string => {
    const idx = headers.indexOf(name);
    if (idx === -1) return "";
    return (parts[idx] ?? "").trim().replace(/^"|"$/g, "");
  };

  const rows: TravelRow[] = [];
  const errors: ParseResult<TravelRow>["errors"] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    const parts = rawLine.split(delimiter);
    try {
      const rawDate = col(parts, "date");
      if (!rawDate) throw new Error("Missing travel date");
      const travelDate = parseTravelDate(rawDate);

      const rawCat = col(parts, "category");
      if (!rawCat) throw new Error("Missing expense category");
      const category = parseCategory(rawCat);

      const rawDist = col(parts, "distance");
      const distanceKm = rawDist ? parseFloat(rawDist.replace(/,/g, "")) : null;

      const rawNights = col(parts, "nights");
      const nights = rawNights ? parseInt(rawNights, 10) : null;

      rows.push({
        rowNumber: i,
        tripId: col(parts, "trip_id") || `TRIP-${i}`,
        travelerName: col(parts, "traveler") || "Unknown Traveler",
        travelDate,
        category,
        origin: col(parts, "origin").toUpperCase(),
        destination: col(parts, "destination").toUpperCase(),
        distanceKm: distanceKm && !isNaN(distanceKm) ? distanceKm : null,
        nights: nights && !isNaN(nights) ? nights : null,
        classOfService: parseClass(col(parts, "class")),
        vendor: col(parts, "vendor") || "Unknown",
        rawLine,
      });
    } catch (err) {
      errors.push({
        rowNumber: i,
        rawData: rawLine,
        errorMessage: String(err instanceof Error ? err.message : err),
      });
    }
  }

  return { rows, errors };
}

export interface NormalizedTravelRecord {
  sourceRef: string;
  category: string;
  activityDescription: string;
  activityDate: string;
  rawQuantity: number;
  rawUnit: string;
  normalizedQuantityKwh: null;
  co2eKg: number;
  emissionFactor: number;
  emissionFactorSource: string;
  suspiciousFlags: string[];
}

export function normalizeTravelRow(row: TravelRow): NormalizedTravelRecord {
  const suspiciousFlags: string[] = [];
  if (new Date(row.travelDate) > new Date()) suspiciousFlags.push("future_date");

  let rawQuantity = 0;
  let rawUnit = "";
  let emissionFactor = 0;
  let category = "";
  let activityDescription = "";
  let emissionFactorSource = "DESNZ 2023 / ECTA";

  if (row.category === "air") {
    let distKm = row.distanceKm;
    if (!distKm) {
      distKm = airportDistance(row.origin, row.destination);
      if (!distKm) {
        // Fallback: assume medium-haul 1000 km
        distKm = 1000;
        suspiciousFlags.push("distance_estimated");
      }
    }
    emissionFactor = FLIGHT_FACTORS[row.classOfService];
    rawQuantity = distKm;
    rawUnit = "km";
    category = `business_travel_flight_${row.classOfService}`;
    activityDescription = `Flight ${row.origin || "?"} → ${row.destination || "?"} (${row.classOfService}), ${row.travelerName}`;
    emissionFactorSource = "DESNZ 2023 Flight EF (incl. RFI 1.9x)";
  } else if (row.category === "hotel") {
    const nights = row.nights ?? 1;
    emissionFactor = GROUND_FACTORS["hotel"];
    rawQuantity = nights;
    rawUnit = "nights";
    category = "business_travel_hotel";
    activityDescription = `Hotel stay — ${row.destination || "Unknown city"} (${nights} night${nights > 1 ? "s" : ""}), ${row.travelerName}`;
    emissionFactorSource = "HCMI Global Hotel Average 2023";
  } else if (row.category === "rail") {
    const distKm = row.distanceKm ?? 200;
    if (!row.distanceKm) suspiciousFlags.push("distance_estimated");
    emissionFactor = GROUND_FACTORS["rail"];
    rawQuantity = distKm;
    rawUnit = "km";
    category = "business_travel_rail";
    activityDescription = `Rail — ${row.origin || "?"} → ${row.destination || "?"}, ${row.travelerName}`;
    emissionFactorSource = "DESNZ 2023 National Rail";
  } else if (row.category === "car_rental") {
    const distKm = row.distanceKm ?? 100;
    if (!row.distanceKm) suspiciousFlags.push("distance_estimated");
    emissionFactor = GROUND_FACTORS["car_rental"];
    rawQuantity = distKm;
    rawUnit = "km";
    category = "business_travel_car_rental";
    activityDescription = `Car rental — ${row.destination || "Unknown"}, ${row.travelerName}`;
  } else {
    const distKm = row.distanceKm ?? 30;
    if (!row.distanceKm) suspiciousFlags.push("distance_estimated");
    emissionFactor = GROUND_FACTORS["ground"];
    rawQuantity = distKm;
    rawUnit = "km";
    category = "business_travel_ground";
    activityDescription = `Ground transport — ${row.destination || "Unknown"}, ${row.travelerName}`;
  }

  const co2eKg = rawQuantity * emissionFactor;
  if (co2eKg > 10000) suspiciousFlags.push("quantity_outlier");

  return {
    sourceRef: `TRAVEL:${row.tripId}:${row.travelDate}`,
    category,
    activityDescription,
    activityDate: row.travelDate,
    rawQuantity,
    rawUnit,
    normalizedQuantityKwh: null,
    co2eKg,
    emissionFactor,
    emissionFactorSource,
    suspiciousFlags,
  };
}
