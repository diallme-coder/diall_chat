import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/diall_chat/" : "/",
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
  },
});
