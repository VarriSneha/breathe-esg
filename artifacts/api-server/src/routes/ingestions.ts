import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import {
  ingestionsTable,
  ingestionErrorsTable,
  emissionRecordsTable,
  auditLogTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListIngestionsResponse,
  GetIngestionResponse,
} from "@workspace/api-zod";
import { parseSapFile, normalizeSapRow } from "../lib/parsers/sap-parser";
import { parseUtilityFile, normalizeUtilityRow } from "../lib/parsers/utility-parser";
import { parseTravelFile, normalizeTravelRow } from "../lib/parsers/travel-parser";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.get("/ingestions", async (req, res): Promise<void> => {
  const ingestions = await db
    .select()
    .from(ingestionsTable)
    .orderBy(ingestionsTable.createdAt);
  res.json(ListIngestionsResponse.parse(ingestions.reverse()));
});

router.get("/ingestions/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [ingestion] = await db.select().from(ingestionsTable).where(eq(ingestionsTable.id, id));
  if (!ingestion) { res.status(404).json({ error: "Ingestion not found" }); return; }

  const [records, errors] = await Promise.all([
    db.select().from(emissionRecordsTable).where(eq(emissionRecordsTable.ingestionId, id)),
    db.select().from(ingestionErrorsTable).where(eq(ingestionErrorsTable.ingestionId, id)),
  ]);

  const detail = {
    ...ingestion,
    completedAt: ingestion.completedAt?.toISOString() ?? null,
    records: records.map(r => ({
      ...r,
      rawQuantity: parseFloat(r.rawQuantity),
      normalizedQuantityKwh: r.normalizedQuantityKwh !== null ? parseFloat(r.normalizedQuantityKwh) : null,
      co2eKg: parseFloat(r.co2eKg),
      emissionFactor: parseFloat(r.emissionFactor),
      activityDate: r.activityDate,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    })),
    errors: errors.map(e => ({ rowNumber: e.rowNumber, rawData: e.rawData, errorMessage: e.errorMessage })),
  };

  res.json(GetIngestionResponse.parse(detail));
});

async function processIngestion(
  ingestionId: number,
  sourceType: "sap" | "utility" | "travel",
  clientName: string,
  fileContent: string,
): Promise<void> {
  try {
    let parsedRows: ReturnType<typeof normalizeSapRow>[] = [];
    let parseErrors: Array<{ rowNumber: number; rawData: string; errorMessage: string }> = [];
    let totalRows = 0;

    if (sourceType === "sap") {
      const result = parseSapFile(fileContent);
      totalRows = result.rows.length + result.errors.length;
      parseErrors = result.errors;
      parsedRows = result.rows.map(normalizeSapRow);
    } else if (sourceType === "utility") {
      const result = parseUtilityFile(fileContent);
      totalRows = result.rows.length + result.errors.length;
      parseErrors = result.errors;
      parsedRows = result.rows.map(r => normalizeUtilityRow(r)) as ReturnType<typeof normalizeSapRow>[];
    } else {
      const result = parseTravelFile(fileContent);
      totalRows = result.rows.length + result.errors.length;
      parseErrors = result.errors;
      parsedRows = result.rows.map(normalizeTravelRow) as ReturnType<typeof normalizeSapRow>[];
    }

    const scope = sourceType === "sap" ? "scope1" : sourceType === "utility" ? "scope2" : "scope3";
    const successRows = parsedRows.length;
    const suspiciousRows = parsedRows.filter(r => r.suspiciousFlags.length > 0).length;

    if (parsedRows.length > 0) {
      await db.insert(emissionRecordsTable).values(
        parsedRows.map(r => ({
          ingestionId,
          sourceType,
          scope: scope as "scope1" | "scope2" | "scope3",
          category: r.category,
          clientName,
          activityDate: r.activityDate,
          activityDescription: r.activityDescription,
          rawQuantity: String(r.rawQuantity),
          rawUnit: r.rawUnit,
          normalizedQuantityKwh: "normalizedQuantityKwh" in r && r.normalizedQuantityKwh !== null
            ? String(r.normalizedQuantityKwh) : null,
          co2eKg: String(r.co2eKg),
          emissionFactor: String(r.emissionFactor),
          emissionFactorSource: r.emissionFactorSource,
          status: "pending" as const,
          suspiciousFlags: r.suspiciousFlags,
          sourceRef: r.sourceRef,
        }))
      );
    }

    if (parseErrors.length > 0) {
      await db.insert(ingestionErrorsTable).values(
        parseErrors.map(e => ({
          ingestionId,
          rowNumber: e.rowNumber,
          rawData: e.rawData.slice(0, 1000),
          errorMessage: e.errorMessage,
        }))
      );
    }

    await db.update(ingestionsTable)
      .set({
        status: "completed",
        totalRows,
        successRows,
        failedRows: parseErrors.length,
        suspiciousRows,
        completedAt: new Date(),
      })
      .where(eq(ingestionsTable.id, ingestionId));

    await db.insert(auditLogTable).values({
      ingestionId,
      action: "ingestion_completed",
      newValue: JSON.stringify({ totalRows, successRows, failedRows: parseErrors.length, suspiciousRows }),
    });
  } catch (err) {
    await db.update(ingestionsTable)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(ingestionsTable.id, ingestionId));
  }
}

function buildIngestionHandler(sourceType: "sap" | "utility" | "travel") {
  return [
    upload.single("file"),
    async (req: any, res: any): Promise<void> => {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const clientName = (req.body?.clientName as string) || "Default Client";
      const fileContent = req.file.buffer.toString("utf-8");

      const [ingestion] = await db.insert(ingestionsTable).values({
        sourceType,
        clientName,
        fileName: req.file.originalname,
        status: "processing",
      }).returning();

      res.status(201).json({
        ...ingestion,
        completedAt: null,
        totalRows: 0,
        successRows: 0,
        failedRows: 0,
        suspiciousRows: 0,
      });

      // Process in background
      setImmediate(() => processIngestion(ingestion.id, sourceType, clientName, fileContent));
    },
  ];
}

router.post("/ingestions/sap", ...buildIngestionHandler("sap"));
router.post("/ingestions/utility", ...buildIngestionHandler("utility"));
router.post("/ingestions/travel", ...buildIngestionHandler("travel"));

export default router;
