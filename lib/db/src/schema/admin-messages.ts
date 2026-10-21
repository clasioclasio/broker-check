import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { consultationsTable } from "./consultations";

export const messagesTable = pgTable("consultation_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").notNull().references(() => consultationsTable.id, { onDelete: "cascade" }),
  sender: text("sender").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("consultation_messages_lead_idx").on(table.leadId)]);
export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });
