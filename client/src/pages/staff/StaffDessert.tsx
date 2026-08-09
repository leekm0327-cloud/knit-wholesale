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
import { Loader2, Save, CakeSlice, ChefHat, Trash2 } from "lucide-react";

type Row = {
  itemId: number;
  name: string;
  unit: string;
  qty: number;
  discardQty: number;
  producedByName: string;
  discardedByName: string;
};
type DayRes = { date: string; rows: Row[] };
type Kind = "produce" | "discard";

function today(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export default function StaffDessert() {
  const { toast } = useToast();
  const [date, setDate] = useState(today());
  const [kind, setKind] = useState<Kind>("produce");
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const key = `/api/staff/dessert-logs/day?date=${date}`;
  const { data, isLoading } = useQuery<DayRes>({ queryKey: [key] });

  // 날짜나 모드가 바뀌면 서버 값으로 입력칸을 다시 채운다
  useEffect(() => {
    if (!data) return;
    const next: Record<number, string> = {};
    for (const r of data.rows) {
      const v = kind === "produce" ? r.qty : r.discardQty;
      next[r.itemId] = v ? String(v) : "";
    }
    setDraft(next);
  }, [data, kind]);

  async function save() {
    if (!data) return;
    setBusy(true);
    try {
      await apiRequest("POST", "/api/staff/dessert-logs/save", {
        prodDate: date,
        kind,
        rows: data.rows.map((r) => ({ itemId: r.itemId, value: Number(draft[r.itemId]) || 0 })),
      });
      toast({ title: kind === "produce" ? "생산량이 저장되었습니다." : "폐기량이 저장되었습니다." });
      queryClient.invalidateQueries({ queryKey: [key] });
    } catch (err) {
      toast({ variant: "destructive", title: "저장 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  const rows = data?.rows ?? [];
  const total = rows.reduce((s, r) => s + (Number(draft[r.itemId]) || 0), 0);
  const isProduce = kind === "produce";

  return (
    <StaffLayout
      title="디저트 생산일지"
      subtitle={isProduce ? "만든 수량을 적어주세요" : "폐기한 수량을 적어주세요"}
    >
      {/* 생산 / 폐기 전환 */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <ModeButton
          active={isProduce}
          onClick={() => setKind("produce")}
          icon={ChefHat}
          label="생산"
          hint="Baker"
        />
        <ModeButton
          active={!isProduce}
          onClick={() => setKind("discard")}
          icon={Trash2}
          label="폐기"
          hint="Close"
        />
      </div>

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
              <span className="w-24 text-center">{isProduce ? "생산" : "폐기"}</span>
            </div>
            <div className="divide-y">
              {rows.map((r) => {
                const other = isProduce
                  ? r.discardQty > 0
                    ? `폐기 ${r.discardQty}${r.discardedByName ? ` · ${r.discardedByName}` : ""}`
                    : ""
                  : r.qty > 0
                    ? `생산 ${r.qty}${r.producedByName ? ` · ${r.producedByName}` : ""}`
                    : "";
                return (
                  <div key={r.itemId} className="flex items-center px-4 py-2.5" data-testid={`row-dessert-${r.itemId}`}>
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="truncate text-sm text-foreground">{r.name}</div>
                      <div className="text-[10px] text-muted-foreground">{other || r.unit}</div>
                    </div>
                    <Input
                      value={draft[r.itemId] ?? ""}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, [r.itemId]: e.target.value.replace(/[^0-9]/g, "") }))
                      }
                      inputMode="numeric"
                      placeholder="0"
                      className="w-24 text-center"
                      data-testid={`input-${kind}-${r.itemId}`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-2.5 text-xs">
              <span className="text-muted-foreground">합계</span>
              <span
                className={`font-display tabular font-semibold ${isProduce ? "text-foreground" : "text-destructive"}`}
              >
                {total}
              </span>
            </div>
          </Card>

          <Button className="mt-4 w-full" onClick={save} disabled={busy} data-testid="button-save-dessert">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isProduce ? "생산량 저장" : "폐기량 저장"}
          </Button>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            {isProduce
              ? "폐기량은 마감 담당자가 따로 입력합니다."
              : "생산량은 베이킹 담당자가 입력한 값이며, 여기서 바뀌지 않습니다."}
          </p>
        </>
      )}
    </StaffLayout>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  label: string;
  hint: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 rounded-md border py-3 transition-colors ${
        active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover-elevate"
      }`}
      data-testid={`mode-${label}`}
    >
      <Icon className="h-4 w-4" strokeWidth={1.5} />
      <span className="text-sm font-semibold">{label}</span>
      <span className={`font-ui text-[10px] ${active ? "opacity-70" : "opacity-60"}`}>{hint}</span>
    </button>
  );
}
