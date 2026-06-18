import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const crawlsTable = pgTable("crawls", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  title: text("title"),
  status: text("status").notNull().default("pending"),
  pageText: text("page_text"),
  aiSummary: text("ai_summary"),
  linksFound: integer("links_found"),
  imagesFound: integer("images_found"),
  links: text("links"),
  images: text("images"),
  metaTags: text("meta_tags"),
  techStack: text("tech_stack"),
  clonedHtml: text("cloned_html"),
  screenshot: text("screenshot"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCrawlSchema = createInsertSchema(crawlsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCrawl = z.infer<typeof insertCrawlSchema>;
export type Crawl = typeof crawlsTable.$inferSelect;
