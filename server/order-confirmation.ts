import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { customers, products, productCategories, customerPrices, orders, createOrderSchema } from "@shared/schema";

export class OrderConfirmationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// No network or notification side effects. Both reads and the final write run
// synchronously in a SQLite transaction, so another writer cannot change the quote.
export function confirmCustomerOrder(db: BetterSQLite3Database, customerId: number, body: unknown, orderNo?: string) {
  return db.transaction((tx) => {
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) throw new OrderConfirmationError(400, parsed.error.errors[0]?.message ?? "입력값 오류");
    const input = parsed.data;
    const customer = tx.select().from(customers).where(eq(customers.id, customerId)).get();
    if (!customer) throw new OrderConfirmationError(401, "사용자 없음");
    const overrides = new Map(tx.select().from(customerPrices).where(eq(customerPrices.customerId, customerId)).all().map(p => [p.productId, p.price]));
    const beanKeys = new Set(tx.select().from(productCategories).all().filter(c => c.isBean).map(c => c.key));
    if (!beanKeys.size) ["blend", "decaf", "single"].forEach(k => beanKeys.add(k));
    const ids = new Set<number>();
    const newItems = input.items.map(it => {
      if (!Number.isSafeInteger(it.qty) || it.qty < 1 || !Number.isSafeInteger(it.productId) || it.productId < 1) throw new OrderConfirmationError(400, "올바른 상품과 수량을 입력해 주세요.");
      if (ids.has(it.productId)) throw new OrderConfirmationError(400, "같은 상품은 한 줄로 담아 주세요.");
      ids.add(it.productId);
      const p = tx.select().from(products).where(eq(products.id, it.productId)).get();
      if (!p || p.available === 0) throw new OrderConfirmationError(409, `'${p?.name ?? it.name}'은(는) 품절 또는 판매 중지되었습니다. 장바구니에서 삭제해 주세요.`);
      if (p.minOrderQty > 0 && it.qty < p.minOrderQty) throw new OrderConfirmationError(400, `'${p.name}'은(는) 최소 ${p.minOrderQty}개부터 주문 가능합니다. (현재 ${it.qty}개)`);
      // Preserve this customer endpoint's existing override/default price policy.
      const unitPrice = overrides.get(p.id) ?? p.price;
      if (!Number.isSafeInteger(unitPrice) || unitPrice < 0 || !Number.isSafeInteger(unitPrice * it.qty)) throw new OrderConfirmationError(400, "주문 수량 또는 금액이 허용 범위를 벗어났습니다.");
      return { productId: p.id, name: p.name, productName: p.name, category: p.category, unitPrice, qty: it.qty, amount: unitPrice * it.qty };
    });
    const now = Date.now(), kst = 9 * 3600000;
    const start = Math.floor((now + kst) / 86400000) * 86400000 - kst;
    const customerOrders = tx.select().from(orders).where(eq(orders.customerId, customerId)).orderBy(desc(orders.createdAt)).all();
    const todayPending = customerOrders.find(o => {
      if (o.status !== "pending" || o.createdAt < start || o.createdAt >= start + 86400000 || o.isSample === 1) return false;
      try { return !JSON.parse(o.items).some((i: any) => Number(i?.qty) < 0); } catch { return false; }
    });
    const existingItems: any[] = todayPending ? JSON.parse(todayPending.items) : [];
    const beanQty = newItems.filter(i => beanKeys.has(i.category)).reduce((s, i) => s + i.qty, 0);
    const existingBeanQty = existingItems.filter(i => beanKeys.has(i.category)).reduce((s, i) => s + Number(i.qty), 0);
    if (beanQty > 0 && beanQty + existingBeanQty < 5) throw new OrderConfirmationError(400, "원두는 최소 5kg(수량 5개)부터 주문 가능합니다.");
    const mergedItems = existingItems.map(i => ({ ...i }));
    for (const i of newItems) {
      // Preserve historical prices; a new price gets its own line in the same order.
      const prev = mergedItems.find(e => e.productId === i.productId && e.unitPrice === i.unitPrice);
      if (prev) { prev.qty += i.qty; prev.amount = prev.unitPrice * prev.qty; }
      else mergedItems.push({ ...i });
    }
    const itemsTotal = mergedItems.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const discountAmount = Math.min(Math.max(0, todayPending?.discountAmount ?? 0), itemsTotal);
    const supplyAmount = itemsTotal - discountAmount;
    const vat = Math.round(supplyAmount * 0.1), totalAmount = supplyAmount + vat;
    if (![itemsTotal, supplyAmount, vat, totalAmount].every(Number.isSafeInteger) || totalAmount < 0) throw new OrderConfirmationError(400, "주문 금액이 허용 범위를 벗어났습니다.");
    const prevNote = todayPending?.note.trim() ?? "", addedNote = input.note.trim();
    const note = prevNote && addedNote && prevNote !== addedNote ? `${prevNote}\n[추가 주문] ${addedNote}` : addedNote || prevNote;
    const quickRequest = todayPending?.quickRequest === 1 || input.quickRequest ? 1 : 0;
    const desiredDate = todayPending?.desiredDate ?? ""; // historical records remain intact
    const delivery = { businessName: customer.businessName, managerName: customer.managerName, phone: customer.phone, defaultAddress: customer.defaultAddress };
    const quote = { items: newItems, delivery, note, quickRequest, supplyAmount, vat, totalAmount, discountAmount,
      mergeOrderNo: todayPending?.orderNo ?? null, existingItems, finalItems: mergedItems,
      totalQty: mergedItems.reduce((s, i) => s + i.qty, 0), missingAddress: !customer.defaultAddress.trim(),
      priceChanges: newItems.filter((i, n) => i.unitPrice !== input.items[n].unitPrice).map(i => i.name) };
    // Order IDs prevent replay after the first order leaves pending (done/cancelled).
    // Includes full merge target revision + delivery and request details; never trust browser totals.
    const revision = createHash("sha256").update(JSON.stringify({ customerId, ...quote, priceChanges: undefined, previous: todayPending ?? null, orderIds: customerOrders.map(o => o.id).sort((a, b) => a - b) })).digest("hex");
    if (!orderNo) return { quote: { ...quote, revision } };
    if (quote.missingAddress) throw new OrderConfirmationError(400, "배송지를 등록해 주세요. 내 정보에서 수정할 수 있습니다.");
    if ((body as any)?.confirmationRevision !== revision) throw new OrderConfirmationError(409, "가격 또는 주문·배송 정보가 변경되었습니다. 주문 내용을 다시 확인해 주세요.");
    const customerSnapshot = JSON.stringify({ ...delivery, bizRegNo: customer.bizRegNo, taxEmail: customer.taxEmail, paymentMethod: customer.paymentMethod });
    const patch = { customerSnapshot, items: JSON.stringify(mergedItems), discountAmount, supplyAmount, vat, totalAmount, note, quickRequest, desiredDate };
    const order = todayPending
      ? tx.update(orders).set(patch).where(eq(orders.id, todayPending.id)).returning().get()!
      : tx.insert(orders).values({ ...patch, customerId, orderNo, isStoreOrder: customer.isStore ? 1 : 0,
          createdAt: now }).returning().get();
    return { quote: { ...quote, revision }, customer, newItems, todayPending, mergedItems, order };
  }, { behavior: orderNo ? "immediate" : "deferred" });
}
