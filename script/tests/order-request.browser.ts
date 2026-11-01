import assert from "node:assert/strict";
import express from "express";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { customers, products, orders } from "../../shared/schema";
import { confirmCustomerOrder, OrderConfirmationError } from "../../server/order-confirmation";
import { orderToKakaoText } from "../../client/src/lib/kakaoFormat";
import { customerOrderHandler } from "./fixtures/customer-order-handler";

// Built React app, loopback fixture API and disposable DB only. No production
// route registration, integration, scheduler, notification or system clipboard.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "knit-order-request-ui-"));
const { db, sqlite, storage } = await import("../../server/storage");
const user = db.insert(customers).values({ email: "fixture@example.invalid", password: "fixture",
  businessName: "테스트 커피", managerName: "가상 담당자", phone: "000-0000-0000",
  defaultAddress: "서울 테스트구 테스트로 10, 1층 (가상 배송지)", bizVerified: 1, createdAt: 1 }).returning().get();
const product = db.insert(products).values({ name: "코튼 블렌드 1kg", category: "blend", price: 23000,
  description: "가상 상품", createdAt: 1 } as any).returning().get();
const cart = [{ productId: product.id, name: product.name, category: product.category, unitPrice: product.price, qty: 5 }];
const customerPatch = customerOrderHandler(storage);
const payloads: { method: string; body: any }[] = [];
let role = "customer", serial = 0;
const app = express(); app.use(express.json());
app.get("/api/auth/me", (_req, res) => { const { password, ...pub } = user; res.json({ ...pub, role, adminRole: "manager" }); });
app.get("/api/products", (_req, res) => res.json([{ ...product, effectivePrice: product.price }]));
app.get("/api/product-categories", (_req, res) => res.json([{ key: "blend", label: "블렌드", isBean: 1, active: 1 }]));
app.get(["/api/orders/mine", "/api/admin/orders"], (_req, res) => res.json(db.select().from(orders).all()));
app.get("/api/orders/:id", (req, res) => res.json(db.select().from(orders).where(eq(orders.id, Number(req.params.id))).get()));
app.get("/api/admin/orders/:id/purchase-check", (_req, res) => res.json({ state: "empty", current: null }));
app.get("/api/admin/customers/:id/ledger", (_req, res) => res.json({ balance: { balance: 0 }, payments: [] }));
app.post("/api/orders/preview", (req, res) => {
  payloads.push({ method: "preview", body: req.body });
  try { res.json(confirmCustomerOrder(db, user.id, req.body).quote); }
  catch (e) { res.status(e instanceof OrderConfirmationError ? e.status : 500).json({ message: (e as Error).message }); }
});
app.post("/api/orders", (req, res) => {
  payloads.push({ method: "post", body: req.body });
  try { const r = confirmCustomerOrder(db, user.id, req.body, `UI-${++serial}`); res.json({ ...r.order, merged: !!r.todayPending }); }
  catch (e) { res.status(e instanceof OrderConfirmationError ? e.status : 500).json({ message: (e as Error).message }); }
});
app.patch("/api/orders/:id", async (req, res) => {
  payloads.push({ method: "patch", body: req.body });
  await customerPatch({ ...req, params: req.params, body: req.body, session: { userId: user.id } }, res);
});
// Only a fixture status update to exercise the UI's automatic-copy callback.
// The actual admin PATCH (factory orders, notifications etc.) is never loaded.
app.patch("/api/admin/orders/:id", (req, res) => {
  assert.deepEqual(Object.keys(req.body).sort(), ["skipAutoPurchase", "status"]);
  const order = db.update(orders).set({ status: req.body.status }).where(eq(orders.id, Number(req.params.id))).returning().get();
  res.json(order);
});
app.get("/api/{*path}", (_req, res) => res.json([]));
app.use("/api", (_req, res) => res.status(405).json({ message: "Fixture disallows this operation" }));
app.use(express.static(process.env.UI_DIST || resolve("dist/public")));
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((ok, fail) => { server.once("listening", ok); server.once("error", fail); });
const origin = `http://127.0.0.1:${(server.address() as any).port}`;
const out = resolve("artifacts/order-request"); mkdirSync(out, { recursive: true });
let browser: any;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  for (const [label, width, height] of [["desktop", 1440, 1050], ["mobile", 390, 844]] as const) {
    db.delete(orders).run(); payloads.length = 0; role = "customer";
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    await context.route("**/*", (route: any) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    // Plain JavaScript avoids TSX's function-name helpers in the browser realm.
    await context.addInitScript({ content: `if (location.origin === ${JSON.stringify(origin)}) {
      localStorage.setItem("knit.cart.v1", ${JSON.stringify(JSON.stringify(cart))});
      const w = window; w.__copied = null; w.__denyCopy = false; w.__legacy = false;
      Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => {
        if (w.__denyCopy) throw new Error("Fixture clipboard denial"); w.__copied = text;
      } } });
      const secure = window.isSecureContext;
      Object.defineProperty(window, "isSecureContext", { get: () => !w.__legacy && secure });
      document.execCommand = (command) => {
        if (command !== "copy") throw new Error("Unexpected command");
        if (w.__denyCopy) return false;
        w.__copied = document.activeElement.value; return true;
      };
    }` });
    const page = await context.newPage(); const errors: string[] = [];
    page.on("pageerror", (e: Error) => { errors.push(e.message); console.error("Browser error:", e.message); });
    const note = "문 앞에 놓아 주세요.\n둘째 줄: 홀빈으로 부탁해요.\n\n감사합니다.";
    const shot = async (name: string) => page.screenshot({ path: join(out, `${label}-${name}.png`), fullPage: true, animations: "disabled" });
    await page.goto(origin + "/#/cart"); await page.getByTestId("button-submit-order").waitFor();
    assert.equal(await page.locator('input[type="date"]').count(), 0);
    await page.getByTestId("input-note").fill(note); await shot("cart");
    await page.getByTestId("button-submit-order").click(); await page.getByTestId("order-confirmation").waitFor();
    assert.equal(await page.getByText("희망 배송일", { exact: false }).count(), 0);
    assert.equal(await page.getByTestId("button-confirm-order").isEnabled(), true);
    await shot("confirmation"); await page.getByTestId("button-confirm-order").click();
    await page.waitForURL("**/#/invoice/*");
    const order = db.select().from(orders).get()!;
    assert.equal(order.desiredDate, ""); assert.equal(order.note, note); assert.equal(order.totalAmount, 126500);
    db.update(orders).set({ desiredDate: "2030-01-01" }).where(eq(orders.id, order.id)).run();
    await page.goto(origin + `/#/orders/${order.id}`); await page.getByTestId("button-edit-order").click();
    await page.getByTestId("order-items-editor").waitFor();
    assert.equal(await page.getByTestId("input-edit-desired-date").count(), 0);
    assert.equal(await page.getByTestId("order-items-editor").locator('input[type="date"]').count(), 0);
    const edited = note + "\n수정한 메모";
    await page.getByTestId("input-edit-note").fill(edited); await shot("customer-edit");
    await page.getByTestId("button-save-edit").click(); await page.getByTestId("order-items-editor").waitFor({ state: "hidden" });
    assert.equal((await storage.getOrder(order.id))!.desiredDate, "2030-01-01");
    assert.equal((await storage.getOrder(order.id))!.note, edited);
    assert(payloads.some(p => p.method === "post") && payloads.some(p => p.method === "patch"));
    for (const p of payloads) assert.equal(Object.hasOwn(p.body, "desiredDate"), false, `${p.method} must omit desiredDate`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

    role = "admin";
    // Full document load refreshes the auth fixture, rather than reusing the
    // customer session cached by React Query during a hash-only navigation.
    await page.goto("about:blank");
    for (const memo of ["", " \t\n　", "한 줄 메모", edited]) {
      db.update(orders).set({ note: memo }).where(eq(orders.id, order.id)).run();
      await page.goto(origin + `/#/admin/orders/${order.id}`); await page.reload();
      await page.getByTestId("button-copy-kakao").click();
      await page.waitForFunction(() => (window as any).__copied !== null || document.querySelector('[data-testid="textarea-kakao-fallback"]'));
      const current = (await storage.getOrder(order.id))!;
      assert.equal(await page.evaluate(() => (window as any).__copied), orderToKakaoText(current));
      assert.equal((await page.evaluate(() => (window as any).__copied)).includes("- 주문 메모:"), !!memo.trim());
    }
    const expected = orderToKakaoText((await storage.getOrder(order.id))!);
    await page.evaluate(() => { (window as any).__legacy = true; (window as any).__copied = null; });
    await page.getByTestId("button-copy-kakao").click();
    assert.equal(await page.evaluate(() => (window as any).__copied), expected);
    await page.evaluate(() => { (window as any).__legacy = false; (window as any).__denyCopy = true; });
    await page.getByTestId("button-copy-kakao").click();
    assert.equal(await page.getByTestId("textarea-kakao-fallback").inputValue(), expected);
    await shot("kakao-fallback"); await page.getByTestId("button-kakao-fallback-close").click();
    await page.evaluate(() => { (window as any).__denyCopy = false; (window as any).__copied = null; });
    await page.getByTestId("button-toggle-status").click();
    await page.waitForFunction(() => (window as any).__copied !== null);
    assert.equal(await page.evaluate(() => (window as any).__copied), expected);
    assert.equal((await storage.getOrder(order.id))!.status, "done");
    await page.getByTestId("button-edit-order").click();
    assert.equal(await page.getByTestId("input-edit-desired-date").inputValue(), "2030-01-01");
    assert.deepEqual(errors, []); await context.close();
    console.log(`PASS ${label}: no date in cart/customer edit/POST/PATCH; local order created; historical date preserved; memo absent/blank/single/multiline; standard/legacy/fallback/automatic copy; admin date retained; zero browser errors`);
  }
} finally {
  await browser?.close(); server.closeAllConnections(); server.close(); sqlite.close();
}
