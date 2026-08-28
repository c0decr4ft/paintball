import { defineConfig } from "vite";

const onRender = Boolean(process.env.RENDER);

export default defineConfig({
  base: process.env.VITE_BASE || (onRender ? "/" : "./"),
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
