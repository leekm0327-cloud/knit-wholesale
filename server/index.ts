// dotenv는 개발 환경에서만 .env 파일을 로드. production sandbox에서는 환경변수가
// 이미 주입되므로 dotenv가 깔려있지 않아도 안전하게 무시한다.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv/config");
} catch {
  /* dotenv 미설치 — production 환경에서는 정상 */
}
import express, { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "node:http";

// 요청 처리 중 잡히지 않은 오류 하나 때문에 서버 전체가 죽지 않도록 한다.
// Node 22는 처리되지 않은 Promise 거부가 나면 기본적으로 프로세스를 종료시키는데,
// 그러면 배포된 앱이 몇 초마다 죽었다 살아나기를 반복하게 된다.
// 여기서 스택을 로그로 남기고 살려두면, 배포 로그만 보고도 원인을 찾을 수 있다.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    // 소식/게시판/상품 이미지를 base64로 본문에 담아 보내므로 기본 100KB로는 부족.
    // 이미지 1장당 최대 5MB(base64 인코딩 시 약 6.7MB) + 여러 장을 고려해 넉넉히 설정.
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "50mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // 응답 본문 전체를 로그에 남기면 거래처 연락처·사업자번호·채권잔액·재무 데이터가
      // 배포 로그에 그대로 쌓인다. 오류 응답의 메시지만 남기고 정상 응답 본문은 기록하지 않는다.
      if (capturedJsonResponse && res.statusCode >= 400) {
        const msg = (capturedJsonResponse as any)?.message;
        if (typeof msg === "string") logLine += ` :: ${msg.slice(0, 200)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
