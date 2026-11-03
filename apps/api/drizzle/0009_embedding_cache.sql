CREATE TABLE "embedding_cache" (
	"user_id" text NOT NULL,
	"model" text NOT NULL,
	"text_hash" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "embedding_cache_user_id_model_text_hash_pk" PRIMARY KEY("user_id","model","text_hash")
);
--> statement-breakpoint
ALTER TABLE "embedding_cache" ADD CONSTRAINT "embedding_cache_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;