import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // Server modules carry `import "server-only"`, which throws outside a React server context.
      // Map it straight to the package's own empty module (the react-server export) so lib/api/* can be unit-tested.
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
    conditions: ["react-server"],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
  },
});
