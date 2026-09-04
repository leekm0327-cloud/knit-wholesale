// 이전 주문 다시 담기 — 주문 상세의 '이 주문 다시 담기'와 카탈로그 상단의 '지난 주문 그대로 담기'가 같은 규칙을 쓴다.
// 현재 판매 중인 상품만, 현재 적용가(effectivePrice) 기준으로 담는다. 단발성·품절·샘플 라인은 제외.
import type { Order, OrderItem, Product } from "@shared/schema";

export type ReorderResult = { added: number; skipped: string[] };

export function reorderItems(
  order: Pick<Order, "items">,
  products: Product[] | undefined,
  add: (item: { productId: number; name: string; category: string; unitPrice: number }, qty: number) => void,
): ReorderResult | null {
  let items: OrderItem[] = [];
  try {
    items = JSON.parse(order.items) as OrderItem[];
  } catch {
    return null;
  }
  const productMap = new Map((products ?? []).map((p) => [p.id, p]));
  let added = 0;
  const skipped: string[] = [];
  for (const it of items) {
    if (it.productId == null || it.qty <= 0 || it.unitPrice === 0) {
      skipped.push(it.name);
      continue;
    }
    const prod = productMap.get(it.productId);
    if (!prod || prod.available === 0) {
      skipped.push(it.name);
      continue;
    }
    const unitPrice = (prod as any).effectivePrice ?? prod.price;
    add({ productId: prod.id, name: prod.name, category: prod.category, unitPrice }, it.qty);
    added += 1;
  }
  return { added, skipped };
}

/** 카탈로그 상단 카드에 보여줄 '지난 주문' — 취소·샘플 제외, 가장 최근 것 */
export function lastRealOrder(orders: Order[] | undefined): Order | undefined {
  return (orders ?? [])
    .filter((o) => o.status !== "cancelled" && o.isSample !== 1 && o.totalAmount > 0)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

export function summarizeItems(order: Pick<Order, "items">, max = 3): string {
  try {
    const items = JSON.parse(order.items) as OrderItem[];
    const parts = items.filter((i) => i.qty > 0).map((i) => `${i.name.replace(/ 1kg$/, "")} ${i.qty}`);
    return parts.slice(0, max).join(" · ") + (parts.length > max ? ` 외 ${parts.length - max}` : "");
  } catch {
    return "";
  }
}
