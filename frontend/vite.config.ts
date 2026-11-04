import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies /api to the backend so the browser sees one origin (no CORS setup needed locally).
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, proxy: { "/api": { target: process.env.VITE_API_TARGET ?? "http://127.0.0.1:4000", changeOrigin: true } } },
});
