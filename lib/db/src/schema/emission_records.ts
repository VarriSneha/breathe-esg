import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  timestamp,
  date,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ingestionsTable } from "./ingestions";

export const scopeEnum = pgEnum("emission_scope", ["scope1", "scope2", "scope3"]);
export const recordStatusEnum = pgEnum("record_status", ["pending", "approved", "flagged", "rejected"]);

export const emissionRecordsTable = pgTable("emission_records", {
  id: serial("id").primaryKey(),
  ingestionId: integer("ingestion_id").notNull().references(() => ingestionsTable.id),
  sourceType: text("source_type").notNull(),
  scope: scopeEnum("scope").notNull(),
  category: text("category").notNull(),
  clientName: text("client_name").notNull(),
  activityDate: date("activity_date").notNull(),
  activityDescription: text("activity_description").notNull(),
  rawQuantity: numeric("raw_quantity", { precision: 20, scale: 6 }).notNull(),
  rawUnit: text("raw_unit").notNull(),
  normalizedQuantityKwh: numeric("normalized_quantity_kwh", { precision: 20, scale: 6 }),
  co2eKg: numeric("co2e_kg", { precision: 20, scale: 6 }).notNull(),
  emissionFactor: numeric("emission_factor", { precision: 20, scale: 8 }).notNull(),
  emissionFactorSource: text("emission_factor_source").notNull(),
  status: recordStatusEnum("status").notNull().default("pending"),
  suspiciousFlags: text("suspicious_flags").array().notNull().default([]),
  reviewNote: text("review_note"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  sourceRef: text("source_ref").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEmissionRecordSchema = createInsertSchema(emissionRecordsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmissionRecord = z.infer<typeof insertEmissionRecordSchema>;
export type EmissionRecord = typeof emissionRecordsTable.$inferSelect;
