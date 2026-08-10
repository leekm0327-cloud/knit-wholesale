import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout } from "@/components/StaffLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import type { PrepTask, PrepTaskPreset } from "@shared/schema";
import { Loader2, ChefHat, Trash2, Check, Plus, X } from "lucide-react";

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

      {/* 이 날 해야 하는 준비 작업 */}
      <PrepTasks date={date} />

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

/**
 * 간헐적으로 하는 준비 작업 (휘낭시에 반죽, 에그타르트 필링, 카라멜소스 제작 등).
 * 매일 하는 일이 아니라서 품목 마스터가 아니라 '그날 해야 할 일'로 붙여 둔다.
 */
function PrepTasks({ date }: { date: string }) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [manual, setManual] = useState(false);
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);

  const key = `/api/staff/prep-tasks?date=${date}`;
  const { data } = useQuery<{ date: string; rows: PrepTask[] }>({ queryKey: [key] });
  const { data: presetData } = useQuery<PrepTaskPreset[]>({ queryKey: ["/api/staff/prep-presets"] });
  const presets = presetData ?? [];
  const rows = data?.rows ?? [];
  const left = rows.filter((r) => r.done !== 1).length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [key] });
    queryClient.invalidateQueries({ queryKey: ["/api/staff/home"] });
  };

  async function add() {
    if (!title.trim()) {
      toast({ variant: "destructive", title: "할 일을 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/staff/prep-tasks", {
        workDate: date,
        title: title.trim(),
        memo: memo.trim(),
      });
      setTitle("");
      setMemo("");
      setAdding(false);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "추가 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  /** 저장해 둔 일을 그대로 그날 할 일로 넣는다 */
  async function addFromPreset(p: PrepTaskPreset) {
    if (busy) return;
    setBusy(true);
    try {
      await apiRequest("POST", "/api/staff/prep-tasks", {
        workDate: date,
        title: p.title,
        memo: p.memo,
      });
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "추가 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(t: PrepTask) {
    try {
      await apiRequest("POST", `/api/staff/prep-tasks/${t.id}/toggle`);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "실패", description: errMsg(err) });
    }
  }

  async function remove(t: PrepTask) {
    if (!confirm(`'${t.title}' 을(를) 지울까요?`)) return;
    try {
      await apiRequest("DELETE", `/api/staff/prep-tasks/${t.id}`);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  return (
    <>
      <div className="s-sect flex items-baseline justify-between">
        <span>준비 작업</span>
        <span className="text-[11px] font-normal" style={{ color: "var(--s-muted)" }}>
          {rows.length === 0 ? "없음" : left === 0 ? "모두 완료" : `${left}개 남음`}
        </span>
      </div>

      <div className="s-card" style={{ padding: rows.length ? "4px 16px 12px" : "14px 16px" }}>
        {rows.length === 0 ? (
          <p className="text-[12.5px]" style={{ color: "var(--s-muted)" }}>
            이 날 해야 하는 준비 작업이 없습니다.
          </p>
        ) : (
          rows.map((t) => {
            const done = t.done === 1;
            return (
              <div key={t.id} className="s-li" data-testid={`row-prep-${t.id}`}>
                <button
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  onClick={() => toggle(t)}
                  data-testid={`toggle-prep-${t.id}`}
                >
                  <span
                    className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px]"
                    style={
                      done
                        ? { background: "var(--s-ink)", color: "#fff" }
                        : { background: "var(--s-bg)", boxShadow: "inset 0 0 0 1.5px #dedcd6" }
                    }
                  >
                    {done && <Check className="h-3.5 w-3.5" strokeWidth={2.6} />}
                  </span>
                  <span className="min-w-0">
                    <span
                      className="block truncate text-[13.5px]"
                      style={done ? { color: "var(--s-faint)", textDecoration: "line-through" } : undefined}
                    >
                      {t.title}
                    </span>
                    <span className="s-k block truncate" style={{ fontSize: 10.5 }}>
                      {done
                        ? `${t.doneByName} 완료`
                        : t.memo || (t.createdByName ? `${t.createdByName} 등록` : "")}
                    </span>
                  </span>
                </button>
                <button className="s-icon" onClick={() => remove(t)} aria-label="삭제">
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
              </div>
            );
          })
        )}

        {adding ? (
          <div className="mt-3">
            {/* 저장해 둔 일 고르기 — 목록이 길면 이 안에서만 스크롤된다 */}
            {presets.length > 0 && !manual && (
              <>
                <div className="s-label">자주 하는 일에서 고르기</div>
                <div className="s-picker" data-testid="prep-preset-list">
                  {presets.map((p) => {
                    const already = rows.some((r) => r.title === p.title);
                    return (
                      <button
                        key={p.id}
                        className="s-picker-item"
                        onClick={() => addFromPreset(p)}
                        disabled={already || busy}
                        data-testid={`preset-${p.id}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px]">{p.title}</span>
                          {p.memo && (
                            <span className="s-k block truncate" style={{ fontSize: 10.5 }}>
                              {p.memo}
                            </span>
                          )}
                        </span>
                        {already ? (
                          <Check className="h-4 w-4 shrink-0" style={{ color: "var(--s-accent)" }} strokeWidth={2.4} />
                        ) : (
                          <Plus className="h-4 w-4 shrink-0" style={{ color: "var(--s-faint)" }} strokeWidth={2} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {manual || presets.length === 0 ? (
              <>
                <input
                  className="s-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예: 휘낭시에 반죽"
                  data-testid="input-prep-title"
                />
                <input
                  className="s-input mt-2"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="메모 (선택)"
                />
                <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2">
                  <button className="s-pill" onClick={add} disabled={busy} data-testid="button-add-prep">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "추가"}
                  </button>
                  <button
                    className="s-pill line"
                    style={{ paddingLeft: 18, paddingRight: 18 }}
                    onClick={() => {
                      setManual(false);
                      setAdding(false);
                    }}
                  >
                    <X className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button className="s-pill line" onClick={() => setManual(true)} data-testid="button-prep-manual">
                  직접 입력
                </button>
                <button className="s-pill line" onClick={() => setAdding(false)}>
                  닫기
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            className="s-pill line wide mt-3"
            onClick={() => setAdding(true)}
            data-testid="button-open-prep-form"
          >
            <Plus className="h-4 w-4" strokeWidth={1.8} />할 일 추가
          </button>
        )}
      </div>
    </>
  );
}
