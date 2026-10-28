-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "userId" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "intakes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_intakes" ("budget", "company", "created_at", "description", "email", "id", "industry", "keyPoints", "name", "priority", "priorityReason", "risks", "summary", "tags", "timeline", "title") SELECT "budget", "company", "created_at", "description", "email", "id", "industry", "keyPoints", "name", "priority", "priorityReason", "risks", "summary", "tags", "timeline", "title" FROM "intakes";
DROP TABLE "intakes";
ALTER TABLE "new_intakes" RENAME TO "intakes";
CREATE INDEX "intakes_userId_idx" ON "intakes"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");
