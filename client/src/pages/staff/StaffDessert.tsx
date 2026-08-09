import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout } from "@/components/StaffLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import { Loader2, ChefHat, Trash2 } from "lucide-react";

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

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${dow}요일`;
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
  const isToday = date === today();

  return (
    <StaffLayout title="생산일지" subtitle="디저트">
      {/* 생산 / 폐기 */}
      <div className="s-seg">
        <button className={isProduce ? "on" : ""} onClick={() => setKind("produce")} data-testid="mode-생산">
          <ChefHat className="h-4 w-4" strokeWidth={1.6} />
          생산
        </button>
        <button className={!isProduce ? "on" : ""} onClick={() => setKind("discard")} data-testid="mode-폐기">
          <Trash2 className="h-4 w-4" strokeWidth={1.6} />
          폐기
        </button>
      </div>
      <p className="mt-2 px-1 text-[11.5px]" style={{ color: "var(--s-muted)" }}>
        {isProduce ? "만든 수량을 적어주세요. 베이킹 담당" : "폐기한 수량을 적어주세요. 마감 담당"}
      </p>

      {/* 날짜 */}
      <div className="s-card mt-2.5 flex items-center justify-between" style={{ padding: "9px 10px" }}>
        <button
          className="s-icon"
          onClick={() => setDate((v) => addDays(v, -1))}
          aria-label="이전 날"
          data-testid="button-prev-day"
        >
          <span className="text-[15px] leading-none">‹</span>
        </button>
        <button className="text-center" onClick={() => setDate(today())} disabled={isToday}>
          <div className="text-[14.5px] font-semibold tracking-tight">{fmtDay(date)}</div>
          <div className="s-k" style={{ marginTop: 1 }}>
            {isToday ? "오늘" : "오늘로"}
          </div>
        </button>
        <button
          className="s-icon"
          onClick={() => setDate((v) => addDays(v, 1))}
          aria-label="다음 날"
          data-testid="button-next-day"
        >
          <span className="text-[15px] leading-none">›</span>
        </button>
      </div>

      {isLoading ? (
        <div className="mt-2.5 space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-14 w-full animate-pulse"
              style={{ background: "var(--s-surface)", borderRadius: "var(--s-radius)" }}
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="s-card">
          <div className="s-empty">
            등록된 디저트 품목이 없습니다.
            <br />
            대표님께 품목 등록을 요청해 주세요.
          </div>
        </div>
      ) : (
        <>
          <div className="s-sect">{isProduce ? "생산 수량" : "폐기 수량"}</div>
          <div className="s-card" style={{ padding: "4px 16px" }}>
            {rows.map((r) => {
              const other = isProduce
                ? r.discardQty > 0
                  ? `폐기 ${r.discardQty}${r.discardedByName ? ` · ${r.discardedByName}` : ""}`
                  : ""
                : r.qty > 0
                  ? `생산 ${r.qty}${r.producedByName ? ` · ${r.producedByName}` : ""}`
                  : "";
              return (
                <div key={r.itemId} className="s-li" data-testid={`row-dessert-${r.itemId}`}>
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px]">{r.name}</div>
                    <div className="s-k" style={{ fontSize: 10.5 }}>
                      {other || r.unit}
                    </div>
                  </div>
                  <input
                    className="s-input center"
                    style={{ width: 74, padding: "9px 6px" }}
                    value={draft[r.itemId] ?? ""}
                    onChange={(e) => setDraft((p) => ({ ...p, [r.itemId]: e.target.value.replace(/[^0-9]/g, "") }))}
                    inputMode="numeric"
                    placeholder="0"
                    data-testid={`input-${kind}-${r.itemId}`}
                  />
                </div>
              );
            })}
          </div>

          <div className="s-card mt-2.5 flex items-center justify-between">
            <span className="text-[13px]" style={{ color: "var(--s-muted)" }}>
              합계
            </span>
            <span className="text-[19px] font-semibold tracking-tight">{total}</span>
          </div>

          <button className="s-pill wide mt-2.5" onClick={save} disabled={busy} data-testid="button-save-dessert">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isProduce ? "생산량 저장" : "폐기량 저장"}
          </button>

          <p className="mt-3 px-2 text-center text-[11px] leading-relaxed" style={{ color: "var(--s-muted)" }}>
            {isProduce
              ? "폐기량은 마감 담당자가 따로 입력합니다."
              : "생산량은 베이킹 담당자가 입력한 값이며, 여기서 바뀌지 않습니다."}
          </p>
        </>
      )}
    </StaffLayout>
  );
}
