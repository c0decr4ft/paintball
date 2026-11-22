import { defineConfig } from "vite";

const onRender = Boolean(process.env.RENDER);
// Render (and `RENDER=true npm run build`) must use origin-root URLs so SPA fallbacks
// still find /models/*.glb. Local `vite build` for GitHub Pages keeps relative `./`.
const base = process.env.VITE_BASE || (onRender ? "/" : "./");

export default defineConfig({
  base,
  assetsInclude: ["**/*.glb"],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/ws": {
        target: "ws://127.0.0.1:8787",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
