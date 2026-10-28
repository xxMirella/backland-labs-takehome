import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Single .env at the repo root (cwd is apps/web when run via npm workspaces).
const rootEnv = path.resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  transpilePackages: ["@app/backend", "@app/db"],
  serverExternalPackages: ["@prisma/client"],
};

export default config;
