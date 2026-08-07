import { useEffect, useRef, useState } from "react";
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
import type { Expense, FixedCostItem, Sector } from "@shared/schema";
import { SECTORS, SECTOR_LABEL } from "@shared/schema";
import { Receipt, Trash2, Loader2 } from "lucide-react";

const ETC_CATEGORY = "기타";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AdminExpenses() {
  const { toast } = useToast();
  const { data: expenses, isLoading } = useQuery<Expense[]>({ queryKey: ["/api/admin/expenses"] });
  const { data: items } = useQuery<FixedCostItem[]>({ queryKey: ["/api/admin/fixed-cost-items"] });

  const categories = [...(items ?? []).map((i) => i.name), ETC_CATEGORY];

  const [expenseDate, setExpenseDate] = useState(todayStr());
  const [category, setCategory] = useState("");
  const [sector, setSector] = useState<Sector>("common");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState<{ category: string; sector: string; basedOn: number } | null>(null);
  const touchedRef = useRef(false); // 사용자가 항목·부문을 직접 고르면 자동 추천을 덮어쓰지 않음

  async function submit() {
    const cat = category || categories[0] || "";
    if (!cat) {
      toast({ variant: "destructive", title: "항목을 선택해 주세요." });
      return;
    }
    const amt = Number(amount);
    if (!(amt >= 0) || amount === "") {
      toast({ variant: "destructive", title: "지출액을 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/admin/expenses", {
        expenseDate,
        category: cat,
        sector,
        amount: Math.round(amt),
        memo,
      });
      toast({ title: "지출이 저장되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      setAmount("");
      setMemo("");
    } catch (e) {
      toast({ variant: "destructive", title: "저장 실패", description: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(x: Expense) {
    if (!confirm(`${x.expenseDate} ${x.category} 지출을 삭제할까요?`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/expenses/${x.id}`);
      toast({ title: "지출이 삭제되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
    } catch (e) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(e) });
    }
  }

  // 항목을 고르면 그 항목의 기본 부문을 자동 선택 (사용자가 부문을 직접 바꾼 뒤에는 유지)
  function pickCategory(next: string) {
    setCategory(next);
    if (touchedRef.current) return;
    const it = (items ?? []).find((i) => i.name === next) as any;
    if (it?.sector) setSector(it.sector as Sector);
  }

  // 메모를 입력하면 과거 기록에서 항목·부문 추천
  useEffect(() => {
    const q = memo.trim();
    if (q.length < 2) { setSuggest(null); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const res = await apiRequest("GET", `/api/admin/expenses/suggest?memo=${encodeURIComponent(q)}`);
        const j = await res.json();
        if (alive) setSuggest(j && j.category ? j : null);
      } catch { /* 추천 실패는 무시 */ }
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [memo]);

  function applySuggest() {
    if (!suggest) return;
    setCategory(suggest.category);
    setSector(suggest.sector as Sector);
    touchedRef.current = true;
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Expenses</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">지출 입력</h1>
        <p className="mb-6 text-sm text-muted-foreground">고정비·기타 지출을 기록합니다. 공장 지급은 발주 관리에서 별도로 관리됩니다.</p>

        {/* 입력 폼 */}
        <Card className="mb-6 p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">지출 등록</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">지출일 *</Label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} data-testid="input-expense-date" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">항목 *</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={category || categories[0] || ""}
                onChange={(e) => pickCategory(e.target.value)}
                data-testid="select-expense-category"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">부문 *</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={sector}
                onChange={(e) => { touchedRef.current = true; setSector(e.target.value as Sector); }}
                data-testid="select-expense-sector"
              >
                {SECTORS.map((s) => (
                  <option key={s} value={s}>{SECTOR_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">지출액 *</Label>
              <Input type="number" step="1" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" data-testid="input-expense-amount" />
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <Label className="text-xs">메모</Label>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} placeholder="비고" data-testid="input-expense-memo" />
            {suggest && (suggest.category !== (category || categories[0]) || suggest.sector !== sector) && (
              <button
                type="button"
                onClick={applySuggest}
                className="mt-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                data-testid="button-apply-suggest"
              >
                과거 {suggest.basedOn}건과 같은 내용입니다 → <span className="font-medium text-foreground">{suggest.category} · {SECTOR_LABEL[suggest.sector as Sector]}</span> 로 맞추기
              </button>
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={submit} disabled={busy} data-testid="button-submit-expense">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              저장
            </Button>
          </div>
        </Card>

        {/* 목록 */}
        <Card className="overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">지출 목록</h2>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !expenses || expenses.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">등록된 지출이 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">지출일</th>
                    <th className="px-4 py-2 text-left font-medium">항목</th>
                    <th className="px-4 py-2 text-left font-medium">부문</th>
                    <th className="px-4 py-2 text-left font-medium">메모</th>
                    <th className="px-4 py-2 text-right font-medium">지출액</th>
                    <th className="px-4 py-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {expenses.map((x) => (
                    <tr key={x.id} data-testid={`row-expense-${x.id}`}>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{x.expenseDate}</td>
                      <td className="px-4 py-3 text-xs text-foreground whitespace-nowrap">{x.category}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{SECTOR_LABEL[(x as any).sector as Sector] ?? "-"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[220px]">{x.memo || "-"}</td>
                      <td className="px-4 py-3 text-right font-display tabular font-semibold text-foreground">{won(x.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => remove(x)} aria-label="삭제" data-testid={`button-delete-expense-${x.id}`}>
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
