import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { ItemPeriodSummary } from "@/components/ItemPeriodSummary";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import { won, fmtDate, errMsg } from "@/lib/format";
import type { Supplier, Purchase, Product, PurchaseItem, PublicCustomer } from "@shared/schema";
import { PackagePlus, Plus, Trash2, Loader2, Pencil, Send } from "lucide-react";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Line {
  productId: number | null;
  name: string;
  qty: string;
  unitPrice: string;
}

function emptyLine(): Line {
  return { productId: null, name: "", qty: "1", unitPrice: "0" };
}

type SendState =
  | { kind: "unsent"; label: string; sentAtText: "" }
  | { kind: "sent" | "changed" | "duplicate"; label: string; sentAtText: string };

// 발주 한 건의 이카운트 전송 상태
//  unsent    — 아직 안 보냄
//  sent      — 보냈고 그 뒤로 금액 변동 없음
//  changed   — 보낸 뒤 발주 금액이 바뀜 (이카운트 전표는 예전 금액 그대로)
//  duplicate — 두 번 이상 성공 전송됨 (이카운트에 전표가 여러 건)
function sendState(p: Purchase): SendState {
  const at = (p as any).ecountSentAt as number | null | undefined;
  if (!at) return { kind: "unsent", label: "미전송", sentAtText: "" };
  const when = new Date(at);
  const sentAtText = `${when.getFullYear()}.${String(when.getMonth() + 1).padStart(2, "0")}.${String(when.getDate()).padStart(2, "0")}`;
  const count = ((p as any).ecountSentCount as number | undefined) ?? 1;
  if (count > 1) return { kind: "duplicate", label: `중복 ${count}회`, sentAtText };
  const sentAmount = (p as any).ecountSentAmount as number | null | undefined;
  if (sentAmount != null && sentAmount !== p.totalAmount) return { kind: "changed", label: "수정됨", sentAtText };
  return { kind: "sent", label: "전송됨", sentAtText };
}

const SEND_BADGE: Record<SendState["kind"], string> = {
  unsent: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  sent: "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
  changed: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
  duplicate: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
};

export default function AdminPurchases() {
  const { toast } = useToast();
  const { data: suppliers } = useQuery<Supplier[]>({ queryKey: ["/api/admin/suppliers"] });
  const { data: products } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: purchases, isLoading } = useQuery<Purchase[]>({ queryKey: ["/api/admin/purchases"] });
  const { data: customers } = useQuery<PublicCustomer[]>({ queryKey: ["/api/admin/customers"] });

  const [supplierId, setSupplierId] = useState<string>("");
  const [purchaseDate, setPurchaseDate] = useState(todayStr());
  const [customerName, setCustomerName] = useState("");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingNo, setEditingNo] = useState<string>("");
  const [sendingId, setSendingId] = useState<number | null>(null);

  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(idx: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  // 제품 선택 시 이름/단가 자동채움 (매입단가는 공급처 최근 매입가 우선)
  async function pickProduct(idx: number, value: string) {
    if (value === "manual") {
      updateLine(idx, { productId: null });
      return;
    }
    const pid = Number(value);
    const prod = products?.find((p) => p.id === pid);
    const cost = Number((prod as any)?.costPrice ?? 0);
    // 상품에 매입금이 설정돼 있으면 발주 단가로 우선 적용 (수정 가능)
    updateLine(idx, { productId: pid, name: prod?.name ?? "", ...(cost > 0 ? { unitPrice: String(cost) } : {}) });
    if (cost > 0) return; // 매입금 우선
    // 매입금이 없을 때만 직전 매입가로 폴백
    if (!supplierId) return;
    try {
      const res = await apiRequest(
        "GET",
        `/api/admin/purchases/last-price?supplierId=${supplierId}&productId=${pid}&name=${encodeURIComponent(prod?.name ?? "")}`,
      );
      const data = await res.json();
      if (typeof data.unitPrice === "number" && data.unitPrice > 0) {
        updateLine(idx, { unitPrice: String(data.unitPrice) });
      }
    } catch {
      // 최근 매입가 조회 실패는 무시 (직접 입력)
    }
  }

  const total = lines.reduce((s, l) => s + Math.round((Number(l.qty) || 0) * (Number(l.unitPrice) || 0)), 0);

  async function submit() {
    if (!supplierId) {
      toast({ variant: "destructive", title: "공급처를 선택해 주세요." });
      return;
    }
    const items: PurchaseItem[] = [];
    for (const l of lines) {
      const qty = Number(l.qty);
      const unitPrice = Number(l.unitPrice);
      if (!l.name.trim()) {
        toast({ variant: "destructive", title: "품목명을 입력해 주세요." });
        return;
      }
      if (!(qty > 0)) {
        toast({ variant: "destructive", title: "수량을 입력해 주세요." });
        return;
      }
      items.push({
        productId: l.productId,
        name: l.name.trim(),
        qty,
        unitPrice: Math.max(0, Math.round(unitPrice)),
        amount: Math.round(qty * unitPrice),
      });
    }
    // 거래처명이 회원과 정확히 일치하면 id도 함께 저장(없으면 직접입력 텍스트만)
    const cName = customerName.trim();
    const matchedCustomer = cName ? (customers ?? []).find((c) => c.businessName === cName) : undefined;
    const customerPayload = { customerId: matchedCustomer?.id ?? null, customerName: cName };

    const wasEditing = editingId;
    setBusy(true);
    try {
      if (wasEditing) {
        await apiRequest("PATCH", `/api/admin/purchases/${wasEditing}`, {
          supplierId: Number(supplierId),
          purchaseDate,
          items,
          memo,
          ...customerPayload,
        });
        toast({ title: "발주가 수정되었습니다." });
      } else {
        await apiRequest("POST", "/api/admin/purchases", {
          supplierId: Number(supplierId),
          purchaseDate,
          items,
          memo,
          ...customerPayload,
        });
        toast({ title: "발주가 등록되었습니다." });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/supplier-balances"] });
      setLines([emptyLine()]);
      setMemo("");
      setCustomerName("");
      if (wasEditing) {
        // 수정 완료 후 폼 초기화
        setEditingId(null);
        setEditingNo("");
        setSupplierId("");
        setPurchaseDate(todayStr());
      }
    } catch (e) {
      toast({ variant: "destructive", title: wasEditing ? "수정 실패" : "등록 실패", description: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: Purchase) {
    if (!confirm(`발주 '${p.purchaseNo}'을(를) 삭제할까요?`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/purchases/${p.id}`);
      toast({ title: "발주가 삭제되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/supplier-balances"] });
    } catch (e) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(e) });
    }
  }

  function startEdit(p: Purchase) {
    let its: PurchaseItem[] = [];
    try {
      its = JSON.parse(p.items) as PurchaseItem[];
    } catch {}
    setEditingId(p.id);
    setEditingNo(p.purchaseNo);
    setSupplierId(String(p.supplierId));
    setPurchaseDate(p.purchaseDate);
    setCustomerName((p as any).customerName ?? "");
    setMemo(p.memo ?? "");
    setLines(
      its.length
        ? its.map((it) => ({
            productId: it.productId ?? null,
            name: it.name,
            qty: String(it.qty),
            unitPrice: String(it.unitPrice),
          }))
        : [emptyLine()],
    );
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingNo("");
    setSupplierId("");
    setPurchaseDate(todayStr());
    setMemo("");
    setLines([emptyLine()]);
  }

  async function sendToEcount(p: Purchase, force = false) {
    const st = sendState(p);
    if (!force) {
      const warn =
        st.kind === "sent"
          ? `발주 '${p.purchaseNo}'은(는) 이미 ${st.sentAtText}에 전송되었습니다.\n다시 보내면 이카운트에 구매전표가 한 건 더 쌓입니다. 그래도 보낼까요?`
          : st.kind === "changed"
            ? `발주 '${p.purchaseNo}'은(는) ${st.sentAtText}에 전송된 뒤 금액이 바뀌었습니다.\n다시 보내면 이카운트에는 예전 전표가 그대로 남고 새 전표가 추가됩니다. 이카운트에서 예전 전표를 먼저 지우셨나요?`
            : `발주 '${p.purchaseNo}'을(를) 이카운트 구매전표로 전송할까요?`;
      if (!confirm(warn)) return;
    }
    setSendingId(p.id);
    try {
      const res = await apiRequest("POST", `/api/admin/ecount/purchases/${p.id}/send`, st.kind === "unsent" ? {} : { force: true });
      const data = await res.json();
      const steps = (data.steps ?? []) as Array<{ step: string; ok: boolean; message: string }>;
      if (data.ok) {
        toast({ title: "이카운트 전송 완료", description: `발주 ${p.purchaseNo} 구매전표가 등록되었습니다.` });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/purchases"] });
      } else {
        const failed = steps.find((s) => !s.ok);
        toast({ variant: "destructive", title: "이카운트 전송 실패", description: failed?.message ?? data.message ?? "전송에 실패했습니다." });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "이카운트 전송 실패", description: errMsg(e) });
    } finally {
      setSendingId(null);
    }
  }

  const supplierName = (sid: number) => suppliers?.find((s) => s.id === sid)?.name ?? `#${sid}`;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Purchases</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">발주 관리</h1>
        <p className="mb-6 text-sm text-muted-foreground">OEM 공장 발주 등록 · 공장 채무 반영</p>

        <ItemPeriodSummary endpoint="/api/admin/purchases/item-summary" qtyLabel="발주 수량" amountLabel="발주 금액" detailEndpoint="/api/admin/purchases/item-detail" />

        {/* 매입단가 일괄 변경 — 공장 단가가 오른 뒤 그 시점 이후 발주를 한 번에 맞춘다 */}
        <RepriceCard products={products ?? []} />

        {/* 발주 입력 */}
        <Card className="mb-6 p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            {editingId ? `발주 수정 · ${editingNo}` : "발주 등록"}
          </h2>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">공급처 *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger data-testid="select-purchase-supplier">
                  <SelectValue placeholder="공급처 선택" />
                </SelectTrigger>
                <SelectContent>
                  {(suppliers ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">발주일 *</Label>
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} data-testid="input-purchase-date" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">거래처 (선택)</Label>
              <Input
                list="purchase-customer-list"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="회원 검색·선택 또는 직접 입력"
                data-testid="input-purchase-customer"
              />
              <datalist id="purchase-customer-list">
                {(customers ?? []).map((c) => (
                  <option key={c.id} value={c.businessName} />
                ))}
              </datalist>
              <p className="text-[11px] text-muted-foreground">이 발주가 어느 거래처를 위한 것인지 지정하면, 품목별 집계에서 거래처별 내역으로 볼 수 있어요.</p>
            </div>
          </div>

          {/* 품목 라인 */}
          <div className="space-y-3">
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-1 gap-2 border border-border p-3 sm:grid-cols-[1fr_1fr_90px_120px_110px_auto]" data-testid={`row-purchase-line-${idx}`}>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">제품</Label>
                  <Select value={l.productId ? String(l.productId) : "manual"} onValueChange={(v) => pickProduct(idx, v)}>
                    <SelectTrigger data-testid={`select-line-product-${idx}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">직접 입력</SelectItem>
                      {(products ?? []).map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">품목명</Label>
                  <Input value={l.name} onChange={(e) => updateLine(idx, { name: e.target.value })} placeholder="품목명" data-testid={`input-line-name-${idx}`} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">수량</Label>
                  <Input type="number" step="0.1" min="0" value={l.qty} onChange={(e) => updateLine(idx, { qty: e.target.value })} data-testid={`input-line-qty-${idx}`} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">매입단가</Label>
                  <Input type="number" step="1" min="0" value={l.unitPrice} onChange={(e) => updateLine(idx, { unitPrice: e.target.value })} data-testid={`input-line-price-${idx}`} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">금액</Label>
                  <div className="flex h-9 items-center justify-end px-1 text-sm font-semibold tabular text-foreground">
                    {won(Math.round((Number(l.qty) || 0) * (Number(l.unitPrice) || 0)))}
                  </div>
                </div>
                <div className="flex items-end justify-end">
                  <Button variant="ghost" size="icon" onClick={() => removeLine(idx)} aria-label="라인 삭제" data-testid={`button-remove-line-${idx}`}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={addLine} className="mt-3" data-testid="button-add-line">
            <Plus className="mr-1.5 h-4 w-4" /> 품목 추가
          </Button>

          <div className="mt-4 space-y-1.5">
            <Label className="text-xs">메모</Label>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} placeholder="비고" data-testid="input-purchase-memo" />
          </div>

          <div className="mt-4 flex items-end justify-between gap-4 border-t border-border pt-4">
            <div className="space-y-0.5 text-xs text-muted-foreground">
              <div className="flex justify-between gap-6"><span>공급가액</span><span className="tabular text-foreground">{won(total)}</span></div>
              <div className="flex justify-between gap-6"><span>부가세 (10%)</span><span className="tabular text-foreground">{won(Math.round(total * 0.1))}</span></div>
              <div className="flex justify-between gap-6 pt-0.5">
                <span className="text-sm font-semibold text-foreground">합계 (부가세 포함)</span>
                <span className="font-display text-lg font-semibold tabular text-foreground" data-testid="text-purchase-total">{won(total + Math.round(total * 0.1))}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {editingId && (
                <Button variant="ghost" onClick={cancelEdit} disabled={busy} data-testid="button-cancel-edit">
                  취소
                </Button>
              )}
              <Button onClick={submit} disabled={busy} data-testid="button-submit-purchase">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingId ? "발주 수정" : "발주 등록"}
              </Button>
            </div>
          </div>
        </Card>

        {/* 발주 목록 */}
        <Card className="overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">발주 목록</h2>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !purchases || purchases.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <PackagePlus className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">등록된 발주가 없습니다.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="sticky-col px-4 py-2 text-left font-medium">발주번호</th>
                    <th className="px-4 py-2 text-left font-medium">발주일</th>
                    <th className="px-4 py-2 text-left font-medium">공급처</th>
                    <th className="px-4 py-2 text-left font-medium">거래처(주문)</th>
                    <th className="px-4 py-2 text-left font-medium">품목</th>
                    <th className="px-4 py-2 text-right font-medium">합계 (부가세 포함)</th>
                    <th className="px-4 py-2 text-left font-medium">이카운트</th>
                    <th className="px-4 py-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[...purchases]
                    .sort(
                      (a, b) =>
                        (b.purchaseDate || "").localeCompare(a.purchaseDate || "") ||
                        b.id - a.id,
                    )
                    .map((p) => {
                    let itemCount = 0;
                    try {
                      itemCount = (JSON.parse(p.items) as PurchaseItem[]).length;
                    } catch {}
                    return (
                      <tr key={p.id} data-testid={`row-purchase-${p.id}`}>
                        <td className="sticky-col px-4 py-3 font-display tabular text-xs font-semibold text-foreground whitespace-nowrap">{p.purchaseNo}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{p.purchaseDate}</td>
                        <td className="px-4 py-3 text-foreground">{supplierName(p.supplierId)}</td>
                        <td className="px-4 py-3 text-xs">
                          {(p as any).sourceCustomer ? (
                            <div>
                              <div className="text-foreground">{(p as any).sourceCustomer}</div>
                              {(p as any).sourceOrderNo && (
                                <div className="font-mono text-[11px] text-muted-foreground">{(p as any).sourceOrderNo}</div>
                              )}
                            </div>
                          ) : (p as any).customerName ? (
                            <div className="text-foreground">{(p as any).customerName}</div>
                          ) : (
                            <span className="text-muted-foreground">직접 등록</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{itemCount}개 품목</td>
                        <td className="px-4 py-3 text-right">
                          <div className="font-display tabular font-semibold text-foreground">{won(p.totalAmount + Math.round(p.totalAmount * 0.1))}</div>
                          <div className="text-[10px] text-muted-foreground whitespace-nowrap">공급가 {won(p.totalAmount)} · VAT {won(Math.round(p.totalAmount * 0.1))}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {(() => {
                            const st = sendState(p);
                            return (
                              <div className="flex flex-col gap-0.5" data-testid={`ecount-state-${p.id}`}>
                                <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEND_BADGE[st.kind]}`}>
                                  {st.label}
                                </span>
                                {st.sentAtText && (
                                  <span className="text-[10px] text-muted-foreground">{st.sentAtText}</span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <Button variant="ghost" size="icon" onClick={() => sendToEcount(p)} disabled={sendingId === p.id} aria-label="이카운트 전송" title="이카운트 구매전표로 전송" data-testid={`button-ecount-purchase-${p.id}`}>
                            {sendingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 text-teal-700" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => startEdit(p)} aria-label="수정" data-testid={`button-edit-purchase-${p.id}`}>
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => remove(p)} aria-label="삭제" data-testid={`button-delete-purchase-${p.id}`}>
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}

// 공장 단가가 바뀌었을 때, 그 시점 이후에 이미 쌓인 발주의 단가를 한 번에 맞춘다.
// 바로 고치지 않고 먼저 무엇이 얼마나 바뀌는지 보여준다 — 공장 채무와 매출원가가 함께 움직이기 때문.
function RepriceCard({ products }: { products: Product[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [price, setPrice] = useState("");
  const [alsoCostPrice, setAlsoCostPrice] = useState(true);
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const numericPrice = Math.max(0, Math.round(Number(price.replace(/[^0-9]/g, "")) || 0));
  const ready = !!productId && /^\d{4}-\d{2}-\d{2}$/.test(from) && numericPrice > 0;

  async function loadPreview() {
    if (!ready) return;
    setBusy(true);
    try {
      const q = `productId=${productId}&from=${from}&to=${to || "2099-12-31"}&unitPrice=${numericPrice}`;
      const res = await apiRequest("GET", `/api/admin/purchases/reprice/preview?${q}`);
      setPreview(await res.json());
    } catch (e: any) {
      toast({ variant: "destructive", title: "미리보기 실패", description: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!preview || preview.summary.count === 0) return;
    const msg =
      `${preview.productName} 단가를 ${won(numericPrice)}으로 바꿉니다.\n` +
      `발주 ${preview.summary.count}건 · 공장 채무 ${preview.summary.diff >= 0 ? "+" : ""}${won(preview.summary.diff)}\n` +
      (preview.summary.alreadySent > 0
        ? `\n이 중 ${preview.summary.alreadySent}건은 이미 이카운트로 보낸 발주입니다.\n이카운트에는 예전 금액이 그대로 남으니 직접 고치셔야 합니다.\n`
        : "") +
      `\n계속할까요?`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/admin/purchases/reprice", {
        productId: Number(productId),
        from,
        to: to || "2099-12-31",
        unitPrice: numericPrice,
        alsoCostPrice,
      });
      const body = await res.json();
      toast({ title: body.message, description: alsoCostPrice ? "상품의 매입원가도 함께 바꿨습니다." : undefined });
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    } catch (e: any) {
      toast({ variant: "destructive", title: "변경 실패", description: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-6 p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
        data-testid="button-reprice-toggle"
      >
        <span className="text-sm font-semibold text-foreground">매입단가 일괄 변경</span>
        <span className="text-xs text-muted-foreground">{open ? "접기" : "펼치기"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <p className="break-keep text-xs leading-relaxed text-muted-foreground">
            공장 단가가 오른 경우, 그 시점 이후에 이미 등록된 발주의 단가를 한 번에 맞춥니다.
            발주 금액이 바뀌면 공장 채무와 매출원가도 함께 움직이니, 먼저 미리보기로 확인하세요.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">상품 *</Label>
              <Select value={productId} onValueChange={(v) => { setProductId(v); setPreview(null); }}>
                <SelectTrigger data-testid="select-reprice-product">
                  <SelectValue placeholder="상품 선택" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">새 매입단가 *</Label>
              <Input
                inputMode="numeric"
                value={price}
                onChange={(e) => { setPrice(e.target.value.replace(/[^0-9]/g, "")); setPreview(null); }}
                placeholder="예: 21900"
                data-testid="input-reprice-price"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">적용 시작일 *</Label>
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreview(null); }} data-testid="input-reprice-from" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">종료일 <span className="font-normal text-muted-foreground">(비우면 오늘까지 전부)</span></Label>
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreview(null); }} data-testid="input-reprice-to" />
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5">
            <Checkbox checked={alsoCostPrice} onCheckedChange={(v) => setAlsoCostPrice(!!v)} data-testid="check-reprice-costprice" />
            <span className="text-sm leading-snug text-foreground break-keep">
              상품의 매입원가도 함께 바꾸기
              <span className="mt-0.5 block text-xs text-muted-foreground">
                앞으로 들어올 자동발주와 매장 내부 계정 주문의 단가에 쓰입니다. 꺼두면 이미 쌓인 발주만 고칩니다.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={loadPreview} disabled={!ready || busy} data-testid="button-reprice-preview">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              미리보기
            </Button>
            {preview && preview.summary.count > 0 && (
              <Button onClick={apply} disabled={busy} data-testid="button-reprice-apply">적용하기</Button>
            )}
          </div>

          {preview && (
            preview.summary.count === 0 ? (
              <p className="text-sm text-muted-foreground">해당 기간에 단가를 바꿀 발주가 없습니다. (이미 새 단가이거나 그 품목이 든 발주가 없습니다)</p>
            ) : (
              <div className="space-y-2">
                <div className="border border-border bg-muted/30 px-4 py-3 text-sm break-keep">
                  <div className="font-semibold text-foreground">
                    발주 {preview.summary.count}건 · 공장 채무 {preview.summary.diff >= 0 ? "+" : ""}{won(preview.summary.diff)}
                  </div>
                  {preview.summary.alreadySent > 0 && (
                    <div className="mt-1 text-xs text-destructive">
                      이 중 {preview.summary.alreadySent}건은 이미 이카운트로 보냈습니다. 이카운트에는 예전 금액이 남으니 그쪽도 고치셔야 합니다.
                    </div>
                  )}
                </div>
                <div className="table-scroll">
                  <table className="w-full min-w-[560px] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="px-2 py-1.5 text-left font-medium">발주번호</th>
                        <th className="px-2 py-1.5 text-left font-medium">발주일</th>
                        <th className="px-2 py-1.5 text-right font-medium">수량</th>
                        <th className="px-2 py-1.5 text-right font-medium">기존 단가</th>
                        <th className="px-2 py-1.5 text-right font-medium">발주 금액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.rows.map((r: any) => (
                        <tr key={r.id}>
                          <td className="px-2 py-1.5 text-foreground">
                            {r.purchaseNo}
                            {r.ecountSentAt ? <span className="ml-1 text-[10px] text-destructive">전송됨</span> : null}
                          </td>
                          <td className="px-2 py-1.5 tabular text-muted-foreground">{r.purchaseDate.replace(/-/g, ".")}</td>
                          <td className="px-2 py-1.5 text-right tabular text-foreground">{r.qty}</td>
                          <td className="px-2 py-1.5 text-right tabular text-muted-foreground">{won(r.oldUnitPrice)}</td>
                          <td className="px-2 py-1.5 text-right tabular text-foreground">
                            {won(r.oldTotal)} <span className="text-muted-foreground">→</span>{" "}
                            <strong>{won(r.newTotal)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </Card>
  );
}
