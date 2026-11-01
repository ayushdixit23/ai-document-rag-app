CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('uploading', 'pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "document_chunk" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"user_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "document_chunk_id_document_id_unique" UNIQUE("id","document_id"),
	CONSTRAINT "document_chunk_document_index_unique" UNIQUE("document_id","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "message_citation" (
	"message_id" text NOT NULL,
	"document_id" text NOT NULL,
	"chunk_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"page" integer,
	"snippet" text NOT NULL,
	CONSTRAINT "message_citation_message_id_ordinal_pk" PRIMARY KEY("message_id","ordinal")
);
--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "summarized_until" timestamp;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "status" "document_status" DEFAULT 'uploading' NOT NULL;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "page_count" integer;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "chunk_count" integer;--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citation" ADD CONSTRAINT "message_citation_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citation" ADD CONSTRAINT "message_citation_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_citation" ADD CONSTRAINT "message_citation_chunk_id_document_id_document_chunk_id_document_id_fk" FOREIGN KEY ("chunk_id","document_id") REFERENCES "public"."document_chunk"("id","document_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_chunk_embedding_hnsw_idx" ON "document_chunk" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "document_chunk_user_document_idx" ON "document_chunk" USING btree ("user_id","document_id");
