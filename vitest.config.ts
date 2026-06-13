import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // jsdom gives the trip store a real localStorage for its persist middleware
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
