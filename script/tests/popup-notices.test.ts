import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import express from "express";
import { insertPopupNoticeSchema, updatePopupNoticeSchema } from "../../shared/schema";
import { POPUP_IMAGE_MAX_BYTES } from "../../shared/popup-image";

const reopening = process.argv[2] === "--reopen";
const fresh = process.argv[2] === "--fresh";
const dataDir = reopening ? process.argv[3] : mkdtempSync(path.join(tmpdir(), "knit-popup-test-"));
assert.ok(path.basename(dataDir).startsWith("knit-popup-test-"));
process.env.DATA_DIR = dataDir;
const imageUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWuoAAAAASUVORK5CYII=";
if (!reopening && !fresh) {
const old = new Database(path.join(dataDir, "data.db"));
old.exec(`CREATE TABLE popup_notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
  order_until TEXT NOT NULL DEFAULT '', order_resume TEXT NOT NULL DEFAULT '', delivery_note TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL DEFAULT '', end_date TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  INSERT INTO popup_notices(title, body, created_at, updated_at) VALUES('기존 공지', '기존 내용', 1, 1);`);
old.close();
}

// Import after DATA_DIR is set. The real storage migration upgrades the old table.
const { sqlite } = await import("../../server/storage");
const { registerPopupNoticeRoutes } = await import("../../server/popup-notice");
if (reopening || fresh) {
  assert.equal((sqlite.prepare("PRAGMA table_info(popup_notices)").all() as any[]).filter((c) => c.name === "image_url").length, 1);
  if (reopening) assert.equal((sqlite.prepare("SELECT image_url FROM popup_notices WHERE id=2").get() as any).image_url, imageUrl);
  sqlite.close();
  if (fresh) rmSync(dataDir, { recursive: true, force: true });
  console.log(reopening ? "PASS: restart preserves images and migration is idempotent." : "PASS: fresh database contains image column.");
  process.exit(0);
}
assert.equal((sqlite.prepare("SELECT image_url FROM popup_notices WHERE id=1").get() as any).image_url, "");
assert.equal(insertPopupNoticeSchema.parse({ title: "글 공지" }).imageUrl, "");
assert.deepEqual(updatePopupNoticeSchema.parse({ active: 0 }), { active: 0 });
for (const invalid of ["https://example.com/a.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:text/html;base64,PGgxPg==", "data:image/png;base64,broken", `data:image/png;base64,${Buffer.alloc(POPUP_IMAGE_MAX_BYTES + 1).toString("base64")}`]) {
  assert.equal(insertPopupNoticeSchema.safeParse({ title: "검증", imageUrl: invalid }).success, false);
}

const app = express();
app.use(express.json({ limit: "8mb" }));
app.use((req: any, _res, next) => {
  const role = req.headers["x-test-role"];
  req.session = role === "anonymous" ? {} : { userId: 1, role: role === "customer" ? "customer" : "admin", adminRole: role };
  next();
});
registerPopupNoticeRoutes(app);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
const call = (url: string, method = "GET", body?: any, role = "owner") => fetch(base + url, {
  method, headers: { "Content-Type": "application/json", "x-test-role": role }, body: body ? JSON.stringify(body) : undefined,
});
const admin = "/api/admin/popup-notices";
const active = "/api/popup-notices/active";
try {
  assert.equal((await call(active, "GET", undefined, "anonymous")).status, 401);
  assert.equal((await call(admin, "GET", undefined, "customer")).status, 403);
  for (const role of ["anonymous", "customer", "manager"]) {
    assert.equal((await call(admin, "POST", { title: "차단", imageUrl }, role)).status, 403);
    assert.equal((await call(`${admin}/1`, "PATCH", { imageUrl }, role)).status, 403);
    assert.equal((await call(`${admin}/1`, "DELETE", undefined, role)).status, 403);
  }
  const response = await call(admin, "POST", { title: "이미지 공지", imageUrl });
  assert.equal(response.status, 200);
  const notice = await response.json();
  assert.equal(notice.imageUrl, imageUrl);
  assert.equal(notice.body, "");
  let rows = await (await call(active, "GET", undefined, "customer")).json();
  assert.equal(rows.find((n: any) => n.id === notice.id).imageUrl, imageUrl);
  assert.equal(rows.find((n: any) => n.id === 1).body, "기존 내용");

  assert.equal((await call(`${admin}/1`, "PATCH", { imageUrl })).status, 200);
  assert.equal((sqlite.prepare("SELECT image_url FROM popup_notices WHERE id=1").get() as any).image_url, imageUrl);
  await call(`${admin}/1`, "PATCH", { active: 0 });
  assert.equal((sqlite.prepare("SELECT image_url FROM popup_notices WHERE id=1").get() as any).image_url, imageUrl);
  await call(`${admin}/1`, "PATCH", { imageUrl: "" });
  assert.equal((sqlite.prepare("SELECT image_url FROM popup_notices WHERE id=1").get() as any).image_url, "");
  assert.equal((await call(`${admin}/${notice.id}`, "PATCH", { imageUrl: "https://example.com/x" })).status, 400);
  assert.equal((await call(`${admin}/999999`, "PATCH", { imageUrl })).status, 404);

  await call(admin, "POST", { title: "기간 지난 공지", imageUrl, endDate: "2000-01-01" });
  await call(admin, "POST", { title: "미래 공지", imageUrl, startDate: "2999-01-01" });
  rows = await (await call(active, "GET", undefined, "customer")).json();
  assert.equal(rows.length, 1);
  const disk = new Database(path.join(dataDir, "data.db"));
  assert.equal((disk.prepare("SELECT image_url FROM popup_notices WHERE id=?").get(notice.id) as any).image_url, imageUrl);
  disk.close();
  for (const args of [["--reopen", dataDir], ["--fresh"]]) {
    const child = spawnSync(process.execPath, [...process.execArgv, process.argv[1], ...args], { encoding: "utf8" });
    assert.equal(child.status, 0, child.stdout + child.stderr);
    console.log(child.stdout.trim());
  }
  console.log("PASS: legacy migration, image-only creation, persisted image retrieval, editing/removal, partial updates, role guards, image validation, and notice dates.");
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  sqlite.close();
  rmSync(dataDir, { recursive: true, force: true });
}
