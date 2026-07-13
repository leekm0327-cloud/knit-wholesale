import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { won, errMsg } from "@/lib/format";
import type {
  Expense,
  FixedCostItem,
  Sector,
  PersonalCategory,
  PersonalLedgerEntry,
  PersonalSummary,
} from "@shared/schema";
import { SECTORS, SECTOR_LABEL } from "@shared/schema";
import { Receipt, BookUser, Trash2, Plus, Loader2 } from "lucide-react";

const ETC_CATEGORY = "기타";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthStartStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

type Mode = "expense" | "personal";
type LedgerType = "income" | "expense";

/** 한 번 탭으로 선택하는 칩 버튼 (드롭다운 대체) */
function Chip({
  active,
  onClick,
  children,
  testid,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testid?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-input bg-transparent text-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

export default function AdminMoneyEntry() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isOwner = (user as any)?.adminRole === "owner";

  // 사업 지출 / 개인 가계부 (개인 가계부는 owner 전용)
  const [mode, setMode] = useState<Mode>("expense");

  // 공통 입력
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  // 엔터 중복 제출 방지 — 한글 IME에서 엔터 keydown이 두 번 발생해도 한 번만 저장되도록
  const submittingRef = useRef(false);

  // 사업 지출 입력
  const [category, setCategory] = useState("");
  const [sector, setSector] = useState<Sector>("common");

  // 개인 가계부 입력
  const [pType, setPType] = useState<LedgerType>("expense");
  const [categoryId, setCategoryId] = useState<number | "">("");

  // 개인 가계부 기간 필터
  const initFrom = useMemo(() => monthStartStr(), []);
  const initTo = useMemo(() => todayStr(), []);
  const [from, setFrom] = useState(initFrom);
  const [to, setTo] = useState(initTo);

  // 카테고리 관리(개인 가계부)
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<LedgerType>("expense");
  const [catBusy, setCatBusy] = useState(false);

  const { data: expenses, isLoading: expLoading } = useQuery<Expense[]>({
    queryKey: ["/api/admin/expenses"],
  });
  const { data: items } = useQuery<FixedCostItem[]>({
    queryKey: ["/api/admin/fixed-cost-items"],
  });
  const { data: categories } = useQuery<PersonalCategory[]>({
    queryKey: ["/api/personal-categories"],
    enabled: isOwner,
  });
  const { data: entries, isLoading: pLoading } = useQuery<PersonalLedgerEntry[]>({
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

  // 고정비 항목명 + '기타'. 고정비 항목에 이미 '기타'가 있으면 중복되므로 이름 기준으로 중복 제거.
  const expenseCategories = Array.from(new Set([...(items ?? []).map((i) => i.name), ETC_CATEGORY]));
  const catMap = new Map((categories ?? []).map((c) => [c.id, c]));
  const typeCategories = (categories ?? []).filter((c) => c.type === pType);

  // 지출 항목 기본 선택값 보정 — 항목(items)이 로드된 뒤에만 기본값을 정한다.
  // (로드 전에 정하면 임시 목록의 '기타'가 기본값으로 박혀버리는 문제 방지)
  useEffect(() => {
    if (mode === "expense" && items && !category && expenseCategories.length > 0) {
      setCategory(expenseCategories[0]);
    }
  }, [mode, category, items, expenseCategories.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 개인 가계부 구분 변경 시 카테고리 초기화
  useEffect(() => {
    setCategoryId("");
  }, [pType]);

  async function submitExpense() {
    if (submittingRef.current) return;
    const cat = category || expenseCategories[0] || "";
    if (!cat) {
      toast({ variant: "destructive", title: "항목을 선택해 주세요." });
      return;
    }
    const amt = Number(amount);
    if (!(amt >= 0) || amount === "") {
      toast({ variant: "destructive", title: "지출액을 입력해 주세요." });
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    try {
      await apiRequest("POST", "/api/admin/expenses", {
        expenseDate: date,
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
      submittingRef.current = false;
    }
  }

  async function submitPersonal() {
    if (submittingRef.current) return;
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
    submittingRef.current = true;
    setBusy(true);
    try {
      await apiRequest("POST", "/api/personal-ledger", {
        date,
        type: pType,
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
      submittingRef.current = false;
    }
  }

  async function removeExpense(x: Expense) {
    if (!confirm(`${x.expenseDate} ${x.category} 지출을 삭제할까요?`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/expenses/${x.id}`);
      toast({ title: "지출이 삭제되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
    } catch (e) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(e) });
    }
  }

  async function removePersonal(x: PersonalLedgerEntry) {
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

  const onSave = mode === "expense" ? submitExpense : submitPersonal;

  // 경영·재무 전체 소유자(Owner) 전용
  if (!isOwner) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">사장님(Owner) 전용 메뉴입니다.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Money</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">지출 · 가계부</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          사업 지출과 개인 가계부를 한 곳에서 입력합니다. 탭 → 탭 → 금액 → 저장.
        </p>

        {/* 사업 지출 / 개인 가계부 토글 (개인 가계부는 사장님 전용) */}
        {isOwner && (
          <div className="mb-5 inline-flex rounded-lg border bg-muted/40 p-1" data-testid="toggle-money-mode">
            <button
              type="button"
              onClick={() => setMode("expense")}
              data-testid="toggle-expense"
              className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition ${
                mode === "expense" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              <Receipt className="h-4 w-4" />
              사업 지출
            </button>
            <button
              type="button"
              onClick={() => setMode("personal")}
              data-testid="toggle-personal"
              className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition ${
                mode === "personal" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              <BookUser className="h-4 w-4" />
              개인 가계부
            </button>
          </div>
        )}

        {/* 입력 카드 */}
        <Card className="mb-6 p-5">
          {mode === "expense" ? (
            <>
              <div className="mb-4">
                <Label className="mb-2 block text-xs text-muted-foreground">부문</Label>
                <div className="flex flex-wrap gap-2">
                  {SECTORS.map((s) => (
                    <Chip
                      key={s}
                      active={sector === s}
                      onClick={() => setSector(s)}
                      testid={`chip-sector-${s}`}
                    >
                      {SECTOR_LABEL[s]}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <Label className="mb-2 block text-xs text-muted-foreground">항목</Label>
                <div className="flex flex-wrap gap-2">
                  {expenseCategories.map((c) => (
                    <Chip
                      key={c}
                      active={(category || expenseCategories[0]) === c}
                      onClick={() => setCategory(c)}
                      testid={`chip-category-${c}`}
                    >
                      {c}
                    </Chip>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="mb-4">
                <Label className="mb-2 block text-xs text-muted-foreground">구분</Label>
                <div className="flex flex-wrap gap-2">
                  <Chip active={pType === "expense"} onClick={() => setPType("expense")} testid="chip-ptype-expense">
                    지출
                  </Chip>
                  <Chip active={pType === "income"} onClick={() => setPType("income")} testid="chip-ptype-income">
                    수입
                  </Chip>
                </div>
              </div>
              <div className="mb-4">
                <Label className="mb-2 block text-xs text-muted-foreground">카테고리</Label>
                {typeCategories.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    카테고리가 없습니다. 아래 카테고리 관리에서 추가해 주세요.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {typeCategories.map((c) => (
                      <Chip
                        key={c.id}
                        active={(categoryId === "" ? typeCategories[0]?.id : categoryId) === c.id}
                        onClick={() => setCategoryId(c.id)}
                        testid={`chip-pcategory-${c.id}`}
                      >
                        {c.name}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* 금액 · 날짜 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">금액 *</Label>
              <Input
                type="number"
                step="1"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) onSave();
                }}
                placeholder="0"
                className="h-11 text-lg font-semibold tabular"
                data-testid="input-money-amount"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">날짜 *</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11"
                data-testid="input-money-date"
              />
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <Label className="text-xs">메모 (선택)</Label>
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) onSave();
              }}
              placeholder="비고"
              data-testid="input-money-memo"
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={onSave} disabled={busy} data-testid="button-save-money">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              저장
            </Button>
          </div>
        </Card>

        {/* 개인 가계부: 기간 요약 */}
        {mode === "personal" && (
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
        )}

        {/* 목록 */}
        <Card className="mb-6 overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {mode === "expense" ? "지출 목록" : "가계부 내역"}
            </h2>
          </div>
          {mode === "expense" ? (
            expLoading ? (
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
                          <Button variant="ghost" size="icon" onClick={() => removeExpense(x)} aria-label="삭제" data-testid={`button-delete-expense-${x.id}`}>
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : pLoading ? (
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
                        <Button variant="ghost" size="icon" onClick={() => removePersonal(x)} aria-label="삭제" data-testid={`button-delete-ledger-${x.id}`}>
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

        {/* 개인 가계부: 카테고리 관리 */}
        {mode === "personal" && (
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">카테고리 관리</h2>
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">구분</Label>
                <div className="flex gap-2">
                  <Chip active={newCatType === "expense"} onClick={() => setNewCatType("expense")} testid="chip-newcat-expense">
                    지출
                  </Chip>
                  <Chip active={newCatType === "income"} onClick={() => setNewCatType("income")} testid="chip-newcat-income">
                    수입
                  </Chip>
                </div>
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
        )}
      </div>
    </AdminLayout>
  );
}
