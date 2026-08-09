import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { EspressoLog, DessertLog, PublicStaff } from "@shared/schema";
import { Coffee, CakeSlice } from "lucide-react";

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
                      {l.prodDate} · {l.staffName}{l.expiryDate ? ` · 소비기한 ${l.expiryDate}` : ""}
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
