import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// The frontend always talks to 127.0.0.1 and never to a bundle-specific API. That is what
// keeps it runnable in a plain browser now and wrappable in another shell later with the
// React code unchanged.
//
// base: "./" — Electron loads dist/index.html via the file:// protocol, where Vite's
// default absolute asset paths (/assets/…) resolve to the filesystem root and the app
// mounts nothing. Relative paths work in the dev server, the browser and the shell alike.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
