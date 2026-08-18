import { defineConfig } from "vitest/config";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Fixture reset via TRUNCATE in beforeEach is not safe to run concurrently
    // across test files/threads, so integration tests run sequentially.
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
