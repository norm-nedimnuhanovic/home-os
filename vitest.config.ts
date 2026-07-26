import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom", // needed for component tests; harmless for pure-function tests
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**"], // Playwright owns e2e/, Vitest never touches it
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"), // mirrors tsconfig.json's "@/*" path
      // "server-only" isn't a real installed package — see the stub file's
      // own comment and docs/toolkit.md for why this alias exists.
      "server-only": path.resolve(__dirname, "./src/lib/test/server-only-stub.ts"),
    },
  },
});
