import { createContext, useContext, useEffect, useState } from "react";

// 장바구니를 브라우저에 저장해 새로고침·앱 전환 후에도 유지한다.
// (매장에서 앱을 자주 오가는 사장님들이 담아둔 품목을 잃지 않도록)
const STORAGE_KEY = "knit.cart.v1";

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 저장된 값이 손상돼도 앱이 죽지 않도록 형태를 검증해 걸러낸다.
    return parsed.filter(
      (i: any) =>
        i && typeof i.productId === "number" && typeof i.name === "string" &&
        typeof i.unitPrice === "number" && typeof i.qty === "number" && i.qty > 0,
    );
  } catch {
    return [];
  }
}

export interface CartItem {
  productId: number;
  name: string;
  category: string;
  unitPrice: number;
  qty: number;
}

interface CartState {
  items: CartItem[];
  add: (item: Omit<CartItem, "qty">, qty: number) => void;
  setQty: (productId: number, qty: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
  count: number;
  supplyAmount: number;
}

const CartCtx = createContext<CartState>(null as any);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadCart);

  // 담긴 내용이 바뀔 때마다 저장 (사파리 시크릿 모드 등 저장 불가 환경에서도 앱은 정상 동작)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch { /* 저장 실패는 무시 */ }
  }, [items]);

  function add(item: Omit<CartItem, "qty">, qty: number) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.productId === item.productId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        return next;
      }
      return [...prev, { ...item, qty }];
    });
  }

  function setQty(productId: number, qty: number) {
    setItems((prev) =>
      prev
        .map((i) => (i.productId === productId ? { ...i, qty } : i))
        .filter((i) => i.qty > 0),
    );
  }

  function remove(productId: number) {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  function clear() {
    setItems([]);
  }

  const count = items.reduce((s, i) => s + i.qty, 0);
  const supplyAmount = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);

  return (
    <CartCtx.Provider value={{ items, add, setQty, remove, clear, count, supplyAmount }}>
      {children}
    </CartCtx.Provider>
  );
}

export const useCart = () => useContext(CartCtx);
