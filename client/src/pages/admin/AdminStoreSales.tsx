import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { won, errMsg } from "@/lib/format";
import type { StoreSale } from "@shared/schema";
import { Store, Trash2, Loader2 } from "lucide-react";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AdminStoreSales() {
  const { toast } = useToast();
  const { data: sales, isLoading } = useQuery<StoreSale[]>({ queryKey: ["/api/admin/store-sales"] });

  const [saleDate, setSaleDate] = useState(todayStr());
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const amt = Number(amount);
    if (!(amt >= 0) || amount === "") {
      toast({ variant: "destructive", title: "매출액을 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/admin/store-sales", {
        saleDate,
        amount: Math.round(amt),
        memo,
      });
      toast({ title: "매장매출이 저장되었습니다.", description: "같은 날짜는 덮어쓰기 됩니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/store-sales"] });
      setAmount("");
      setMemo("");
    } catch (e) {
      toast({ variant: "destructive", title: "저장 실패", description: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: StoreSale) {
    if (!confirm(`${s.saleDate} 매장매출을 삭제할까요?`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/store-sales/${s.id}`);
      toast({ title: "매장매출이 삭제되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/store-sales"] });
    } catch (e) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(e) });
    }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Store Sales</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">매장매출 입력</h1>
        <p className="mb-6 text-sm text-muted-foreground">오프라인 매장의 일별 매출을 기록합니다. 같은 날짜는 덮어쓰기 됩니다.</p>

        {/* 입력 폼 */}
        <Card className="mb-6 p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">일별 매출 등록</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">매출일 *</Label>
              <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} data-testid="input-sale-date" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">매출액 *</Label>
              <Input type="number" step="1" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" data-testid="input-sale-amount" />
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <Label className="text-xs">메모</Label>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} placeholder="비고" data-testid="input-sale-memo" />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={submit} disabled={busy} data-testid="button-submit-sale">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              저장
            </Button>
          </div>
        </Card>

        {/* 목록 */}
        <Card className="overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">매장매출 목록</h2>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !sales || sales.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Store className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">등록된 매장매출이 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">매출일</th>
                    <th className="px-4 py-2 text-left font-medium">메모</th>
                    <th className="px-4 py-2 text-right font-medium">매출액</th>
                    <th className="px-4 py-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sales.map((s) => (
                    <tr key={s.id} data-testid={`row-sale-${s.id}`}>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{s.saleDate}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[220px]">{s.memo || "-"}</td>
                      <td className="px-4 py-3 text-right font-display tabular font-semibold text-foreground">{won(s.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => remove(s)} aria-label="삭제" data-testid={`button-delete-sale-${s.id}`}>
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
