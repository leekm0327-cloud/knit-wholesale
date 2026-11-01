import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { customers, products, orders, type Order } from "../../shared/schema";
import { confirmCustomerOrder } from "../../server/order-confirmation";
import { orderToKakaoText } from "../../client/src/lib/kakaoFormat";
import { customerOrderHandler } from "./fixtures/customer-order-handler";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "knit-order-request-"));
const { db, sqlite, storage } = await import("../../server/storage");
let checks = 0;
async function test(name: string, fn: () => unknown) {
  await fn(); checks++; console.log(`PASS ${name}`);
}
const customer = db.insert(customers).values({ email: "fixture@example.invalid", password: "fixture",
  businessName: "테스트 커피", managerName: "가상 담당자", phone: "000-0000-0000",
  defaultAddress: "가상 배송지", createdAt: 1 }).returning().get();
const product = db.insert(products).values({ name: "코튼 블렌드 1kg", category: "blend", price: 10000,
  description: "가상 상품", createdAt: 1 } as any).returning().get();
const items = [{ productId: product.id, name: product.name, category: product.category,
  unitPrice: product.price, qty: 5, amount: product.price * 5 }];
const patch = customerOrderHandler(storage);
async function edit(id: number, body: any, userId = customer.id) {
  let status = 200, value: any;
  const res = { status(n: number) { status = n; return this; }, json(v: any) { value = v; return this; } };
  await patch({ params: { id: String(id) }, session: { userId }, body }, res);
  return { status, value };
}
let serial = 0;
function save(body: any) {
  const quote = confirmCustomerOrder(db, customer.id, body).quote;
  return confirmCustomerOrder(db, customer.id, { ...body, confirmationRevision: quote.revision }, `FIXTURE-${++serial}`).order!;
}
const baseline = "1. 테스트 커피\n- 주소: 가상 배송지\n- 연락처: 가상 담당자 / 000-0000-0000\n- 품목: 코튼 블렌드 1kg * 5";
const snapshot = JSON.stringify({ businessName: customer.businessName, defaultAddress: customer.defaultAddress,
  managerName: customer.managerName, phone: customer.phone });
const formatOrder = { customerSnapshot: snapshot, items: JSON.stringify(items), adminMemo: "내부 메모 제외" } as Order;

try {
  for (const note of [undefined, null, "", " \t\n\r\n　 "]) {
    await test(`empty/whitespace memo omitted: ${JSON.stringify(note)}`, () => {
      assert.equal(orderToKakaoText({ ...formatOrder, note } as Order), baseline);
    });
  }
  for (const note of ["홀빈으로 보내 주세요.", "첫째 줄\n둘째 줄: 문 앞\n\n마지막 줄", "  한글 👋\r\n둘째 줄  "]) {
    await test(`memo preserved exactly: ${JSON.stringify(note)}`, () => {
      assert.equal(orderToKakaoText({ ...formatOrder, note }), `${baseline}\n- 주문 메모: ${note}`);
    });
  }
  await test("multiple items and return notice retain their original format", () => {
    const multi = { ...formatOrder, note: "주문 메모", items: JSON.stringify([
      ...items, { ...items[0], name: "린넨 1kg", qty: 2 }, { ...items[0], name: "반품 원두", qty: -1 },
    ]) };
    assert.equal(orderToKakaoText(multi), "1. 테스트 커피\n- 주소: 가상 배송지\n- 연락처: 가상 담당자 / 000-0000-0000\n- 품목:\n1) 코튼 블렌드 1kg * 5\n2) 린넨 1kg * 2\n- 반품·차감 확인 (발주 수량 제외): 반품 원두 -1\n- 주문 메모: 주문 메모");
  });
  for (const note of [undefined, "", " \t\n　", "문 앞에 놓아 주세요", "첫째 줄\n둘째 줄\n\n한글 마지막"]) {
    await test(`create order without desiredDate, memo=${JSON.stringify(note)}`, () => {
      db.delete(orders).run();
      const body = { items, ...(note === undefined ? {} : { note }) };
      const order = save(body);
      assert.equal(order.desiredDate, "");
      assert.equal(order.totalAmount, 55000);
      assert.equal(order.note, note?.trim() ?? "");
      const text = orderToKakaoText(order);
      assert.equal(text, order.note ? `${baseline}\n- 주문 메모: ${order.note}` : baseline);
    });
  }
  await test("same-day merge preserves historical date and multiline notes", () => {
    db.delete(orders).run();
    const first = save({ items, note: "기존 메모" });
    db.update(orders).set({ desiredDate: "2030-01-01" }).where(eq(orders.id, first.id)).run();
    const merged = save({ items, note: "추가 메모\n둘째 줄" });
    assert.equal(merged.id, first.id);
    assert.equal(merged.desiredDate, "2030-01-01");
    assert.equal(merged.totalAmount, 110000);
    assert.equal(merged.note, "기존 메모\n[추가 주문] 추가 메모\n둘째 줄");
    assert(orderToKakaoText(merged).endsWith(`- 주문 메모: ${merged.note}`));
  });
  await test("customer PATCH omits date, preserves historical value and exact memo", async () => {
    const previous = db.select().from(orders).get()!;
    const note = "  첫째 줄\n둘째 줄\n\n한글 마지막  ";
    const result = await edit(previous.id, { items, note, quickRequest: true });
    assert.equal(result.status, 200);
    assert.equal(result.value.desiredDate, "2030-01-01");
    assert.equal(result.value.note, note);
    assert.equal(result.value.totalAmount, 55000);
    assert.equal(result.value.quickRequest, 1);
    assert.equal(orderToKakaoText(result.value), `${baseline}\n- 주문 메모: ${note}`);
    const persisted = await storage.getOrder(previous.id);
    assert.equal(persisted!.desiredDate, "2030-01-01");
  });
  await test("legacy explicit dates and clearing remain compatible", async () => {
    const order = db.select().from(orders).get()!;
    for (const desiredDate of ["2031-02-03", ""]) {
      const result = await edit(order.id, { items, desiredDate });
      assert.equal(result.status, 200);
      assert.equal(result.value.desiredDate, desiredDate);
    }
  });
  await test("customer PATCH still rejects other owners, completed orders and invalid items", async () => {
    const order = db.select().from(orders).get()!;
    assert.equal((await edit(order.id, { items }, customer.id + 1)).status, 403);
    assert.equal((await edit(order.id, { items: [] })).status, 400);
    db.update(orders).set({ status: "done" }).where(eq(orders.id, order.id)).run();
    assert.equal((await edit(order.id, { items })).status, 400);
  });
  console.log(`${checks} scenario groups passed; disposable SQLite only; no external integrations or messages.`);
} finally { sqlite.close(); }
