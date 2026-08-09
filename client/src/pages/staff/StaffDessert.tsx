import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout, useStaff } from "@/components/StaffLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import type { DessertLog } from "@shared/schema";
import { Loader2, Plus, Trash2 } from "lucide-react";

type Draft = {
  itemName: string;
  qty: string;
  unit: string;
  discardQty: string;
  expiryDate: string;
  memo: string;
};

const EMPTY: Draft = { itemName: "", qty: "", unit: "개", discardQty: "", expiryDate: "", memo: "" };

export default function StaffDessert() {
  const { toast } = useToast();
  const { data: me } = useStaff();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  const { data: logs, isLoading } = useQuery<DessertLog[]>({ queryKey: ["/api/staff/dessert-logs"] });
  const { data: items } = useQuery<string[]>({ queryKey: ["/api/staff/dessert-logs/items"] });

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  async function save() {
    if (!d.itemName.trim()) {
      toast({ variant: "destructive", title: "품목을 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/staff/dessert-logs", {
        itemName: d.itemName.trim(),
        qty: Number(d.qty) || 0,
        unit: d.unit.trim() || "개",
        discardQty: Number(d.discardQty) || 0,
        expiryDate: d.expiryDate,
        memo: d.memo.trim(),
      });
      toast({ title: "기록되었습니다." });
      setD(EMPTY);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/staff/dessert-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/dessert-logs/items"] });
    } catch (err) {
      toast({ variant: "destructive", title: "저장 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    try {
      await apiRequest("DELETE", `/api/staff/dessert-logs/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/staff/dessert-logs"] });
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  return (
    <StaffLayout title="디저트 생산일지" subtitle="이번 달 기록입니다">
      {!open && (
        <Button className="w-full" onClick={() => setOpen(true)} data-testid="button-open-dessert-form">
          <Plus className="h-4 w-4" />
          오늘 생산 기록하기
        </Button>
      )}

      {open && (
        <Card className="p-5">
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">품목</Label>
              <Input
                value={d.itemName}
                onChange={(e) => set({ itemName: e.target.value })}
                placeholder="예: 바스크 치즈케이크"
                data-testid="input-dessert-item"
              />
              {(items?.length ?? 0) > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {items!.slice(0, 10).map((it) => (
                    <button
                      key={it}
                      onClick={() => set({ itemName: it })}
                      className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover-elevate"
                    >
                      {it}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">생산 수량</Label>
                <Input value={d.qty} onChange={(e) => set({ qty: e.target.value })} inputMode="numeric" placeholder="12" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">단위</Label>
                <Input value={d.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="개" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">폐기</Label>
                <Input
                  value={d.discardQty}
                  onChange={(e) => set({ discardQty: e.target.value })}
                  inputMode="numeric"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">소비기한</Label>
              <Input type="date" value={d.expiryDate} onChange={(e) => set({ expiryDate: e.target.value })} />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">메모</Label>
              <Textarea value={d.memo} onChange={(e) => set({ memo: e.target.value })} rows={2} placeholder="특이사항" />
            </div>

            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={save} disabled={busy} data-testid="button-save-dessert">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
              </Button>
              <Button variant="outline" onClick={() => { setOpen(false); setD(EMPTY); }}>
                취소
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="mt-5 space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
        ) : (logs?.length ?? 0) === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">아직 기록이 없습니다.</p>
        ) : (
          logs!.map((l) => (
            <Card key={l.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{l.itemName}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {l.prodDate} · {l.staffName}
                  {l.expiryDate ? ` · 소비기한 ${l.expiryDate}` : ""}
                </div>
                {l.memo && <p className="mt-1.5 text-xs text-muted-foreground">{l.memo}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="text-right">
                  <div className="font-display tabular text-base font-semibold text-foreground">
                    {l.qty}
                    <span className="ml-0.5 text-xs font-normal text-muted-foreground">{l.unit}</span>
                  </div>
                  {l.discardQty > 0 && <div className="text-[11px] text-destructive">폐기 {l.discardQty}</div>}
                </div>
                {me?.id === l.staffId && (
                  <button onClick={() => remove(l.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </StaffLayout>
  );
}
