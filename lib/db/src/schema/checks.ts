import { pgTable, text, uuid, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
export const checksTable = pgTable("broker_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  company: text("company").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("insufficient_data"),
  demo: boolean("demo").notNull().default(true),
});
export const insertCheckSchema = createInsertSchema(checksTable).omit({ id: true, createdAt: true });
export type Check = typeof checksTable.$inferSelect;
