import assert from "node:assert/strict";
import { once } from "node:events";
import { dessertFixture } from "./fixtures/dessert-manager";

const { app, staffStorage, sqlite } = await dessertFixture(req => String(req.headers["x-fixture-role"] || "none"));
const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
const base = `http://127.0.0.1:${(server.address() as any).port}`;
const path = "/api/admin/staff/dessert-items";
let checks = 0;
async function call(method: string, url: string, body?: unknown, role = "owner") {
  const response = await fetch(base + url, { method, headers: { "Content-Type": "application/json", "x-fixture-role": role }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, value: await response.json() };
}
async function test(name: string, fn: () => unknown) { await fn(); checks++; console.log(`PASS ${name}`); }
const logs = () => staffStorage.listDessertLogs("2026-01-01", "2030-12-31");
let cake: any, cookie: any, historical: any;
try {
  await test("only owner can create/edit/deactivate/reactivate/reorder; managers can read", async () => {
    for (const role of ["none", "staff", "manager"]) {
      assert.equal((await call("POST", path, { name: "권한 없는 품목" }, role)).status, 403);
      assert.equal((await call("PATCH", path + "/1", { name: "수정" }, role)).status, 403);
      assert.equal((await call("PATCH", path + "/1", { active: 0 }, role)).status, 403);
      assert.equal((await call("PATCH", path + "/1", { active: 1 }, role)).status, 403);
      assert.equal((await call("POST", path + "/reorder", { ids: [1] }, role)).status, 403);
      assert.equal((await call("DELETE", path + "/1", undefined, role)).status, 403);
    }
    assert.equal((await call("GET", path, undefined, "manager")).status, 200);
    assert.equal((await call("GET", path, undefined, "staff")).status, 403);
  });
  await test("add normalized names and units with duplicate validation", async () => {
    const created = await call("POST", path, { name: "  바스크   치즈케이크 ", unit: "조각" });
    assert.equal(created.status, 200); cake = created.value;
    assert.equal(cake.name, "바스크 치즈케이크");
    assert.equal((await call("POST", path, { name: "바스크치즈케이크" })).status, 409);
    cookie = (await call("POST", path, { name: "초코 쿠키", unit: "개" })).value;
    assert.equal((await call("POST", "/api/staff/dessert-logs/save", { prodDate: "2026-10-01", kind: "produce", rows: [{ itemId: cake.id, value: 12 }] }, "staff")).status, 200);
    assert.equal((await call("POST", "/api/staff/dessert-logs/save", { prodDate: "2026-10-01", kind: "discard", rows: [{ itemId: cake.id, value: 2 }] }, "staff")).status, 200);
    historical = await logs(); assert.equal(historical.length, 1);
  });
  await test("rename/unit change keeps item ID and historical record byte-equivalent", async () => {
    const changed = await call("PATCH", path + `/${cake.id}`, { name: "  바닐라   치즈케이크 ", unit: "판" });
    assert.equal(changed.status, 200); assert.equal(changed.value.id, cake.id);
    assert.equal(changed.value.name, "바닐라 치즈케이크"); assert.equal(changed.value.unit, "판");
    assert.deepEqual(await logs(), historical);
    const past = (await call("GET", "/api/staff/dessert-logs/day?date=2026-10-01", undefined, "staff")).value.rows.find((r: any) => r.itemId === cake.id);
    assert.equal(past.name, cake.name); assert.equal(past.unit, "조각");
  });
  await test("deactivate and reactivate preserve history/references and share staff input list", async () => {
    assert.equal((await call("PATCH", path + `/${cake.id}`, { active: 0 })).status, 200);
    assert(!(await call("GET", "/api/staff/dessert-items", undefined, "staff")).value.some((r: any) => r.id === cake.id));
    assert((await call("GET", path)).value.some((r: any) => r.id === cake.id && r.active === 0));
    assert.deepEqual(await logs(), historical);
    assert.equal((await call("PATCH", path + `/${cake.id}`, { active: 1 })).status, 200);
    assert((await call("GET", "/api/staff/dessert-items", undefined, "staff")).value.some((r: any) => r.id === cake.id));
    assert.deepEqual(await logs(), historical);
  });
  await test("reject duplicate rename/reactivation, invalid fields and missing item", async () => {
    assert.equal((await call("PATCH", path + `/${cake.id}`, { name: "초코쿠키".normalize("NFD") })).status, 409);
    for (const patch of [{ name: "  " }, { name: "가".repeat(41) }, { unit: "가".repeat(11) }, { active: 2 }, {}])
      assert.equal((await call("PATCH", path + `/${cake.id}`, patch)).status, 400);
    assert.equal((await call("PATCH", path + "/99999", { name: "없음" })).status, 404);
    await call("PATCH", path + `/${cake.id}`, { active: 0, name: cookie.name });
    assert.equal((await call("PATCH", path + `/${cake.id}`, { active: 1 })).status, 409);
    await call("PATCH", path + `/${cake.id}`, { name: "바닐라 치즈케이크", active: 1 });
    assert.deepEqual(await logs(), historical);
  });
  await test("reorder updates displayed order; changing only name preserves unit", async () => {
    await call("POST", path + "/reorder", { ids: [cookie.id, cake.id] });
    assert.deepEqual((await call("GET", path)).value.map((r: any) => r.id), [cookie.id, cake.id]);
    const row = (await call("PATCH", path + `/${cake.id}`, { name: "새 치즈케이크" })).value;
    assert.equal(row.unit, "판");
    assert.deepEqual(await logs(), historical);
  });
  await test("editing a historical daily quantity retains its original name/unit; new day uses current values", async () => {
    await call("POST", "/api/staff/dessert-logs/save", { prodDate: "2026-10-01", kind: "discard", rows: [{ itemId: cake.id, value: 3 }] }, "staff");
    const past = (await logs()).find((r: any) => r.prodDate === "2026-10-01")!;
    assert.equal(past.itemId, cake.id); assert.equal(past.itemName, cake.name); assert.equal(past.unit, "조각");
    assert.equal(past.qty, 12); assert.equal(past.discardQty, 3);
    await call("POST", "/api/staff/dessert-logs/save", { prodDate: "2026-10-02", kind: "produce", rows: [{ itemId: cake.id, value: 1 }] }, "staff");
    const fresh = (await logs()).find((r: any) => r.prodDate === "2026-10-02")!;
    assert.equal(fresh.itemName, "새 치즈케이크"); assert.equal(fresh.unit, "판");
  });
  console.log(`${checks} scenario groups passed; isolated fixture records only; actual middleware/routes/storage; no external integrations.`);
} finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); sqlite.close(); }
