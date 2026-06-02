import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { emissionRecordsTable } from "./emission_records";
import { ingestionsTable } from "./ingestions";

export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  recordId: integer("record_id").references(() => emissionRecordsTable.id),
  ingestionId: integer("ingestion_id").references(() => ingestionsTable.id),
  action: text("action").notNull(),
  actor: text("actor"),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogTable).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogTable.$inferSelect;
