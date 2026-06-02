import { Router } from "express";
import { db } from "@workspace/db";
import { emissionRecordsTable, auditLogTable } from "@workspace/db";
import { eq, and, inArray, desc, count, sql } from "drizzle-orm";
import {
  ListRecordsQueryParams,
  ApproveRecordParams,
  FlagRecordParams,
  RejectRecordParams,
  ApproveRecordBody,
  FlagRecordBody,
  RejectRecordBody,
  BulkApproveRecordsBody,
} from "@workspace/api-zod";

const router = Router();

function parseId(raw: string | string[]): number {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(s, 10);
}

function serializeRecord(r: typeof emissionRecordsTable.$inferSelect) {
  return {
    ...r,
    rawQuantity: parseFloat(r.rawQuantity),
    normalizedQuantityKwh: r.normalizedQuantityKwh !== null ? parseFloat(r.normalizedQuantityKwh) : null,
    co2eKg: parseFloat(r.co2eKg),
    emissionFactor: parseFloat(r.emissionFactor),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
  };
}

router.get("/records", async (req, res): Promise<void> => {
  const parsed = ListRecordsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status, scope, sourceType, ingestionId, page = 1, pageSize = 50 } = parsed.data;

  const conditions: ReturnType<typeof eq>[] = [];
  if (status) conditions.push(eq(emissionRecordsTable.status, status as any));
  if (scope) conditions.push(eq(emissionRecordsTable.scope, scope as any));
  if (sourceType) conditions.push(eq(emissionRecordsTable.sourceType, sourceType));
  if (ingestionId) conditions.push(eq(emissionRecordsTable.ingestionId, ingestionId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult, records] = await Promise.all([
    db.select({ count: count() }).from(emissionRecordsTable).where(where),
    db.select().from(emissionRecordsTable)
      .where(where)
      .orderBy(desc(emissionRecordsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  res.json({
    records: records.map(serializeRecord),
    total: totalResult[0]?.count ?? 0,
    page,
    pageSize,
  });
});

router.get("/records/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [record] = await db.select().from(emissionRecordsTable).where(eq(emissionRecordsTable.id, id));
  if (!record) { res.status(404).json({ error: "Record not found" }); return; }

  const auditTrail = await db.select().from(auditLogTable)
    .where(eq(auditLogTable.recordId, id))
    .orderBy(auditLogTable.createdAt);

  res.json({
    ...serializeRecord(record),
    auditTrail: auditTrail.map(a => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
  });
});

router.patch("/records/:id/approve", async (req, res): Promise<void> => {
  const params = ApproveRecordParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = ApproveRecordBody.safeParse(req.body ?? {});

  const [record] = await db.select().from(emissionRecordsTable).where(eq(emissionRecordsTable.id, params.data.id));
  if (!record) { res.status(404).json({ error: "Record not found" }); return; }
  if (record.status === "approved") { res.status(400).json({ error: "Record is already approved" }); return; }

  const previousStatus = record.status;

  const [updated] = await db.update(emissionRecordsTable)
    .set({
      status: "approved",
      reviewNote: body.data?.note ?? null,
      reviewedBy: body.data?.reviewedBy ?? "analyst",
      reviewedAt: new Date(),
    })
    .where(eq(emissionRecordsTable.id, params.data.id))
    .returning();

  await db.insert(auditLogTable).values({
    recordId: params.data.id,
    action: "record_approved",
    actor: body.data?.reviewedBy ?? "analyst",
    previousValue: previousStatus,
    newValue: "approved",
    note: body.data?.note ?? null,
  });

  res.json(serializeRecord(updated));
});

router.patch("/records/:id/flag", async (req, res): Promise<void> => {
  const params = FlagRecordParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = FlagRecordBody.safeParse(req.body ?? {});

  const [record] = await db.select().from(emissionRecordsTable).where(eq(emissionRecordsTable.id, params.data.id));
  if (!record) { res.status(404).json({ error: "Record not found" }); return; }
  if (record.status === "approved") { res.status(400).json({ error: "Approved records cannot be flagged" }); return; }

  const previousStatus = record.status;
  const [updated] = await db.update(emissionRecordsTable)
    .set({
      status: "flagged",
      reviewNote: body.data?.note ?? null,
      reviewedBy: body.data?.reviewedBy ?? "analyst",
      reviewedAt: new Date(),
    })
    .where(eq(emissionRecordsTable.id, params.data.id))
    .returning();

  await db.insert(auditLogTable).values({
    recordId: params.data.id,
    action: "record_flagged",
    actor: body.data?.reviewedBy ?? "analyst",
    previousValue: previousStatus,
    newValue: "flagged",
    note: body.data?.note ?? null,
  });

  res.json(serializeRecord(updated));
});

router.patch("/records/:id/reject", async (req, res): Promise<void> => {
  const params = RejectRecordParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = RejectRecordBody.safeParse(req.body ?? {});

  const [record] = await db.select().from(emissionRecordsTable).where(eq(emissionRecordsTable.id, params.data.id));
  if (!record) { res.status(404).json({ error: "Record not found" }); return; }

  const previousStatus = record.status;
  const [updated] = await db.update(emissionRecordsTable)
    .set({
      status: "rejected",
      reviewNote: body.data?.note ?? null,
      reviewedBy: body.data?.reviewedBy ?? "analyst",
      reviewedAt: new Date(),
    })
    .where(eq(emissionRecordsTable.id, params.data.id))
    .returning();

  await db.insert(auditLogTable).values({
    recordId: params.data.id,
    action: "record_rejected",
    actor: body.data?.reviewedBy ?? "analyst",
    previousValue: previousStatus,
    newValue: "rejected",
    note: body.data?.note ?? null,
  });

  res.json(serializeRecord(updated));
});

router.post("/records/bulk-approve", async (req, res): Promise<void> => {
  const body = BulkApproveRecordsBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const { ids, reviewedBy = "analyst", note } = body.data;
  if (!ids.length) { res.json({ updated: 0, skipped: 0 }); return; }

  const records = await db.select().from(emissionRecordsTable)
    .where(inArray(emissionRecordsTable.id, ids));

  const eligible = records.filter(r => r.status !== "approved");
  const skipped = records.length - eligible.length;

  if (eligible.length > 0) {
    await db.update(emissionRecordsTable)
      .set({
        status: "approved",
        reviewNote: note ?? null,
        reviewedBy,
        reviewedAt: new Date(),
      })
      .where(inArray(emissionRecordsTable.id, eligible.map(r => r.id)));

    await db.insert(auditLogTable).values(
      eligible.map(r => ({
        recordId: r.id,
        action: "record_bulk_approved",
        actor: reviewedBy,
        previousValue: r.status,
        newValue: "approved",
        note: note ?? null,
      }))
    );
  }

  res.json({ updated: eligible.length, skipped });
});

export default router;
