import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { EspressoLog, DessertLog, PublicStaff, DessertItem } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { Coffee, CakeSlice, Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from "lucide-react";

function monthStart(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
function today(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

type Tab = "espresso" | "dessert";

export default function AdminStaffLogs() {
  const [tab, setTab] = useState<Tab>("espresso");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [staffId, setStaffId] = useState("");

  const qs = `from=${from}&to=${to}${staffId ? `&staffId=${staffId}` : ""}`;
  const { data: staffList } = useQuery<PublicStaff[]>({ queryKey: ["/api/admin/staff"] });
  const { data: espresso, isLoading: l1 } = useQuery<EspressoLog[]>({
    queryKey: [`/api/admin/staff/espresso-logs?${qs}`],
    enabled: tab === "espresso",
  });
  const { data: dessert, isLoading: l2 } = useQuery<DessertLog[]>({
    queryKey: [`/api/admin/staff/dessert-logs?${qs}`],
    enabled: tab === "dessert",
  });

  const loading = tab === "espresso" ? l1 : l2;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Staff Records</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">직원 기록 조회</h1>
        <p className="mb-6 text-sm text-muted-foreground">직원들이 남긴 추출 기록과 생산일지를 기간별로 확인합니다.</p>

        <div className="mb-4 flex gap-2">
          <TabButton active={tab === "espresso"} onClick={() => setTab("espresso")} icon={Coffee} label="에스프레소 추출" />
          <TabButton active={tab === "dessert"} onClick={() => setTab("dessert")} icon={CakeSlice} label="디저트 생산" />
        </div>

        {tab === "dessert" && <DessertItemManager />}

        <Card className="mb-5 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">시작일</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">종료일</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">직원</Label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="h-9 w-36 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">전체</option>
                {(staffList ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="space-y-2 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : tab === "espresso" ? (
            (espresso?.length ?? 0) === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">기록이 없습니다.</p>
            ) : (
              <div className="divide-y">
                {espresso!.map((l) => {
                  const tags: string[] = (() => { try { return JSON.parse(l.flavorTags); } catch { return []; } })();
                  return (
                    <div key={l.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">{l.beanName}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {l.logDate} · {l.staffName}{l.machine ? ` · ${l.machine}` : ""}
                          </div>
                        </div>
                        {l.rating > 0 && <span className="shrink-0 text-xs text-foreground">{"★".repeat(l.rating)}</span>}
                      </div>
                      <div className="font-display tabular mt-1.5 text-xs text-muted-foreground">
                        {l.doseG || 0}g → {l.yieldG || 0}g · {l.timeSec || 0}초 · {l.waterTemp || 0}℃
                        {l.grindSetting ? ` · 분쇄 ${l.grindSetting}` : ""}{l.tds ? ` · TDS ${l.tds}` : ""}
                      </div>
                      {tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {tags.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                        </div>
                      )}
                      {l.memo && <p className="mt-1.5 text-xs text-muted-foreground">{l.memo}</p>}
                    </div>
                  );
                })}
              </div>
            )
          ) : (dessert?.length ?? 0) === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">기록이 없습니다.</p>
          ) : (
            <div className="divide-y">
              {dessert!.map((l) => (
                <div key={l.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">{l.itemName}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {l.prodDate}
                      {l.producedByName ? ` · 생산 ${l.producedByName}` : ""}
                      {l.discardedByName ? ` · 폐기 ${l.discardedByName}` : ""}
                    </div>
                    {l.memo && <p className="mt-1.5 text-xs text-muted-foreground">{l.memo}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-display tabular text-base font-semibold text-foreground">
                      {l.qty}<span className="ml-0.5 text-xs font-normal text-muted-foreground">{l.unit}</span>
                    </div>
                    {l.discardQty > 0 && <div className="text-[11px] text-destructive">폐기 {l.discardQty}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}

/** 디저트 품목 관리 — 직원 앱의 생산일지에 뜨는 목록 */
function DessertItemManager() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isOwner = (user as any)?.adminRole === "owner";
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("개");
  const [busy, setBusy] = useState(false);

  const { data: items, isLoading } = useQuery<DessertItem[]>({ queryKey: ["/api/admin/staff/dessert-items"] });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/staff/dessert-items"] });
  const active = (items ?? []).filter((i) => i.active === 1);

  async function add() {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "품목명을 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/admin/staff/dessert-items", { name: name.trim(), unit: unit.trim() || "개" });
      setName("");
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "추가 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number, itemName: string) {
    if (!confirm(`'${itemName}'을(를) 목록에서 뺄까요? 지난 생산 기록은 그대로 남습니다.`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/staff/dessert-items/${id}`);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  async function move(idx: number, delta: number) {
    const next = active.slice();
    const to = idx + delta;
    if (to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    try {
      await apiRequest("POST", "/api/admin/staff/dessert-items/reorder", { ids: next.map((i) => i.id) });
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "순서 변경 실패", description: errMsg(err) });
    }
  }

  return (
    <Card className="mb-5 overflow-hidden">
      <div className="border-b p-5">
        <h2 className="text-sm font-semibold text-foreground">디저트 품목</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          여기 등록한 품목이 직원 앱의 생산일지에 그대로 나옵니다. 직원은 수량만 입력합니다.
        </p>
      </div>

      {isOwner && (
        <div className="flex flex-wrap items-end gap-2 border-b p-4">
          <div>
            <Label className="text-xs text-muted-foreground">품목명</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 바스크 치즈케이크"
              className="w-56"
              data-testid="input-dessert-item-name"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">단위</Label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="개" className="w-20" />
          </div>
          <Button onClick={add} disabled={busy} data-testid="button-add-dessert-item">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            추가
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : active.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">등록된 품목이 없습니다.</p>
      ) : (
        <div className="divide-y">
          {active.map((it, idx) => (
            <div key={it.id} className="flex items-center gap-2 px-4 py-2.5" data-testid={`row-dessert-item-${it.id}`}>
              <span className="flex-1 text-sm text-foreground">{it.name}</span>
              <span className="text-xs text-muted-foreground">{it.unit}</span>
              {isOwner && (
                <>
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 text-muted-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === active.length - 1}
                    className="p-1 text-muted-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button onClick={() => remove(it.id, it.name)} className="p-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover-elevate ${
        active ? "border-foreground text-foreground" : "text-muted-foreground"
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={1.5} />
      {label}
    </button>
  );
}
