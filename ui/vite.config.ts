import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Root-absolute `/assets/...` so the page works at `/` or `/index.html` in any browser.
  base: "/",
  server: { port: 5173 },
});
