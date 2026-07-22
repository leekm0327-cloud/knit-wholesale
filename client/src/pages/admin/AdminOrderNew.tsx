import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { won } from "@/lib/format";
import { errMsg } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import type { Customer, Product, CustomerPrice } from "@shared/schema";
import { Plus, Trash2, Loader2, ShoppingCart } from "lucide-react";

const BEAN_CATEGORIES = ["blend", "decaf", "single"];

type CartLine = { productId: number; qty: number };

export default function AdminOrderNew() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [customerId, setCustomerId] = useState<string>("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [addProductId, setAddProductId] = useState<string>("");
  const [desiredDate, setDesiredDate] = useState("");
  const [note, setNote] = useState("");
  const [quickRequest, setQuickRequest] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 거래처 목록 (승인/활성 거래처)
  const { data: customers, isLoading: loadingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/admin/customers"],
  });
  // 전체 상품 목록
  const { data: products, isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });
  // 카테고리(원두 여부)
  const { data: categoryRows } = useQuery<any[]>({ queryKey: ["/api/product-categories"] });
  // 선택 거래처의 등록 단가 오버라이드
  const numericCustomerId = customerId ? Number(customerId) : 0;
  const { data: prices } = useQuery<CustomerPrice[]>({
    queryKey: [`/api/admin/customers/${numericCustomerId}/prices`],
    enabled: numericCustomerId > 0,
  });

  const customerList = useMemo(
    () => (customers ?? []).filter((c) => c.role === "customer"),
    [customers],
  );
  const availableProducts = useMemo(
    () => (products ?? []).filter((p) => p.available),
    [products],
  );

  const priceMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of prices ?? []) m.set(p.productId, p.price);
    return m;
  }, [prices]);

  // 선택 거래처가 '매장 내부 계정'이면 매입원가(costPrice) 기준으로 계상
  const selectedIsStore = useMemo(
    () => !!((customers ?? []).find((c) => c.id === numericCustomerId) as any)?.isStore,
    [customers, numericCustomerId],
  );

  // 매장 계정 = 매입원가 / 그 외 = 거래처 등록단가(있으면) ?? 기본가
  function unitPriceOf(product: Product): number {
    if (selectedIsStore) return (product as any).costPrice ?? 0;
    return priceMap.get(product.id) ?? product.price;
  }

  const productById = useMemo(() => {
    const m = new Map<number, Product>();
    for (const p of products ?? []) m.set(p.id, p);
    return m;
  }, [products]);

  const cartRows = useMemo(() => {
    return lines
      .map((l) => {
        const product = productById.get(l.productId);
        if (!product) return null;
        const unitPrice = unitPriceOf(product);
        return {
          product,
          qty: l.qty,
          unitPrice,
          amount: unitPrice * l.qty,
          hasCustomPrice: priceMap.has(product.id),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, productById, priceMap]);

  const supplyAmount = cartRows.reduce((s, r) => s + r.amount, 0);
  const vat = Math.round(supplyAmount * 0.1);
  const totalAmount = supplyAmount + vat;

  // 원두 = 카테고리 관리의 isBean (싱글 오리진 포함). 로딩 전 폴백 포함.
  const beanKeys = new Set(
    categoryRows && categoryRows.length > 0
      ? categoryRows.filter((c) => c.isBean).map((c) => c.key)
      : BEAN_CATEGORIES,
  );
  // 원두 수량 합계 (샘플 제외 — 관리자 대리주문은 일반 도매)
  const beanQtyTotal = cartRows
    .filter((r) => beanKeys.has(r.product.category))
    .reduce((s, r) => s + r.qty, 0);
  // 매장 내부 계정은 도매 최소주문(5kg)·상품별 최소수량에서 제외 (내부 소비용)
  const beanShortage = !selectedIsStore && beanQtyTotal > 0 && beanQtyTotal < 5;

  // 상품별 최소 주문 수량 위반
  const minViolations = selectedIsStore
    ? []
    : cartRows
        .map((r) => ({ name: r.product.name, qty: r.qty, min: (r.product as any).minOrderQty ?? 0 }))
        .filter((v) => v.min > 0 && v.qty > 0 && v.qty < v.min);
  const orderBlocked = beanShortage || minViolations.length > 0;

  function addLine() {
    const pid = Number(addProductId);
    if (!pid) return;
    setLines((prev) => {
      const exist = prev.find((l) => l.productId === pid);
      if (exist) return prev.map((l) => (l.productId === pid ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { productId: pid, qty: 1 }];
    });
    setAddProductId("");
  }
  function setQty(productId: number, qty: number) {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, qty: Math.max(1, qty) } : l)));
  }
  function removeLine(productId: number) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  async function submit() {
    if (!numericCustomerId) {
      toast({ variant: "destructive", title: "거래처를 선택해 주세요." });
      return;
    }
    if (cartRows.length === 0) {
      toast({ variant: "destructive", title: "주문 품목을 추가해 주세요." });
      return;
    }
    if (beanShortage) {
      toast({ variant: "destructive", title: "원두는 최소 5kg(수량 5개)부터 주문 가능합니다." });
      return;
    }
    if (minViolations.length > 0) {
      const v = minViolations[0];
      toast({ variant: "destructive", title: `'${v.name}'은(는) 최소 ${v.min}개부터 주문 가능합니다.` });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        customerId: numericCustomerId,
        items: cartRows.map((r) => ({
          productId: r.product.id,
          name: r.product.name,
          category: r.product.category,
          unitPrice: r.unitPrice,
          qty: r.qty,
          amount: r.amount,
        })),
        desiredDate,
        note,
        quickRequest,
      };
      const res = await apiRequest("POST", "/api/admin/orders", payload);
      const data = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: "대리 주문 생성 완료", description: `주문번호 ${data.orderNo}` });
      navigate(`/admin/orders/${data.orderId ?? data.id}`);
    } catch (e) {
      toast({ variant: "destructive", title: "주문 생성 실패", description: errMsg(e) });
    } finally {
      setSubmitting(false);
    }
  }

  const selectedCustomer = customerList.find((c) => c.id === numericCustomerId);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <div className="eyebrow">Orders</div>
          <h1 className="font-display mt-1 text-xl font-semibold text-foreground">대리 주문 입력</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            거래처를 대신하여 도매 주문을 생성합니다. 거래처 등록 단가가 자동 적용됩니다.
          </p>
        </div>

        {loadingCustomers || loadingProducts ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-4">
            {/* 거래처 선택 */}
            <Card className="p-5">
              <label className="mb-2 block text-sm font-semibold text-foreground">거래처 선택</label>
              <Select
                value={customerId}
                onValueChange={(v) => {
                  setCustomerId(v);
                  setLines([]);
                }}
              >
                <SelectTrigger data-testid="select-admin-order-customer">
                  <SelectValue placeholder="거래처를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {customerList.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.businessName} ({c.managerName})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCustomer && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {selectedCustomer.phone} · 결제: {selectedCustomer.paymentMethod}
                </p>
              )}
            </Card>

            {/* 품목 추가 */}
            <Card className="p-5">
              <label className="mb-2 block text-sm font-semibold text-foreground">품목 추가</label>
              <div className="flex flex-wrap gap-2">
                <Select value={addProductId} onValueChange={setAddProductId}>
                  <SelectTrigger className="flex-1 min-w-[220px]" data-testid="select-admin-order-product">
                    <SelectValue placeholder="상품을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProducts.map((p) => {
                      const up = numericCustomerId ? unitPriceOf(p) : p.price;
                      return (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name} — {won(up)}
                          {numericCustomerId && priceMap.has(p.id) ? " (등록단가)" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addLine}
                  disabled={!addProductId}
                  data-testid="button-admin-order-add-item"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  담기
                </Button>
              </div>
              {!numericCustomerId && (
                <p className="mt-2 text-xs text-muted-foreground">
                  거래처를 먼저 선택하면 해당 거래처 등록 단가로 미리보기됩니다.
                </p>
              )}
            </Card>

            {/* 담긴 품목 */}
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">주문 품목</span>
              </div>
              {cartRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">담긴 품목이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {cartRows.map((r) => (
                    <div
                      key={r.product.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3"
                      data-testid={`row-admin-order-item-${r.product.id}`}
                    >
                      <div className="min-w-[160px] flex-1">
                        <div className="text-sm font-medium text-foreground">{r.product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {won(r.unitPrice)}
                          {r.hasCustomPrice ? " · 등록단가" : ""}
                        </div>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        value={r.qty}
                        onChange={(e) => setQty(r.product.id, Number(e.target.value))}
                        className="w-20"
                        data-testid={`input-admin-order-qty-${r.product.id}`}
                      />
                      <div className="w-24 text-right text-sm font-medium text-foreground">
                        {won(r.amount)}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(r.product.id)}
                        data-testid={`button-admin-order-remove-${r.product.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {beanShortage && (
                <p className="mt-3 text-sm text-destructive">
                  원두는 최소 5kg(수량 5개)부터 주문 가능합니다. 현재 {beanQtyTotal}개.
                </p>
              )}
              {minViolations.map((v) => (
                <p key={v.name} className="mt-2 text-sm text-destructive">
                  '{v.name}'은(는) 최소 {v.min}개부터 주문 가능합니다. 현재 {v.qty}개.
                </p>
              ))}

              {cartRows.length > 0 && (
                <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">공급가액</span>
                    <span className="text-foreground">{won(supplyAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">부가세</span>
                    <span className="text-foreground">{won(vat)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span className="text-foreground">합계</span>
                    <span className="text-foreground">{won(totalAmount)}</span>
                  </div>
                </div>
              )}
            </Card>

            {/* 추가 정보 */}
            <Card className="p-5 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-foreground">희망 배송일</label>
                <Input
                  type="date"
                  value={desiredDate}
                  onChange={(e) => setDesiredDate(e.target.value)}
                  data-testid="input-admin-order-desired-date"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-foreground">메모</label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="주문 메모 (선택)"
                  data-testid="input-admin-order-note"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={quickRequest}
                  onCheckedChange={(v) => setQuickRequest(!!v)}
                  data-testid="checkbox-admin-order-quick"
                />
                빠른 발송 요청
              </label>
            </Card>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => navigate("/admin/orders")}>
                취소
              </Button>
              <Button
                onClick={submit}
                disabled={submitting || !numericCustomerId || cartRows.length === 0 || orderBlocked}
                data-testid="button-admin-order-submit"
              >
                {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                주문 생성
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
