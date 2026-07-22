import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errMsg, won, CATEGORY_LABEL } from "@/lib/format";
import type { Order, OrderItem, Product, Customer, CustomerPrice } from "@shared/schema";
import { Plus, Minus, Trash2, Loader2, X } from "lucide-react";

interface EditItem {
  productId: number;
  name: string;
  category: string;
  unitPrice: number;
  qty: number;
}

interface Props {
  order: Order;
  // "customer" → PATCH /api/orders/:id, "admin" → PATCH /api/admin/orders/:id
  mode: "customer" | "admin";
  onDone: () => void;
  onCancel: () => void;
}

export function OrderItemsEditor({ order, mode, onDone, onCancel }: Props) {
  const { toast } = useToast();
  const { data: products } = useQuery<Product[]>({ queryKey: ["/api/products"] });

  // 관리자 수정 시: 이 주문 거래처의 등록단가(커스텀) + 매장 내부 계정 여부를 반영해 단가 결정
  const isAdmin = mode === "admin";
  const { data: adminPrices } = useQuery<CustomerPrice[]>({
    queryKey: [`/api/admin/customers/${order.customerId}/prices`],
    enabled: isAdmin,
  });
  const { data: adminCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/admin/customers"],
    enabled: isAdmin,
  });
  const overrideMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of adminPrices ?? []) m.set(p.productId, p.price);
    return m;
  }, [adminPrices]);
  const isStoreCustomer = useMemo(
    () => !!((adminCustomers ?? []).find((c) => c.id === order.customerId) as any)?.isStore,
    [adminCustomers, order.customerId],
  );

  // 품목 추가 시 단가: 관리자+매장 → 매입원가, 관리자 → 등록단가 ?? 기본가, 거래처 → effectivePrice ?? 기본가
  function priceOf(p: Product): number {
    if (isAdmin) {
      if (isStoreCustomer) return (p as any).costPrice ?? 0;
      return overrideMap.get(p.id) ?? p.price;
    }
    return (p as any).effectivePrice ?? p.price;
  }

  const initialItems: OrderItem[] = useMemo(() => {
    try {
      return JSON.parse(order.items);
    } catch {
      return [];
    }
  }, [order.items]);

  const [items, setItems] = useState<EditItem[]>(
    initialItems.map((i) => ({
      productId: i.productId,
      name: i.name,
      category: i.category,
      unitPrice: i.unitPrice,
      qty: i.qty,
    })),
  );
  const [desiredDate, setDesiredDate] = useState(order.desiredDate ?? "");
  const [note, setNote] = useState(order.note ?? "");
  const [quickRequest, setQuickRequest] = useState((order as any).quickRequest === 1);
  const [addProductId, setAddProductId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const supplyAmount = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const vat = Math.round(supplyAmount * 0.1);
  const total = supplyAmount + vat;

  function setQty(productId: number, qty: number) {
    if (qty < 1) return;
    setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, qty } : i)));
  }

  function removeItem(productId: number) {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  function addProduct() {
    const pid = Number(addProductId);
    if (!pid) return;
    if (items.some((i) => i.productId === pid)) {
      toast({ title: "이미 추가된 품목입니다.", variant: "destructive" });
      return;
    }
    const p = products?.find((pp) => pp.id === pid);
    if (!p) return;
    const unitPrice = priceOf(p);
    setItems((prev) => [
      ...prev,
      { productId: p.id, name: p.name, category: p.category, unitPrice, qty: 1 },
    ]);
    setAddProductId("");
  }

  const availableToAdd = (products ?? []).filter(
    (p) => p.available === 1 && !items.some((i) => i.productId === p.id),
  );

  async function submit() {
    if (items.length === 0) {
      toast({ title: "주문 품목을 선택해 주세요.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const body = {
      items: items.map((i) => ({
        productId: i.productId,
        name: i.name,
        category: i.category,
        unitPrice: i.unitPrice,
        qty: i.qty,
        amount: i.unitPrice * i.qty,
      })),
      desiredDate,
      note,
      quickRequest,
    };
    const url = mode === "admin" ? `/api/admin/orders/${order.id}` : `/api/orders/${order.id}`;
    try {
      await apiRequest("PATCH", url, body);
      queryClient.invalidateQueries({ queryKey: ["/api/orders", String(order.id)] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "주문이 수정되었습니다." });
      onDone();
    } catch (err: any) {
      toast({ title: "수정 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-5 p-5" data-testid="order-items-editor">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-foreground">주문 수정</h2>
        <button
          onClick={onCancel}
          className="p-1 text-muted-foreground hover-elevate"
          aria-label="수정 취소"
          data-testid="button-close-editor"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 품목 리스트 */}
      <div className="space-y-2.5">
        {items.map((i) => (
          <div
            key={i.productId}
            className="flex flex-col gap-2 border border-border p-3 sm:flex-row sm:items-center"
            data-testid={`row-edit-${i.productId}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{i.name}</span>
                <span className="shrink-0 border border-border px-1.5 py-0.5 font-ui text-[10px] tracking-wide text-muted-foreground">
                  {CATEGORY_LABEL[i.category] ?? i.category}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">단가 {won(i.unitPrice)}</div>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <div className="flex items-center border border-border">
                <button
                  onClick={() => setQty(i.productId, i.qty - 1)}
                  className="px-2 py-1.5 text-muted-foreground hover-elevate"
                  aria-label="수량 감소"
                  data-testid={`button-edit-minus-${i.productId}`}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-8 text-center text-sm font-semibold tabular">{i.qty}</span>
                <button
                  onClick={() => setQty(i.productId, i.qty + 1)}
                  className="px-2 py-1.5 text-muted-foreground hover-elevate"
                  aria-label="수량 증가"
                  data-testid={`button-edit-plus-${i.productId}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="w-24 text-right text-sm font-semibold tabular text-foreground">
                {won(i.unitPrice * i.qty)}
              </div>
              <button
                onClick={() => removeItem(i.productId)}
                className="p-1.5 text-muted-foreground hover-elevate"
                aria-label="삭제"
                data-testid={`button-edit-remove-${i.productId}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            품목이 없습니다. 아래에서 품목을 추가해 주세요.
          </p>
        )}
      </div>

      {/* 품목 추가 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs">품목 추가</Label>
          <Select value={addProductId} onValueChange={setAddProductId}>
            <SelectTrigger data-testid="select-add-product">
              <SelectValue placeholder="상품 선택" />
            </SelectTrigger>
            <SelectContent>
              {availableToAdd.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">추가할 상품이 없습니다.</div>
              ) : (
                availableToAdd.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name} · {won(priceOf(p))}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          onClick={addProduct}
          disabled={!addProductId}
          data-testid="button-add-product"
        >
          <Plus className="mr-1.5 h-4 w-4" /> 추가
        </Button>
      </div>

      {/* 희망 납품일 / 요청사항 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-desired" className="text-xs">희망 납품일</Label>
          <Input
            id="edit-desired"
            type="date"
            value={desiredDate}
            onChange={(e) => setDesiredDate(e.target.value)}
            data-testid="input-edit-desired-date"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-note" className="text-xs">요청사항</Label>
        <Textarea
          id="edit-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="예: 홀빈으로 주세요 / 오전 배송 희망 등"
          data-testid="input-edit-note"
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
        <input
          type="checkbox"
          checked={quickRequest}
          onChange={(e) => setQuickRequest(e.target.checked)}
          className="h-4 w-4 accent-foreground"
          data-testid="checkbox-edit-quick-request"
        />
        퀵 요청
      </label>

      {/* 합계 */}
      <div className="space-y-2 border-t border-border pt-4 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>공급가액</span>
          <span className="tabular text-foreground">{won(supplyAmount)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>부가세 (10%)</span>
          <span className="tabular text-foreground">{won(vat)}</span>
        </div>
        <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
          <span className="text-foreground">합계</span>
          <span className="font-ui tabular text-foreground" data-testid="text-edit-total">{won(total)}</span>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving} data-testid="button-cancel-edit">
          취소
        </Button>
        <Button onClick={submit} disabled={saving} data-testid="button-save-edit">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          수정 저장
        </Button>
      </div>
    </Card>
  );
}
