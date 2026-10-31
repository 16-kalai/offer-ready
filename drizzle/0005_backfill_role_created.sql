-- Roles created before the activity log existed get their "role created" entry.
INSERT INTO "activity" ("owner_id", "role_id", "kind", "created_at")
SELECT r."owner_id", r."id", 'role_created', r."created_at"
FROM "roles" r
WHERE NOT EXISTS (
  SELECT 1 FROM "activity" a WHERE a."role_id" = r."id" AND a."kind" = 'role_created'
);
