import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { errMsg } from "@/lib/format";
import type { FixedCostItem, Sector } from "@shared/schema";
import { SECTORS, SECTOR_LABEL, COST_TYPES, COST_TYPE_LABEL, type CostType } from "@shared/schema";
import { ListChecks, Trash2, Plus, Loader2 } from "lucide-react";

export default function AdminFixedCostItems() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: items, isLoading } = useQuery<FixedCostItem[]>({
    queryKey: ["/api/admin/fixed-cost-items", { all: 1 }],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/fixed-cost-items?includeInactive=true");
      return res.json();
    },
  });

  const [name, setName] = useState("");
  const [sector, setSector] = useState<Sector>("common");
  const [costType, setCostType] = useState<CostType>("sga");
  const [seeding, setSeeding] = useState(false);
  const [busy, setBusy] = useState(false);

  const isOwner = (user as any)?.adminRole === "owner";

  if (!isOwner) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">사장님(Owner) 전용 메뉴입니다.</p>
        </div>
      </AdminLayout>
    );
  }

  async function add() {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "항목명을 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/admin/fixed-cost-items", { name: name.trim(), sector, costType });
      toast({ title: "항목이 추가되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fixed-cost-items"] });
      setName("");
    } catch (e) {
      toast({ variant: "destructive", title: "추가 실패", description: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(item: FixedCostItem) {
    try {
      await apiRequest("PATCH", `/api/admin/fixed-cost-items/${item.id}`, {
        active: item.active ? 0 : 1,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fixed-cost-items"] });
    } catch (e) {
      toast({ variant: "destructive", title: "변경 실패", description: errMsg(e) });
    }
  }

  async function remove(item: FixedCostItem) {
    if (!confirm(`'${item.name}' 항목을 삭제할까요?`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/fixed-cost-items/${item.id}`);
      toast({ title: "항목이 삭제되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fixed-cost-items"] });
    } catch (e) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(e) });
    }
  }

  async function patchItem(item: any, patch: { sector?: string; costType?: string }) {
    try {
      await apiRequest("PATCH", `/api/admin/fixed-cost-items/${item.id}`, patch);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fixed-cost-items"] });
    } catch (e: any) {
      toast({ variant: "destructive", title: "변경 실패", description: e?.message ?? "" });
    }
  }

  async function seedRecommended() {
    if (!confirm("권장 지출 항목 세트를 추가할까요?\n기존 항목은 그대로 두고, 없는 항목만 추가됩니다.")) return;
    setSeeding(true);
    try {
      const res = await apiRequest("POST", "/api/admin/fixed-cost-items/seed-recommended");
      const j = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fixed-cost-items"] });
      toast({ title: j.added?.length ? `${j.added.length}개 항목을 추가했습니다.` : "추가할 항목이 없습니다. (이미 모두 등록됨)" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "추가 실패", description: e?.message ?? "" });
    } finally { setSeeding(false); }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Fixed cost items</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">고정비 항목 관리</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          지출 입력 시 선택할 항목을 관리합니다. <strong className="text-foreground">비용 구분</strong>은 손익계산서에서 어디로 집계할지 정합니다 —
          매출원가·판매관리비는 영업이익에 반영되고, 영업외비용(이자 등)은 영업이익 아래에서 차감되며, ‘비용 아님’(부가세 납부·자산 취득 등)은 손익에서 제외됩니다.
        </p>

        {/* 추가 폼 */}
        <Card className="mb-6 p-5">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">새 항목명</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) add(); }}
                placeholder="예: 임대료"
                data-testid="input-item-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">부문</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={sector}
                onChange={(e) => setSector(e.target.value as Sector)}
                data-testid="select-item-sector"
              >
                {SECTORS.map((s) => (
                  <option key={s} value={s}>{SECTOR_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">비용 구분</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={costType}
                onChange={(e) => setCostType(e.target.value as CostType)}
                data-testid="select-item-costtype"
              >
                {COST_TYPES.map((c) => (
                  <option key={c} value={c}>{COST_TYPE_LABEL[c]}</option>
                ))}
              </select>
            </div>
            <Button onClick={add} disabled={busy} data-testid="button-add-item">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              추가
            </Button>
          </div>
        </Card>

        {/* 목록 */}
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">항목 목록</h2>
            <Button variant="outline" size="sm" onClick={seedRecommended} disabled={seeding} data-testid="button-seed-recommended">
              {seeding ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
              권장 항목 세트 추가
            </Button>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !items || items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <ListChecks className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">등록된 항목이 없습니다.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" data-testid={`row-item-${item.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{item.name}</span>
                    {!item.active && (
                      <Badge variant="secondary" className="text-[10px]">비활성</Badge>
                    )}
                    <select
                      className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
                      value={(item as any).sector ?? "common"}
                      onChange={(e) => patchItem(item, { sector: e.target.value })}
                      data-testid={`select-sector-${item.id}`}
                      title="기본 부문"
                    >
                      {SECTORS.map((s) => <option key={s} value={s}>{SECTOR_LABEL[s]}</option>)}
                    </select>
                    <select
                      className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
                      value={(item as any).costType ?? "sga"}
                      onChange={(e) => patchItem(item, { costType: e.target.value })}
                      data-testid={`select-costtype-${item.id}`}
                      title="비용 구분"
                    >
                      {COST_TYPES.map((c) => <option key={c} value={c}>{COST_TYPE_LABEL[c]}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => toggleActive(item)} data-testid={`button-toggle-item-${item.id}`}>
                      {item.active ? "비활성화" : "활성화"}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(item)} aria-label="삭제" data-testid={`button-delete-item-${item.id}`}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
