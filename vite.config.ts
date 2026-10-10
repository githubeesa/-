import { defineConfig } from "vite"

// base "./" so the same build works on GitHub Pages (/<repo>/), Netlify, or any static host.
export default defineConfig({
  base: "./",
  build: { target: "es2022", outDir: "dist" },
})
