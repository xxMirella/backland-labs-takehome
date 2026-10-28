import { defineConfig } from "vitest/config";

// Date logic (local "today" vs UTC) must not depend on the machine running the tests.
process.env.TZ = "UTC";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
  },
});
