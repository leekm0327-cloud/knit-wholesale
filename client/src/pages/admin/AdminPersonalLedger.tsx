import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { won, errMsg } from "@/lib/format";
import type { PersonalCategory, PersonalLedgerEntry, PersonalSummary } from "@shared/schema";
import { BookUser, Trash2, Plus, Loader2 } from "lucide-react";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 이번 달 1일
function monthStartStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

type LedgerType = "income" | "expense";

export default function AdminPersonalLedger() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isOwner = (user as any)?.adminRole === "owner";

  // 기간 필터 (기본: 이번 달)
  const initFrom = useMemo(() => monthStartStr(), []);
  const initTo = useMemo(() => todayStr(), []);
  const [from, setFrom] = useState(initFrom);
  const [to, setTo] = useState(initTo);

  // 입력 폼 상태
  const [date, setDate] = useState(todayStr());
  const [type, setType] = useState<LedgerType>("expense");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);

  // 카테고리 관리 상태
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<LedgerType>("expense");
  const [catBusy, setCatBusy] = useState(false);

  const { data: categories } = useQuery<PersonalCategory[]>({
    queryKey: ["/api/personal-categories"],
    enabled: isOwner,
  });

  const { data: entries, isLoading } = useQuery<PersonalLedgerEntry[]>({
    queryKey: ["/api/personal-ledger", { from, to }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/personal-ledger?from=${from}&to=${to}`);
      return res.json();
    },
    enabled: isOwner,
  });

  const { data: summary } = useQuery<PersonalSummary>({
    queryKey: ["/api/personal-ledger/summary", { from, to }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/personal-ledger/summary?from=${from}&to=${to}`);
      return res.json();
    },
    enabled: isOwner,
  });

  if (!isOwner) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">사장님(Owner) 전용 메뉴입니다.</p>
        </div>
      </AdminLayout>
    );
  }

  const catMap = new Map((categories ?? []).map((c) => [c.id, c]));
  const typeCategories = (categories ?? []).filter((c) => c.type === type);

  async function submit() {
    const cid = categoryId === "" ? (typeCategories[0]?.id ?? 0) : Number(categoryId);
    if (!cid) {
      toast({ variant: "destructive", title: "카테고리를 선택해 주세요." });
      return;
    }
    const amt = Number(amount);
    if (!(amt >= 0) || amount === "") {
      toast({ variant: "destructive", title: "금액을 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/personal-ledger", {
        date,
        type,
        categoryId: cid,
        amount: Math.round(amt),
        memo,
      });
      toast({ title: "가계부에 저장되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/personal-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["/api/personal-ledger/summary"] });
      setAmount("");
      setMemo("");
    } catch (e) {
      toast({ variant: "destructive", title: "저장 실패", description: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(x: PersonalLedgerEntry) {
    if (!confirm(`${x.date} 항목을 삭제할까요?`)) return;
    try {
      await apiRequest("DELETE", `/api/personal-ledger/${x.id}`);
      toast({ title: "삭제되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/personal-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["/api/personal-ledger/summary"] });
    } catch (e) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(e) });
    }
  }

  async function addCategory() {
    if (!newCatName.trim()) {
      toast({ variant: "destructive", title: "카테고리명을 입력해 주세요." });
      return;
    }
    setCatBusy(true);
    try {
      await apiRequest("POST", "/api/personal-categories", { name: newCatName.trim(), type: newCatType });
      toast({ title: "카테고리가 추가되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/personal-categories"] });
      setNewCatName("");
    } catch (e) {
      toast({ variant: "destructive", title: "추가 실패", description: errMsg(e) });
    } finally {
      setCatBusy(false);
    }
  }

  async function removeCategory(c: PersonalCategory) {
    if (!confirm(`'${c.name}' 카테고리를 삭제할까요?`)) return;
    try {
      await apiRequest("DELETE", `/api/personal-categories/${c.id}`);
      toast({ title: "카테고리가 삭제되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/personal-categories"] });
    } catch (e) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(e) });
    }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Personal ledger</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">개인 가계부</h1>
        <p className="mb-6 text-sm text-muted-foreground">사장님 개인 수입·지출 기록입니다. 사업 재무(경영 대시보드)와 완전히 분리되어 있습니다.</p>

        {/* 입력 폼 */}
        <Card className="mb-6 p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">항목 등록</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">날짜 *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-ledger-date" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">구분 *</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={type}
                onChange={(e) => { setType(e.target.value as LedgerType); setCategoryId(""); }}
                data-testid="select-ledger-type"
              >
                <option value="expense">지출</option>
                <option value="income">수입</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">카테고리 *</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={categoryId === "" ? (typeCategories[0]?.id ?? "") : categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                data-testid="select-ledger-category"
              >
                {typeCategories.length === 0 ? (
                  <option value="">카테고리 없음</option>
                ) : (
                  typeCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))
                )}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">금액 *</Label>
              <Input type="number" step="1" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" data-testid="input-ledger-amount" />
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <Label className="text-xs">메모</Label>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} placeholder="비고" data-testid="input-ledger-memo" />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={submit} disabled={busy} data-testid="button-submit-ledger">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              저장
            </Button>
          </div>
        </Card>

        {/* 기간 필터 + 요약 */}
        <Card className="mb-6 p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">시작일</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" data-testid="input-ledger-from" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">종료일</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" data-testid="input-ledger-to" />
            </div>
          </div>
          {summary && (
            <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4">
              <div>
                <p className="text-xs text-muted-foreground">수입</p>
                <p className="font-display mt-1 text-lg font-semibold tabular text-foreground" data-testid="text-total-income">{won(summary.totalIncome)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">지출</p>
                <p className="font-display mt-1 text-lg font-semibold tabular text-foreground" data-testid="text-total-expense">{won(summary.totalExpense)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">잔액</p>
                <p className={`font-display mt-1 text-lg font-semibold tabular ${summary.net < 0 ? "text-destructive" : "text-foreground"}`} data-testid="text-net">{won(summary.net)}</p>
              </div>
            </div>
          )}
          {summary && summary.byCategory.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
              {summary.byCategory.map((b) => (
                <Badge key={b.categoryId} variant="outline" className="text-[11px]">
                  {b.type === "income" ? "▲" : "▼"} {b.name} {won(b.amount)}
                </Badge>
              ))}
            </div>
          )}
        </Card>

        {/* 목록 */}
        <Card className="mb-6 overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">가계부 내역</h2>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !entries || entries.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <BookUser className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">기록이 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">날짜</th>
                    <th className="px-4 py-2 text-left font-medium">구분</th>
                    <th className="px-4 py-2 text-left font-medium">카테고리</th>
                    <th className="px-4 py-2 text-left font-medium">메모</th>
                    <th className="px-4 py-2 text-right font-medium">금액</th>
                    <th className="px-4 py-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.map((x) => (
                    <tr key={x.id} data-testid={`row-ledger-${x.id}`}>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{x.date}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {x.type === "income" ? (
                          <span className="text-foreground">수입</span>
                        ) : (
                          <span className="text-muted-foreground">지출</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground whitespace-nowrap">{catMap.get(x.categoryId)?.name ?? "(삭제됨)"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[220px]">{x.memo || "-"}</td>
                      <td className={`px-4 py-3 text-right font-display tabular font-semibold ${x.type === "income" ? "text-foreground" : "text-destructive"}`}>{won(x.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => remove(x)} aria-label="삭제" data-testid={`button-delete-ledger-${x.id}`}>
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

        {/* 카테고리 관리 */}
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">카테고리 관리</h2>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">구분</Label>
              <select
                className="flex h-9 w-28 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={newCatType}
                onChange={(e) => setNewCatType(e.target.value as LedgerType)}
                data-testid="select-new-category-type"
              >
                <option value="expense">지출</option>
                <option value="income">수입</option>
              </select>
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">새 카테고리명</Label>
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }}
                placeholder="예: 식비"
                data-testid="input-new-category"
              />
            </div>
            <Button onClick={addCategory} disabled={catBusy} data-testid="button-add-category">
              {catBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              추가
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(categories ?? []).map((c) => (
              <Badge key={c.id} variant="secondary" className="flex items-center gap-1.5 text-[11px]" data-testid={`badge-category-${c.id}`}>
                <span className="text-muted-foreground">{c.type === "income" ? "수입" : "지출"}</span>
                {c.name}
                <button onClick={() => removeCategory(c)} aria-label="삭제" className="ml-0.5 text-muted-foreground hover:text-destructive" data-testid={`button-delete-category-${c.id}`}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
