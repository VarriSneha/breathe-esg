import { Router } from "express";
import { db } from "@workspace/db";
import { emissionRecordsTable, ingestionsTable, auditLogTable } from "@workspace/db";
import { eq, sql, count, desc, gte } from "drizzle-orm";

const router = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [totals, ingestionCounts] = await Promise.all([
    db.select({
      status: emissionRecordsTable.status,
      cnt: count(),
      totalCo2e: sql<string>`COALESCE(SUM(co2e_kg), 0)`,
    })
      .from(emissionRecordsTable)
      .groupBy(emissionRecordsTable.status),
    db.select({
      total: count(),
      recent: sql<string>`COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')`,
    }).from(ingestionsTable),
  ]);

  const byStatus: Record<string, { cnt: number; co2e: number }> = {};
  for (const row of totals) {
    byStatus[row.status] = { cnt: Number(row.cnt), co2e: parseFloat(row.totalCo2e) };
  }

  const totalCo2e = Object.values(byStatus).reduce((s, v) => s + v.co2e, 0);
  const approvedCo2e = byStatus["approved"]?.co2e ?? 0;
  const ingRow = ingestionCounts[0];

  res.json({
    totalRecords: Object.values(byStatus).reduce((s, v) => s + v.cnt, 0),
    pendingRecords: byStatus["pending"]?.cnt ?? 0,
    approvedRecords: byStatus["approved"]?.cnt ?? 0,
    flaggedRecords: byStatus["flagged"]?.cnt ?? 0,
    rejectedRecords: byStatus["rejected"]?.cnt ?? 0,
    totalCo2eKg: totalCo2e,
    approvedCo2eKg: approvedCo2e,
    totalIngestions: Number(ingRow?.total ?? 0),
    recentIngestions: Number(ingRow?.recent ?? 0),
  });
});

router.get("/dashboard/scope-breakdown", async (_req, res): Promise<void> => {
  const rows = await db.select({
    scope: emissionRecordsTable.scope,
    status: emissionRecordsTable.status,
    cnt: count(),
    co2e: sql<string>`COALESCE(SUM(co2e_kg), 0)`,
  })
    .from(emissionRecordsTable)
    .groupBy(emissionRecordsTable.scope, emissionRecordsTable.status);

  const scopes = ["scope1", "scope2", "scope3"];
  const result = scopes.map(scope => {
    const scopeRows = rows.filter(r => r.scope === scope);
    const total = scopeRows.reduce((s, r) => s + Number(r.cnt), 0);
    const co2e = scopeRows.reduce((s, r) => s + parseFloat(r.co2e), 0);
    const pending = scopeRows.filter(r => r.status === "pending").reduce((s, r) => s + Number(r.cnt), 0);
    const approved = scopeRows.filter(r => r.status === "approved").reduce((s, r) => s + Number(r.cnt), 0);
    return { scope, recordCount: total, co2eKg: co2e, pendingCount: pending, approvedCount: approved };
  });

  res.json(result);
});

router.get("/dashboard/source-breakdown", async (_req, res): Promise<void> => {
  const [recordRows, ingRows] = await Promise.all([
    db.select({
      sourceType: emissionRecordsTable.sourceType,
      cnt: count(),
      co2e: sql<string>`COALESCE(SUM(co2e_kg), 0)`,
    })
      .from(emissionRecordsTable)
      .groupBy(emissionRecordsTable.sourceType),
    db.select({
      sourceType: ingestionsTable.sourceType,
      lastIngestion: sql<string>`MAX(completed_at)`,
    })
      .from(ingestionsTable)
      .groupBy(ingestionsTable.sourceType),
  ]);

  const lastBySource: Record<string, string | null> = {};
  for (const r of ingRows) lastBySource[r.sourceType] = r.lastIngestion ?? null;

  const result = recordRows.map(r => ({
    sourceType: r.sourceType,
    recordCount: Number(r.cnt),
    co2eKg: parseFloat(r.co2e),
    lastIngestion: lastBySource[r.sourceType] ?? null,
  }));

  res.json(result);
});

router.get("/dashboard/recent-activity", async (_req, res): Promise<void> => {
  const entries = await db.select().from(auditLogTable)
    .orderBy(desc(auditLogTable.createdAt))
    .limit(30);

  const result = entries.map(e => ({
    id: e.id,
    type: e.action,
    description: buildActivityDescription(e),
    actor: e.actor ?? null,
    timestamp: e.createdAt.toISOString(),
    metadata: {
      recordId: e.recordId,
      ingestionId: e.ingestionId,
      previousValue: e.previousValue,
      newValue: e.newValue,
    },
  }));

  res.json(result);
});

function buildActivityDescription(entry: typeof auditLogTable.$inferSelect): string {
  switch (entry.action) {
    case "ingestion_completed": {
      let info = "";
      try { info = JSON.parse(entry.newValue ?? "{}"); } catch { /* ignore */ }
      return `Ingestion #${entry.ingestionId} completed`;
    }
    case "record_approved":
      return `Record #${entry.recordId} approved${entry.actor ? ` by ${entry.actor}` : ""}`;
    case "record_flagged":
      return `Record #${entry.recordId} flagged${entry.note ? `: ${entry.note}` : ""}`;
    case "record_rejected":
      return `Record #${entry.recordId} rejected${entry.actor ? ` by ${entry.actor}` : ""}`;
    case "record_bulk_approved":
      return `Record #${entry.recordId} bulk-approved${entry.actor ? ` by ${entry.actor}` : ""}`;
    default:
      return entry.action;
  }
}

export default router;
