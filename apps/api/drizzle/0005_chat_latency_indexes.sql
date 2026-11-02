ALTER TABLE "chat" ADD COLUMN "title_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "chat_user_updated_idx" ON "chat" USING btree ("user_id","updated_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "document_user_created_idx" ON "document" USING btree ("user_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "document_status_updated_idx" ON "document" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "message_chat_created_idx" ON "message" USING btree ("chat_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "message_citation_document_idx" ON "message_citation" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "message_citation_chunk_document_idx" ON "message_citation" USING btree ("chunk_id","document_id");--> statement-breakpoint
CREATE INDEX "message_document_document_idx" ON "message_document" USING btree ("document_id");