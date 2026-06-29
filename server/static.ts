import express from 'express';
import type { Express } from 'express';
import fs from "node:fs";
import path from "node:path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  // pplx.app 배포 환경에서는 정적 파일이 S3에서 직접 서빙되므로
  // 백엔드 sandbox 내에 dist/public 폴더가 없을 수 있습니다. 그 경우 정적 서빙을 건너뜁니다.
  if (!fs.existsSync(distPath)) {
    // eslint-disable-next-line no-console
    console.log(`[static] no local dist found at ${distPath}, skipping static serve`);
    return;
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
