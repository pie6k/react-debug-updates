import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "ReactDebugRerenders",
      formats: ["es", "cjs"],
      fileName: "react-debug-updates",
    },
    sourcemap: true,
    minify: false,
  },
});
