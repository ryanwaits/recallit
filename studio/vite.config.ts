import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev: Vite serves the React app and proxies /api to the Bun server (server.ts),
// which hosts the streaming build route + (later) the recallit engine tools.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:3001" },
  },
});
