import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 10925,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:10924",
        changeOrigin: true
      },
      "/.well-known": {
        target: "http://127.0.0.1:10924",
        changeOrigin: true
      }
    }
  }
});

