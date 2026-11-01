import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { dessertItems, dessertLogs } from "../../shared/schema";
import { dessertFixture } from "./fixtures/dessert-manager";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");
let role = "owner";
const { app, db, sqlite, staffStorage, member } = await dessertFixture(() => role);
app.get("/api/auth/me", (_req, res) => role === "none" ? res.status(401).end() : res.json({
  id: 1, role: "admin", adminRole: role, managerName: "가상 관리자", businessName: "테스트 매장", bizVerified: 1,
}));
app.get("/api/{*path}", (_req, res) => res.json([]));
app.use("/api", (_req, res) => res.status(405).json({ message: "Fixture disallows this operation" }));
app.use(express.static(resolve("dist/public")));
const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
const origin = `http://127.0.0.1:${(server.address() as any).port}`;
const out = resolve("artifacts/dessert-manager"); mkdirSync(out, { recursive: true });
let browser: any;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  for (const [label, width, height] of [["desktop", 1440, 1050], ["mobile", 390, 844]] as const) {
    role = "owner"; db.delete(dessertLogs).run(); db.delete(dessertItems).run();
    const first = await staffStorage.createDessertItem({ name: "휘낭시에", unit: "개" });
    const cake = await staffStorage.createDessertItem({ name: "바스크 치즈케이크", unit: "조각" });
    const hidden = await staffStorage.createDessertItem({ name: "레몬 케이크", unit: "개" });
    await staffStorage.updateDessertItem(hidden.id, { active: 0 });
    const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    await staffStorage.saveDessertLogs(member.id, member.name, day, "produce", [{ itemId: cake.id, value: 12 }]);
    await staffStorage.saveDessertLogs(member.id, member.name, day, "discard", [{ itemId: cake.id, value: 2 }]);
    const history = await staffStorage.listDessertLogs(day, day);
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    await context.route("**/*", (route: any) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    const page = await context.newPage(); const errors: string[] = [];
    page.on("pageerror", (error: Error) => { errors.push(error.message); console.error(error.message); });
    async function mutation(method: string, action: () => Promise<unknown>, status = 200) {
      const [response] = await Promise.all([
        page.waitForResponse((r: any) => r.url().includes("/api/admin/staff/dessert-items") && r.request().method() === method), action(),
      ]);
      assert.equal(response.status(), status);
    }
    const shot = (name: string) => page.screenshot({ path: join(out, `${label}-${name}.png`), fullPage: true, animations: "disabled" });
    await page.goto(origin + "/#/admin/workspace/store");
    await page.locator("a.erp-module").filter({ hasText: "디저트 목록" }).click();
    await page.getByRole("heading", { name: "디저트 목록", exact: true }).waitFor();
    await page.getByTestId(`row-dessert-item-${cake.id}`).waitFor();
    await page.getByTestId("input-dessert-item-name").fill("밤 휘낭시에");
    await page.getByTestId("input-dessert-item-unit").fill("개");
    await mutation("POST", () => page.getByTestId("button-add-dessert-item").click());
    const added = (await staffStorage.listDessertItems()).find(item => item.name === "밤 휘낭시에")!;
    assert(added); await page.getByTestId(`row-dessert-item-${added.id}`).waitFor();
    await page.getByTestId(`edit-dessert-${cake.id}`).click();
    await page.getByTestId("edit-dessert-name").fill(first.name);
    await mutation("PATCH", () => page.getByTestId("save-dessert-edit").click(), 409);
    await page.getByText("같은 이름의 사용 중인 디저트가 있습니다. 품목명을 확인해 주세요.", { exact: true }).waitFor();
    assert.equal(await page.getByTestId("edit-dessert-name").inputValue(), first.name);
    await page.getByTestId("edit-dessert-name").fill("바닐라 치즈케이크");
    await page.getByTestId("edit-dessert-unit").fill("판");
    await shot("edit");
    await mutation("PATCH", () => page.getByTestId("save-dessert-edit").click());
    await page.getByTestId("edit-dessert-name").waitFor({ state: "hidden" });
    assert.deepEqual(await staffStorage.listDessertLogs(day, day), history);
    await mutation("POST", () => page.getByRole("button", { name: "바닐라 치즈케이크 위로", exact: true }).click());
    assert.equal((await staffStorage.listDessertItems())[0].id, cake.id);
    await mutation("PATCH", () => page.getByTestId(`toggle-dessert-${cake.id}`).click());
    await page.getByTestId(`row-dessert-item-${cake.id}`).waitFor({ state: "hidden" });
    assert(!(await staffStorage.listDessertItems()).some(item => item.id === cake.id));
    await page.getByTestId("dessert-filter-inactive").click();
    await page.getByTestId(`row-dessert-item-${cake.id}`).waitFor(); await shot("inactive");
    await mutation("PATCH", () => page.getByTestId(`toggle-dessert-${cake.id}`).click());
    await page.getByTestId(`row-dessert-item-${cake.id}`).waitFor({ state: "hidden" });
    await page.getByTestId("dessert-filter-active").click(); await page.getByTestId(`row-dessert-item-${cake.id}`).waitFor();
    assert.deepEqual(await staffStorage.listDessertLogs(day, day), history);
    await page.getByRole("textbox", { name: "디저트 검색" }).fill("치즈");
    assert.equal(await page.locator('[data-testid^="row-dessert-item-"]').count(), 1);
    await page.getByRole("textbox", { name: "디저트 검색" }).fill("");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await shot("list");
    await page.getByRole("link", { name: "생산·폐기 기록 보기", exact: true }).click();
    await page.getByRole("link", { name: "디저트 목록 관리", exact: true }).waitFor();
    await page.getByText("바스크 치즈케이크", { exact: true }).waitFor();
    assert.equal(await page.getByTestId("button-add-dessert-item").count(), 0);
    await page.getByRole("link", { name: "디저트 목록 관리", exact: true }).click();
    await page.getByTestId("button-add-dessert-item").waitFor();

    role = "manager"; await page.goto("about:blank"); await page.goto(origin + "/#/admin/dessert-items");
    await page.getByText("관리자는 목록을 확인할 수 있습니다. 추가·수정·사용 여부 변경은 대표 계정에서 가능합니다.", { exact: true }).waitFor();
    await page.getByTestId(`row-dessert-item-${cake.id}`).waitFor();
    assert.equal(await page.getByTestId("button-add-dessert-item").count(), 0);
    assert.equal(await page.locator('[data-testid^="edit-dessert-"]').count(), 0);
    assert.equal(await page.locator('[data-testid^="toggle-dessert-"]').count(), 0);
    await shot("manager-readonly");

    role = "owner";
    await page.route("**/api/admin/staff/dessert-items", (route: any) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Fixture load failure" }) }));
    await page.reload(); await page.getByText("디저트 목록을 불러오지 못했습니다.", { exact: true }).waitFor();
    await page.getByTestId("input-dessert-item-name").fill("불러오기 실패 중 추가 금지");
    assert.equal(await page.getByTestId("button-add-dessert-item").isDisabled(), true);
    await page.unroute("**/api/admin/staff/dessert-items"); await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
    await page.getByTestId(`row-dessert-item-${cake.id}`).waitFor();
    assert.deepEqual(errors, []); await context.close();
    console.log(`PASS ${label}: menu discovery, add/edit/duplicate feedback/reorder/deactivate/reactivate/search, history preserved, records link, manager read-only, load-error recovery, no overflow or browser errors`);
  }
} finally { await browser?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); sqlite.close(); }
