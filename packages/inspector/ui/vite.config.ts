import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev: `npm run dev` here, with the inspector server on 4747 for /api and /ws.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4747",
      "/ws": { target: "ws://127.0.0.1:4747", ws: true },
    },
  },
});
