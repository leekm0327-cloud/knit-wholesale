import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import express from "express";
import session from "express-session";
import { insertStaffSchema, type DessertItem } from "../../shared/schema";

// Import storage only after selecting a fresh disposable database.
const dataDir = mkdtempSync(join(tmpdir(), "knit-dessert-test-"));
process.env.DATA_DIR = dataDir;
const { staffStorage } = await import("../../server/staff-storage");
const { sqlite, storage } = await import("../../server/storage");
const { registerStaffRoutes } = await import("../../server/staff-routes");
const app = express();
app.use(express.json());
app.use(session({ secret: "dessert-test-only", resave: false, saveUninitialized: false }));
registerStaffRoutes(app, storage);
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(err.status || 500).json({ message: err.message });
});
const member = await staffStorage.createStaff(insertStaffSchema.parse({
  loginId: "dessert-test", password: "dessert-test-only", name: "테스트 근무자",
}));
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert(address && typeof address === "object");
const base = `http://127.0.0.1:${address.port}`;
let cookie = "";
const post = (path: string, body: unknown, authenticated = true) => fetch(base + path, {
  method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { Cookie: cookie } : {}) },
  body: JSON.stringify(body),
});
const day = () => fetch(base + "/api/staff/dessert-logs/day?date=2026-09-15", { headers: { Cookie: cookie } }).then(r => r.json());
try {
  assert.equal((await post("/api/staff/dessert-items", { name: "무단 등록" }, false)).status, 401);
  const login = await post("/api/staff/login", { loginId: member.loginId, password: "dessert-test-only" }, false);
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  for (const body of [{ name: "  " }, { name: "가".repeat(41) }, { name: "케이크", unit: "가".repeat(11) }]) {
    assert.equal((await post("/api/staff/dessert-items", body)).status, 400);
  }
  const created = await post("/api/staff/dessert-items", { name: "  바스크   치즈케이크 ", unit: "조각", active: 0 });
  assert.equal(created.status, 201);
  const cake: DessertItem = await created.json();
  assert.equal(cake.name, "바스크 치즈케이크");
  assert.equal(cake.unit, "조각");
  assert.equal(cake.active, 1);
  for (const name of ["바스크치즈케이크", "바스크 치즈케이크".normalize("NFD")]) {
    assert.equal((await post("/api/staff/dessert-items", { name })).status, 409);
  }
  const simultaneous = await Promise.all([
    post("/api/staff/dessert-items", { name: "레몬 마들렌", unit: "" }),
    post("/api/staff/dessert-items", { name: "레몬마들렌" }),
  ]);
  assert.deepEqual(simultaneous.map(r => r.status).sort(), [201, 409]);
  const madeleine: DessertItem = await simultaneous.find(r => r.status === 201)!.json();
  assert.equal(madeleine.unit, "개");
  assert.equal((await day()).rows.length, 2);
  assert.equal((await post("/api/staff/dessert-logs/save", {
    prodDate: "2026-09-15", kind: "produce", rows: [{ itemId: cake.id, value: 12 }, { itemId: madeleine.id, value: 20 }],
  })).status, 200);
  assert.equal((await post("/api/staff/dessert-logs/save", {
    prodDate: "2026-09-15", kind: "discard", rows: [{ itemId: madeleine.id, value: 2 }],
  })).status, 200);
  const before = await staffStorage.listDessertLogs("2026-09-15", "2026-09-15");
  assert.equal((await post("/api/staff/dessert-items", { name: "초콜릿 쿠키" })).status, 201);
  assert.deepEqual(await staffStorage.listDessertLogs("2026-09-15", "2026-09-15"), before);
  const read = await day();
  assert.equal(read.rows.find((r: any) => r.itemId === madeleine.id).qty, 20);
  assert.equal(read.rows.find((r: any) => r.itemId === madeleine.id).discardQty, 2);
  assert.equal(read.rows.find((r: any) => r.name === "초콜릿 쿠키").qty, 0);
  // Adding permission does not grant staff the owner's edit/hide controls.
  assert.equal((await fetch(base + `/api/admin/staff/dessert-items/${cake.id}`, { method: "DELETE", headers: { Cookie: cookie } })).status, 403);
  await staffStorage.deleteDessertItem(cake.id);
  assert.deepEqual(await staffStorage.listDessertLogs("2026-09-15", "2026-09-15"), before);
  assert(!(await day()).rows.some((r: any) => r.itemId === cake.id));
  await staffStorage.updateStaff(member.id, { active: 0 });
  assert.equal((await post("/api/staff/dessert-items", { name: "퇴사 후 등록" })).status, 403);
  console.log("PASS: active staff access, input validation, normalized/concurrent duplicate rejection, shared production/discard records and history preservation");
} finally {
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  sqlite.close();
  rmSync(dataDir, { recursive: true, force: true });
}
