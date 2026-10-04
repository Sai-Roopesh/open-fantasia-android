import { defineConfig } from "vitest/config";

// Two suites. "scenarios" runs on every change with scripted models and a throwaway database. "real" calls real
// models through the player's subscriptions and only runs when asked (npm run test:real), because it spends quota
// and takes minutes.
export default defineConfig({
  test: {
    projects: [
      { test: { name: "scenarios", include: ["test/**/*.test.ts"], exclude: ["test/real/**"] } },
      { test: { name: "real", include: ["test/real/**/*.test.ts"], testTimeout: 600_000 } }
    ]
  }
});
