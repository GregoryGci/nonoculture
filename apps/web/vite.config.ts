import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        ws: true,
      },
      // Media goes through the Worker in dev too. Vite would otherwise serve public/media
      // straight off disk under the file name — which is the readable key, the very thing
      // the tokens exist to keep off the wire, so dev would silently not exercise the path
      // production runs.
      "/media": {
        target: "http://127.0.0.1:8787",
      },
    },
  },
});
