import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "node:fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  // 시크릿을 빌드 시 직접 키어 넣기 (pplx.app 프록시 사용자 process.env 주입을 지원하지 않기 때문)
  const SESSION_SECRET = process.env.BUILD_SESSION_SECRET || "";
  const CRON_TOKEN = process.env.BUILD_CRON_TOKEN || "";
  const SMTP_USER = process.env.BUILD_SMTP_USER || "";
  const SMTP_PASS = process.env.BUILD_SMTP_PASS || "";
  const NOTIFY_TO = process.env.BUILD_NOTIFY_TO || "";
  const ECOUNT_SECRET = process.env.BUILD_ECOUNT_SECRET || "";

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.SESSION_SECRET": JSON.stringify(SESSION_SECRET),
      "process.env.CRON_TOKEN": JSON.stringify(CRON_TOKEN),
      "process.env.SMTP_USER": JSON.stringify(SMTP_USER),
      "process.env.SMTP_PASS": JSON.stringify(SMTP_PASS),
      "process.env.NOTIFY_TO": JSON.stringify(NOTIFY_TO),
      "__ECOUNT_SECRET__": JSON.stringify(ECOUNT_SECRET),
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
