-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_intakes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Not provided',
    "email" TEXT NOT NULL DEFAULT 'Not provided',
    "company" TEXT NOT NULL DEFAULT 'Not provided',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "budget" INTEGER NOT NULL,
    "timeline" DATETIME NOT NULL,
    "industry" TEXT NOT NULL,
    "tags" JSONB NOT NULL DEFAULT [],
    "risks" JSONB NOT NULL DEFAULT [],
    "summary" TEXT,
    "keyPoints" JSONB NOT NULL DEFAULT [],
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "priorityReason" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_intakes" ("budget", "created_at", "description", "id", "industry", "keyPoints", "priority", "priorityReason", "risks", "summary", "tags", "timeline", "title") SELECT "budget", "created_at", "description", "id", "industry", "keyPoints", "priority", "priorityReason", "risks", "summary", "tags", "timeline", "title" FROM "intakes";
DROP TABLE "intakes";
ALTER TABLE "new_intakes" RENAME TO "intakes";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
