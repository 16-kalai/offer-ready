CREATE TABLE "blobs" (
	"key" text PRIMARY KEY NOT NULL,
	"data" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
