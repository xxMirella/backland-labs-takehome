// Local setup: env file, Prisma client, database migrations. Safe to run any number of times.
// `npm run setup` shows everything; `npm run dev` runs it with --quiet first, so a fresh clone just works
// (and new migrations are applied after a `git pull`).
import { copyFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const quiet = process.argv.includes("--quiet");

function run(cmd) {
  try {
    execSync(cmd, { stdio: quiet ? "pipe" : "inherit" });
  } catch (error) {
    if (quiet) {
      process.stderr.write(String(error.stdout ?? ""));
      process.stderr.write(String(error.stderr ?? ""));
    }
    console.error(`\nSetup failed while running: ${cmd}`);
    console.error("If the Prisma step could not download its engine, check your internet connection and try again.");
    process.exit(1);
  }
}

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example");
}

run("npm run db:generate");
run("npm run db:deploy");

console.log(quiet ? "Database ready." : "\nReady. Start the app with: npm run dev");
