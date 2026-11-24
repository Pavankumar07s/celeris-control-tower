import { defineConfig } from "vite";

// Static build with a relative base so dist/ works on GitHub Pages, Cloudflare Pages or `python -m http.server`.
export default defineConfig({
  base: "./",
  esbuild: { jsx: "automatic" },
  build: {
    outDir: "dist",
    target: "es2022",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes("node_modules/echarts") || id.includes("node_modules/zrender") ? "echarts" : undefined),
      },
    },
  },
});
