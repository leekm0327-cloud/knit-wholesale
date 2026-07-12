import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import type { Supplier, Purchase, Product, PurchaseItem } from "@shared/schema";
import { PackagePlus, Plus, Trash2, Loader2, Pencil } from "lucide-react";

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

export default function AdminPurchases() {
  const { toast } = useToast();
  const { data: suppliers } = useQuery<Supplier[]>({ queryKey: ["/api/admin/suppliers"] });
  const { data: products } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: purchases, isLoading } = useQuery<Purchase[]>({ queryKey: ["/api/admin/purchases"] });

  const [supplierId, setSupplierId] = useState<string>("");
  const [purchaseDate, setPurchaseDate] = useState(todayStr());
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingNo, setEditingNo] = useState<string>("");

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
    const wasEditing = editingId;
    setBusy(true);
    try {
      if (wasEditing) {
        await apiRequest("PATCH", `/api/admin/purchases/${wasEditing}`, {
          supplierId: Number(supplierId),
          purchaseDate,
          items,
          memo,
        });
        toast({ title: "발주가 수정되었습니다." });
      } else {
        await apiRequest("POST", "/api/admin/purchases", {
          supplierId: Number(supplierId),
          purchaseDate,
          items,
          memo,
        });
        toast({ title: "발주가 등록되었습니다." });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/supplier-balances"] });
      setLines([emptyLine()]);
      setMemo("");
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

  const supplierName = (sid: number) => suppliers?.find((s) => s.id === sid)?.name ?? `#${sid}`;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Purchases</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">발주 관리</h1>
        <p className="mb-6 text-sm text-muted-foreground">OEM 공장 발주 등록 · 공장 채무 반영</p>

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

          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <div className="text-sm text-muted-foreground">
              합계 <span className="ml-2 font-display text-lg font-semibold tabular text-foreground" data-testid="text-purchase-total">{won(total)}</span>
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">발주번호</th>
                    <th className="px-4 py-2 text-left font-medium">발주일</th>
                    <th className="px-4 py-2 text-left font-medium">공급처</th>
                    <th className="px-4 py-2 text-left font-medium">거래처(주문)</th>
                    <th className="px-4 py-2 text-left font-medium">품목</th>
                    <th className="px-4 py-2 text-right font-medium">합계</th>
                    <th className="px-4 py-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {purchases.map((p) => {
                    let itemCount = 0;
                    try {
                      itemCount = (JSON.parse(p.items) as PurchaseItem[]).length;
                    } catch {}
                    return (
                      <tr key={p.id} data-testid={`row-purchase-${p.id}`}>
                        <td className="px-4 py-3 font-display tabular text-xs font-semibold text-foreground whitespace-nowrap">{p.purchaseNo}</td>
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
                          ) : (
                            <span className="text-muted-foreground">직접 등록</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{itemCount}개 품목</td>
                        <td className="px-4 py-3 text-right font-display tabular font-semibold text-foreground">{won(p.totalAmount)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
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
