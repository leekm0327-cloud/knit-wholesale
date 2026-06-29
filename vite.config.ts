import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// pplx.app 환경에서는 백엔드 API가 자동 라우팅되지 않고
// /port/<PORT>/* 프리픽스로만 접근 가능. 빌드 시 환경변수로 주입.
const PORT_5000 = process.env.BUILD_API_BASE ?? "";

export default defineConfig({
  plugins: [react()],
  define: {
    __API_BASE__: JSON.stringify(PORT_5000),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  base: "./",
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
