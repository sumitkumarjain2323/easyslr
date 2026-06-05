import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Skip @t3-oss/env validation so importing server modules doesn't require
    // a populated .env during unit tests.
    env: { SKIP_ENV_VALIDATION: "1" },
  },
});
