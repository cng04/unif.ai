import { defineConfig } from "vitest/config";

// Unit tests for pure modules (world generation, selection). Rendering is checked in a real browser instead.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
