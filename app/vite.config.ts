import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// The frontend always talks to 127.0.0.1 and never to a bundle-specific API. That is what
// keeps it runnable in a plain browser now and wrappable in Tauri in week 7 with the React
// code unchanged.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
