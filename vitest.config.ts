import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // اختبارات المكوّنات (`.tsx`) — tsconfig بتاع Next على `jsx: preserve`، فمن
  // غير ده أي اختبار بيستورد مكوّن فيه JSX بيفشل في التحليل قبل ما يشتغل.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    // Git worktrees live under .claude/worktrees and carry their own (stale)
    // copies of the test files. Without this, a test run picks up every
    // worktree's tests against the current code and reports hundreds of bogus
    // failures. Only run this checkout's own tests.
    exclude: ["**/node_modules/**", "**/.claude/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
