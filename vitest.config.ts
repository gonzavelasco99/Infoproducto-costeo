import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["packages/domain/src/**/*.ts"],
      reporter: ["text", "html"]
    },
    include: ["packages/**/test/**/*.test.ts"],
    passWithNoTests: false
  }
});
