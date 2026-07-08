import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { won, errMsg } from "@/lib/format";
import type { Supplier, SupplierPayment } from "@shared/schema";
import { Wallet, Trash2, Loader2 } from "lucide-react";

const METHOD_LABEL: Record<string, string> = {
  transfer: "계좌이체",
  cash: "현금",
  card: "카드",
  other: "기타",
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AdminSupplierPayments() {
  const { toast } = useToast();
  const { data: suppliers } = useQuery<Supplier[]>({ queryKey: ["/api/admin/suppliers"] });
  const { data: payments, isLoading } = useQuery<SupplierPayment[]>({ queryKey: ["/api/admin/supplier-payments"] });

  const [supplierId, setSupplierId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayStr());
  const [method, setMethod] = useState("transfer");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!supplierId) {
      toast({ variant: "destructive", title: "공급처를 선택해 주세요." });
      return;
    }
    const amt = Number(amount);
    if (!(amt > 0)) {
      toast({ variant: "destructive", title: "지급액을 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/admin/supplier-payments", {
        supplierId: Number(supplierId),
        amount: Math.round(amt),
        paidAt,
        method,
        memo,
      });
      toast({ title: "지급 내역이 등록되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/supplier-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/supplier-balances"] });
      setAmount("");
      setMemo("");
    } catch (e) {
      toast({ variant: "destructive", title: "등록 실패", description: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: SupplierPayment) {
    if (!confirm(`${p.paidAt} ${won(p.amount)} 지급 내역을 삭제할까요?`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/supplier-payments/${p.id}`);
      toast({ title: "지급 내역이 삭제되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/supplier-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/supplier-balances"] });
    } catch (e) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(e) });
    }
  }

  const supplierName = (sid: number) => suppliers?.find((s) => s.id === sid)?.name ?? `#${sid}`;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Supplier Payments</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">공장 지급 관리</h1>
        <p className="mb-6 text-sm text-muted-foreground">OEM 공장에 송금한 지급 내역 등록 · 채무 차감</p>

        {/* 지급 입력 */}
        <Card className="mb-6 p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">지급 등록</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">공급처 *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger data-testid="select-payment-supplier">
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
              <Label className="text-xs">지급액 *</Label>
              <Input type="number" step="1" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" data-testid="input-payment-amount" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">지급일 *</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} data-testid="input-payment-date" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">지급 수단</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger data-testid="select-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(METHOD_LABEL).map(([v, label]) => (
                    <SelectItem key={v} value={v}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <Label className="text-xs">메모</Label>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} placeholder="비고" data-testid="input-payment-memo" />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={submit} disabled={busy} data-testid="button-submit-payment">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Wallet className="mr-1.5 h-4 w-4" /> 지급 등록
            </Button>
          </div>
        </Card>

        {/* 지급 목록 */}
        <Card className="overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">지급 목록</h2>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !payments || payments.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Wallet className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">등록된 지급 내역이 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">지급일</th>
                    <th className="px-4 py-2 text-left font-medium">공급처</th>
                    <th className="px-4 py-2 text-left font-medium">수단</th>
                    <th className="px-4 py-2 text-left font-medium">메모</th>
                    <th className="px-4 py-2 text-right font-medium">지급액</th>
                    <th className="px-4 py-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payments.map((p) => (
                    <tr key={p.id} data-testid={`row-payment-${p.id}`}>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{p.paidAt}</td>
                      <td className="px-4 py-3 text-foreground">{supplierName(p.supplierId)}</td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-[10px]">{METHOD_LABEL[p.method] ?? p.method}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[200px]">{p.memo || "-"}</td>
                      <td className="px-4 py-3 text-right font-display tabular font-semibold text-foreground">{won(p.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => remove(p)} aria-label="삭제" data-testid={`button-delete-payment-${p.id}`}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
