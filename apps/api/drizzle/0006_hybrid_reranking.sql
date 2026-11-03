CREATE TABLE "rerank_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "rerank_usage_scope_time_idx" ON "rerank_usage" USING btree ("scope","dispatched_at");--> statement-breakpoint
CREATE INDEX "document_chunk_content_fts_idx" ON "document_chunk" USING gin (to_tsvector('simple', "content"));