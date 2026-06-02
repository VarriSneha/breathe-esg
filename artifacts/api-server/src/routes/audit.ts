import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { ListAuditLogQueryParams } from "@workspace/api-zod";

const router = Router();

router.get("/audit-log", async (req, res): Promise<void> => {
  const parsed = ListAuditLogQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { recordId, page = 1 } = parsed.data;
  const pageSize = 50;

  const where = recordId ? eq(auditLogTable.recordId, recordId) : undefined;

  const entries = await db.select()
    .from(auditLogTable)
    .where(where)
    .orderBy(desc(auditLogTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json(entries.map(e => ({
    ...e,
    createdAt: e.createdAt.toISOString(),
  })));
});

export default router;
