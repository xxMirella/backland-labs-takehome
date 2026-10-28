-- Replaces the fixed budgetRange / timeline buckets with an exact USD budget and a delivery date.
-- Hand-written (Prisma refuses to generate this one while rows exist) so existing rows are converted:
--   budgetRange  "<10k" -> 5000, "10k-50k" -> 30000, "50k-150k" -> 100000, "150k+" -> 150000
--   timeline     "<1m" -> created_at + 15 days, "1-3m" -> +60, "3-6m" -> +135, "6m+" -> +270 (truncated to 00:00 UTC)

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_intakes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "budget" INTEGER NOT NULL,
    "timeline" DATETIME NOT NULL,
    "industry" TEXT NOT NULL,
    "tags" JSONB NOT NULL DEFAULT [],
    "risks" JSONB NOT NULL DEFAULT [],
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_intakes" ("id", "title", "description", "budget", "timeline", "industry", "tags", "risks", "created_at")
SELECT
    "id",
    "title",
    "description",
    CASE "budgetRange"
        WHEN '<10k' THEN 5000
        WHEN '10k-50k' THEN 30000
        WHEN '50k-150k' THEN 100000
        ELSE 150000
    END,
    (
        (CASE WHEN typeof("created_at") = 'integer' THEN "created_at"
              ELSE CAST(strftime('%s', "created_at") AS INTEGER) * 1000 END) / 86400000
        + CASE "timeline" WHEN '<1m' THEN 15 WHEN '1-3m' THEN 60 WHEN '3-6m' THEN 135 ELSE 270 END
    ) * 86400000,
    "industry",
    "tags",
    "risks",
    "created_at"
FROM "intakes";
DROP TABLE "intakes";
ALTER TABLE "new_intakes" RENAME TO "intakes";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
