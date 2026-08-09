import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout } from "@/components/StaffLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import { Loader2, Save, CakeSlice } from "lucide-react";

type Row = {
  itemId: number;
  name: string;
  unit: string;
  qty: number;
  discardQty: number;
  memo: string;
  staffName: string;
};
type DayRes = { date: string; rows: Row[] };

function today(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export default function StaffDessert() {
  const { toast } = useToast();
  const [date, setDate] = useState(today());
  const [draft, setDraft] = useState<Record<number, { qty: string; discardQty: string }>>({});
  const [busy, setBusy] = useState(false);

  const key = `/api/staff/dessert-logs/day?date=${date}`;
  const { data, isLoading } = useQuery<DayRes>({ queryKey: [key] });

  // 날짜가 바뀌면 서버 값으로 입력칸을 다시 채운다
  useEffect(() => {
    if (!data) return;
    const next: Record<number, { qty: string; discardQty: string }> = {};
    for (const r of data.rows) {
      next[r.itemId] = {
        qty: r.qty ? String(r.qty) : "",
        discardQty: r.discardQty ? String(r.discardQty) : "",
      };
    }
    setDraft(next);
  }, [data]);

  function set(itemId: number, patch: Partial<{ qty: string; discardQty: string }>) {
    setDraft((prev) => {
      const cur = prev[itemId] ?? { qty: "", discardQty: "" };
      return { ...prev, [itemId]: { ...cur, ...patch } };
    });
  }

  async function save() {
    if (!data) return;
    setBusy(true);
    try {
      await apiRequest("POST", "/api/staff/dessert-logs/save", {
        prodDate: date,
        rows: data.rows.map((r) => ({
          itemId: r.itemId,
          qty: Number(draft[r.itemId]?.qty) || 0,
          discardQty: Number(draft[r.itemId]?.discardQty) || 0,
        })),
      });
      toast({ title: "저장되었습니다." });
      queryClient.invalidateQueries({ queryKey: [key] });
    } catch (err) {
      toast({ variant: "destructive", title: "저장 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  const rows = data?.rows ?? [];
  const totalMade = rows.reduce((s, r) => s + (Number(draft[r.itemId]?.qty) || 0), 0);
  const totalDiscard = rows.reduce((s, r) => s + (Number(draft[r.itemId]?.discardQty) || 0), 0);

  return (
    <StaffLayout title="디저트 생산일지" subtitle="품목별 생산량과 폐기량을 적어주세요">
      <Card className="mb-4 p-4">
        <Label className="text-xs text-muted-foreground">날짜</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-dessert-date" />
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <CakeSlice className="h-10 w-10 text-muted-foreground/50" />
          <p className="px-6 text-sm text-muted-foreground">
            등록된 디저트 품목이 없습니다.
            <br />
            대표님께 품목 등록을 요청해 주세요.
          </p>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="flex border-b bg-muted/40 px-4 py-2 font-ui text-[11px] font-medium text-muted-foreground">
              <span className="flex-1">품목</span>
              <span className="w-20 text-center">생산</span>
              <span className="w-20 text-center">폐기</span>
            </div>
            <div className="divide-y">
              {rows.map((r) => (
                <div key={r.itemId} className="flex items-center px-4 py-2.5" data-testid={`row-dessert-${r.itemId}`}>
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="truncate text-sm text-foreground">{r.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {r.unit}
                      {r.staffName ? ` · ${r.staffName}` : ""}
                    </div>
                  </div>
                  <Input
                    value={draft[r.itemId]?.qty ?? ""}
                    onChange={(e) => set(r.itemId, { qty: e.target.value.replace(/[^0-9]/g, "") })}
                    inputMode="numeric"
                    placeholder="0"
                    className="w-20 text-center"
                    data-testid={`input-qty-${r.itemId}`}
                  />
                  <Input
                    value={draft[r.itemId]?.discardQty ?? ""}
                    onChange={(e) => set(r.itemId, { discardQty: e.target.value.replace(/[^0-9]/g, "") })}
                    inputMode="numeric"
                    placeholder="0"
                    className="ml-2 w-20 text-center"
                    data-testid={`input-discard-${r.itemId}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-2.5 text-xs">
              <span className="text-muted-foreground">합계</span>
              <span className="font-display tabular font-semibold text-foreground">
                생산 {totalMade}
                <span className="ml-3 text-destructive">폐기 {totalDiscard}</span>
              </span>
            </div>
          </Card>

          <Button className="mt-4 w-full" onClick={save} disabled={busy} data-testid="button-save-dessert">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            저장
          </Button>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            같은 날 다시 저장하면 기존 숫자를 덮어씁니다.
          </p>
        </>
      )}
    </StaffLayout>
  );
}
