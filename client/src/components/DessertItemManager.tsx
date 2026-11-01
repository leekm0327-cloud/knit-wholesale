import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import type { DessertItem } from "@shared/schema";
import { ArrowUp, ArrowDown, Loader2, Plus } from "lucide-react";

const path = "/api/admin/staff/dessert-items";
export function DessertItemManager() {
  const { user } = useAuth();
  const owner = user?.adminRole === "owner";
  const { toast } = useToast();
  const query = useQuery<DessertItem[]>({ queryKey: [path], enabled: user?.role === "admin", staleTime: 0 });
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("개");
  const [filter, setFilter] = useState<0 | 1>(1);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Pick<DessertItem, "id" | "name" | "unit"> | null>(null);
  const [busy, setBusy] = useState(false);
  const active = (query.data ?? []).filter(item => item.active === 1);
  const inactive = (query.data ?? []).filter(item => item.active === 0);
  const visible = (filter ? active : inactive).filter(item => item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const invalidate = () => queryClient.invalidateQueries({ predicate: query => {
    const key = String(query.queryKey[0]);
    return key === path || key.startsWith("/api/staff/dessert-");
  } });

  async function mutate(method: "POST" | "PATCH", url: string, body: unknown, title: string, done?: () => void) {
    if (!owner || busy) return;
    setBusy(true);
    try {
      await apiRequest(method, url, body);
      done?.();
      await invalidate();
      toast({ title });
    } catch (error) {
      toast({ variant: "destructive", title: "저장하지 못했습니다", description: errMsg(error) });
    } finally { setBusy(false); }
  }
  function add() {
    if (!name.trim()) return;
    return mutate("POST", path, { name, unit }, "디저트를 추가했습니다", () => {
      setName(""); setUnit("개"); setFilter(1); setSearch("");
    });
  }
  function move(item: DessertItem, direction: number) {
    const index = active.findIndex(row => row.id === item.id), target = index + direction;
    if (target < 0 || target >= active.length) return;
    const ids = active.map(row => row.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    return mutate("POST", path + "/reorder", { ids }, "표시 순서를 바꿨습니다");
  }

  return <div className="space-y-5">
    {owner ? <Card className="p-4 sm:p-5">
      <h2 className="mb-4 text-sm font-semibold">새 디저트 추가</h2>
      <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void add(); }}>
        <div className="min-w-0 flex-1 basis-48 space-y-1.5">
          <Label htmlFor="dessert-name">품목명</Label>
          <Input id="dessert-name" value={name} onChange={event => setName(event.target.value)} maxLength={40} required disabled={busy} placeholder="예: 바스크 치즈케이크" data-testid="input-dessert-item-name" />
        </div>
        <div className="w-20 space-y-1.5">
          <Label htmlFor="dessert-unit">단위</Label>
          <Input id="dessert-unit" value={unit} onChange={event => setUnit(event.target.value)} maxLength={10} disabled={busy} placeholder="개" data-testid="input-dessert-item-unit" />
        </div>
        <Button type="submit" disabled={busy || !name.trim() || query.isError || query.isLoading} data-testid="button-add-dessert-item">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}추가
        </Button>
      </form>
    </Card> : <p className="border p-4 text-sm text-muted-foreground">관리자는 목록을 확인할 수 있습니다. 추가·수정·사용 여부 변경은 대표 계정에서 가능합니다.</p>}

    <Card className="overflow-hidden">
      <div className="space-y-4 border-b p-4 sm:p-5">
        <div className="flex flex-wrap gap-2" aria-label="디저트 사용 상태">
          <Button variant={filter === 1 ? "default" : "outline"} aria-pressed={filter === 1} onClick={() => { setFilter(1); setEditing(null); }} disabled={busy} data-testid="dessert-filter-active">사용 중 {active.length}</Button>
          <Button variant={filter === 0 ? "default" : "outline"} aria-pressed={filter === 0} onClick={() => { setFilter(0); setEditing(null); }} disabled={busy} data-testid="dessert-filter-inactive">사용 중지 {inactive.length}</Button>
        </div>
        <Input aria-label="디저트 검색" placeholder="품목명으로 검색" value={search} onChange={event => setSearch(event.target.value)} disabled={busy || !!editing} />
        <p className="text-xs leading-relaxed text-muted-foreground">사용 중인 품목이 직원의 생산·폐기 입력 화면에 표시됩니다. 사용 중지하거나 이름을 바꿔도 지난 기록은 그대로 남습니다.</p>
      </div>
      {query.isError ? <div role="alert" className="space-y-3 p-5"><p>디저트 목록을 불러오지 못했습니다.</p><Button variant="outline" onClick={() => query.refetch()}>다시 불러오기</Button></div>
        : query.isLoading ? <p className="p-5 text-sm" role="status">목록을 불러오는 중…</p>
        : !visible.length ? <p className="p-8 text-center text-sm text-muted-foreground">{search ? "검색 결과가 없습니다." : filter ? "사용 중인 디저트가 없습니다." : "사용 중지한 디저트가 없습니다."}</p>
        : <div className="divide-y">{visible.map(item => <div key={item.id} className="p-4 sm:p-5" data-testid={`row-dessert-item-${item.id}`}>
          {editing?.id === item.id ? <form className="space-y-3" onSubmit={event => {
            event.preventDefault();
            if (editing.name.trim()) void mutate("PATCH", `${path}/${item.id}`, { name: editing.name, unit: editing.unit }, "디저트 정보를 수정했습니다", () => setEditing(null));
          }}>
            <div className="flex gap-3">
              <div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor={`edit-dessert-name-${item.id}`}>품목명</Label><Input id={`edit-dessert-name-${item.id}`} data-testid="edit-dessert-name" value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} maxLength={40} required disabled={busy} autoFocus /></div>
              <div className="w-20 space-y-1.5"><Label htmlFor={`edit-dessert-unit-${item.id}`}>단위</Label><Input id={`edit-dessert-unit-${item.id}`} data-testid="edit-dessert-unit" value={editing.unit} onChange={event => setEditing({ ...editing, unit: event.target.value })} maxLength={10} disabled={busy} /></div>
            </div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={busy}>취소</Button><Button type="submit" disabled={busy || !editing.name.trim()} data-testid="save-dessert-edit">저장</Button></div>
          </form> : <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1 basis-40"><p className="break-words text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">단위: {item.unit}{!item.active && " · 사용 중지"}</p></div>
            {owner && <div className="flex flex-wrap items-center gap-2">
              {!!item.active && <div className="flex gap-1">
                <Button variant="ghost" size="icon" aria-label={`${item.name} 위로`} disabled={busy || !!editing || !!search.trim() || active[0]?.id === item.id} onClick={() => move(item, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" aria-label={`${item.name} 아래로`} disabled={busy || !!editing || !!search.trim() || active.at(-1)?.id === item.id} onClick={() => move(item, 1)}><ArrowDown className="h-4 w-4" /></Button>
              </div>}
              <Button variant="outline" disabled={busy || !!editing} onClick={() => setEditing({ id: item.id, name: item.name, unit: item.unit })} data-testid={`edit-dessert-${item.id}`}>수정</Button>
              <Button variant="outline" disabled={busy || !!editing} onClick={() => mutate("PATCH", `${path}/${item.id}`, { active: item.active ? 0 : 1 }, item.active ? "사용 중지했습니다. 지난 기록은 유지됩니다." : "다시 사용할 수 있습니다.")} data-testid={`toggle-dessert-${item.id}`}>{item.active ? "사용 중지" : "다시 사용"}</Button>
            </div>}
          </div>}
        </div>)}</div>}
    </Card>
  </div>;
}
