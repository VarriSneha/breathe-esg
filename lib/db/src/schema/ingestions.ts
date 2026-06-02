import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sourceTypeEnum = pgEnum("source_type", ["sap", "utility", "travel"]);
export const ingestionStatusEnum = pgEnum("ingestion_status", ["processing", "completed", "failed"]);

export const ingestionsTable = pgTable("ingestions", {
  id: serial("id").primaryKey(),
  sourceType: sourceTypeEnum("source_type").notNull(),
  clientName: text("client_name").notNull(),
  fileName: text("file_name").notNull(),
  status: ingestionStatusEnum("status").notNull().default("processing"),
  totalRows: integer("total_rows").notNull().default(0),
  successRows: integer("success_rows").notNull().default(0),
  failedRows: integer("failed_rows").notNull().default(0),
  suspiciousRows: integer("suspicious_rows").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const ingestionErrorsTable = pgTable("ingestion_errors", {
  id: serial("id").primaryKey(),
  ingestionId: integer("ingestion_id").notNull().references(() => ingestionsTable.id),
  rowNumber: integer("row_number").notNull(),
  rawData: text("raw_data").notNull(),
  errorMessage: text("error_message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIngestionSchema = createInsertSchema(ingestionsTable).omit({ id: true, createdAt: true });
export type InsertIngestion = z.infer<typeof insertIngestionSchema>;
export type Ingestion = typeof ingestionsTable.$inferSelect;

export const insertIngestionErrorSchema = createInsertSchema(ingestionErrorsTable).omit({ id: true, createdAt: true });
export type InsertIngestionError = z.infer<typeof insertIngestionErrorSchema>;
export type IngestionError = typeof ingestionErrorsTable.$inferSelect;
