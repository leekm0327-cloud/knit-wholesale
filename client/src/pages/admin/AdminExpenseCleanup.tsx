import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { won } from "@/lib/format";
import { SECTORS, SECTOR_LABEL, COST_TYPES, COST_TYPE_LABEL, type Sector, type Expense, type FixedCostItem } from "@shared/schema";
import { Loader2, Wand2, CheckCircle2 } from "lucide-react";

const ETC = "기타";

// 메모를 묶음 키로 정규화 (숫자·괄호 등 변주를 흡수해 같은 거래처끼리 묶는다)
function normMemo(s: string): string {
  return (s || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export default function AdminExpenseCleanup() {
  const { user } = useAuth();
  const isOwner = (user as any)?.adminRole === "owner";
  const { toast } = useToast();

  const [from, setFrom] = useState("2000-01-01");
  const [to, setTo] = useState("2099-12-31");
  const [onlyEtc, setOnlyEtc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // 그룹 키
  const [newCategory, setNewCategory] = useState("");
  const [newSector, setNewSector] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const { data: items } = useQuery<FixedCostItem[]>({ queryKey: ["/api/admin/fixed-cost-items"], enabled: isOwner });
  const { data: expenses, isLoading } = useQuery<Expense[]>({
    queryKey: ["/api/admin/expenses", { from, to }],
    queryFn: async () => (await apiRequest("GET", `/api/admin/expenses?from=${from}&to=${to}`)).json(),
    enabled: isOwner,
  });

  // 메모 기준으로 묶기
  const groups = useMemo(() => {
    const src = (expenses ?? []).filter((e) => (onlyEtc ? e.category === ETC : true));
    const m = new Map<string, { key: string; memo: string; category: string; sector: string; n: number; amount: number; ids: number[] }>();
    for (const e of src) {
      const key = `${e.category}||${normMemo(e.memo) || "(메모없음)"}`;
      const cur = m.get(key) || {
        key,
        memo: (e.memo || "").trim() || "(메모 없음)",
        category: e.category,
        sector: (e as any).sector ?? "common",
        n: 0, amount: 0, ids: [] as number[],
      };
      cur.n += 1; cur.amount += e.amount; cur.ids.push(e.id);
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  }, [expenses, onlyEtc]);

  const selectedGroups = groups.filter((g) => selected.has(g.key));
  const selectedIds = selectedGroups.flatMap((g) => g.ids);
  const selectedAmount = selectedGroups.reduce((s, g) => s + g.amount, 0);

  const categories = [...(items ?? []).map((i) => i.name), ETC];

  function toggle(key: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === groups.length ? new Set() : new Set(groups.map((g) => g.key))));
  }

  async function apply() {
    if (selectedIds.length === 0) { toast({ variant: "destructive", title: "변경할 항목을 선택해 주세요." }); return; }
    if (!newCategory && !newSector) { toast({ variant: "destructive", title: "새 항목 또는 새 부문을 선택해 주세요." }); return; }
    if (!confirm(`${selectedIds.length}건을 변경할까요?\n${newCategory ? `항목 → ${newCategory}\n` : ""}${newSector ? `부문 → ${SECTOR_LABEL[newSector as Sector]}` : ""}`)) return;
    setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/admin/expenses/bulk-recategorize", {
        ids: selectedIds,
        category: newCategory || undefined,
        sector: newSector || undefined,
      });
      const j = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/financial-statement"] });
      setSelected(new Set());
      toast({ title: `${j.updated}건을 변경했습니다.` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "변경 실패", description: e?.message ?? "" });
    } finally { setBusy(false); }
  }

  if (!isOwner) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">사장님(Owner) 전용 메뉴입니다.</p>
        </div>
      </AdminLayout>
    );
  }

  const totalEtc = groups.reduce((s, g) => s + g.amount, 0);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Expense cleanup</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">지출 재분류</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          같은 내용(메모)끼리 묶어 보여줍니다. 여러 묶음을 한 번에 골라 항목·부문을 바꿀 수 있어, ‘기타’로 쌓인 지출을 빠르게 정리할 수 있습니다.
        </p>

        {/* 필터 */}
        <Card className="mb-6 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">시작일</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">종료일</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" checked={onlyEtc} onChange={(e) => { setOnlyEtc(e.target.checked); setSelected(new Set()); }} />
              ‘기타’만 보기
            </label>
          </div>
        </Card>

        {/* 일괄 변경 바 */}
        <Card className="mb-6 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">새 항목</Label>
              <select
                className="flex h-9 w-48 rounded-md border border-input bg-transparent px-3 text-sm"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                data-testid="select-new-category"
              >
                <option value="">(변경 안 함)</option>
                {COST_TYPES.map((ct) => {
                  const names = (items ?? []).filter((i) => ((i as any).costType ?? "sga") === ct).map((i) => i.name);
                  return names.length ? (
                    <optgroup key={ct} label={COST_TYPE_LABEL[ct]}>
                      {names.map((c) => <option key={c} value={c}>{c}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">새 부문</Label>
              <select
                className="flex h-9 w-40 rounded-md border border-input bg-transparent px-3 text-sm"
                value={newSector}
                onChange={(e) => setNewSector(e.target.value)}
                data-testid="select-new-sector"
              >
                <option value="">(변경 안 함)</option>
                {SECTORS.map((s) => <option key={s} value={s}>{SECTOR_LABEL[s]}</option>)}
              </select>
            </div>
            <Button onClick={apply} disabled={busy || selectedIds.length === 0} data-testid="button-apply-recategorize">
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
              선택 {selectedIds.length}건 변경
            </Button>
            {selectedIds.length > 0 && (
              <span className="pb-2 text-xs text-muted-foreground">선택 금액 {won(selectedAmount)}</span>
            )}
          </div>
        </Card>

        {/* 그룹 목록 */}
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {onlyEtc ? "‘기타’로 분류된 지출" : "전체 지출"} · {groups.length}묶음
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">합계 {won(totalEtc)}</p>
            </div>
            <Button variant="outline" size="sm" onClick={toggleAll} data-testid="button-toggle-all">
              {selected.size === groups.length && groups.length > 0 ? "전체 해제" : "전체 선택"}
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500/60" />
              <p className="text-sm text-muted-foreground">정리할 지출이 없습니다.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2"></th>
                    <th className="px-3 py-2 text-left font-medium">내용(메모)</th>
                    <th className="px-3 py-2 text-left font-medium">현재 항목</th>
                    <th className="px-3 py-2 text-left font-medium">현재 부문</th>
                    <th className="px-3 py-2 text-right font-medium">건수</th>
                    <th className="px-3 py-2 text-right font-medium">금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {groups.map((g) => (
                    <tr
                      key={g.key}
                      className={`cursor-pointer ${selected.has(g.key) ? "bg-muted/40" : ""}`}
                      onClick={() => toggle(g.key)}
                      data-testid={`group-${g.key}`}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <input type="checkbox" checked={selected.has(g.key)} onChange={() => toggle(g.key)} onClick={(e) => e.stopPropagation()} />
                      </td>
                      <td className="max-w-[280px] truncate px-3 py-2.5 font-medium text-foreground">{g.memo}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{g.category}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{SECTOR_LABEL[g.sector as Sector] ?? g.sector}</td>
                      <td className="px-3 py-2.5 text-right tabular text-muted-foreground">{g.n}</td>
                      <td className="px-3 py-2.5 text-right tabular text-foreground">{won(g.amount)}</td>
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
