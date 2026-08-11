// 직원 홈의 2주 달력.
// 단체 주문 같은 일정, 준비 작업, 내 근무를 한 화면에서 보고, 날짜를 누르면 그날 내용이 아래에 펼쳐진다.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import { slotLabel, STAFF_EVENT_KIND_LABEL, type StaffCalendar, type StaffEvent } from "@shared/schema";
import { Plus, Trash2, X, Loader2, Check } from "lucide-react";

const WEEK_LABEL = ["월", "화", "수", "목", "금", "토", "일"];

const KIND_TONE: Record<string, { bg: string; fg: string; bar: string }> = {
  order: { bg: "#e8ddd6", fg: "#6e5040", bar: "#a9825f" }, // 단체 주문
  event: { bg: "#dbe4ea", fg: "#3d5363", bar: "#5b7d97" }, // 행사
  etc: { bg: "#e4e4de", fg: "#55554c", bar: "#8d8d84" }, // 기타
};

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

export function StaffCalendarCard() {
  const { toast } = useToast();
  const { data } = useQuery<StaffCalendar>({ queryKey: ["/api/staff/calendar"] });
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("order");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [memo, setMemo] = useState("");

  if (!data) return null;

  const days = Array.from({ length: 14 }, (_, i) => addDays(data.from, i));
  const sel = picked ?? data.today;

  const eventsOn = (d: string) => data.events.filter((e) => e.startDate <= d && e.endDate >= d);
  const tasksOn = (d: string) => data.prepTasks.filter((t) => t.workDate === d);
  const shiftOn = (d: string) => data.shifts.find((s) => s.workDate === d) ?? null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/staff/calendar"] });
    queryClient.invalidateQueries({ queryKey: ["/api/staff/home"] });
  };

  function openForm() {
    setTitle("");
    setKind("order");
    setStart(sel);
    setEnd(sel);
    setMemo("");
    setAdding(true);
  }

  async function save() {
    if (!title.trim()) {
      toast({ variant: "destructive", title: "일정 이름을 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/staff/events", {
        title: title.trim(),
        kind,
        startDate: start,
        endDate: end || start,
        memo: memo.trim(),
      });
      toast({ title: "일정을 등록했습니다." });
      setAdding(false);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "등록 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function removeEvent(e: StaffEvent) {
    if (!confirm(`'${e.title}' 일정을 지울까요?`)) return;
    try {
      await apiRequest("DELETE", `/api/staff/events/${e.id}`);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  const selEvents = eventsOn(sel);
  const selTasks = tasksOn(sel);
  const selShift = shiftOn(sel);

  return (
    <>
      <div className="s-sect flex items-baseline justify-between">
        <span>앞으로 2주</span>
        <span className="text-[11px] font-normal" style={{ color: "var(--s-muted)" }}>
          일정 {data.events.length}건
        </span>
      </div>

      <div className="s-card" style={{ padding: "12px 10px 14px" }}>
        {/* 요일 머리 */}
        <div className="grid grid-cols-7 gap-1">
          {WEEK_LABEL.map((w) => (
            <div key={w} className="text-center text-[9.5px]" style={{ color: "var(--s-faint)" }}>
              {w}
            </div>
          ))}
        </div>

        {/* 14일 */}
        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((d) => {
            const evs = eventsOn(d);
            const tks = tasksOn(d);
            const sh = shiftOn(d);
            const isToday = d === data.today;
            const isSel = d === sel;
            return (
              <button
                key={d}
                onClick={() => setPicked(d)}
                className="flex flex-col items-center rounded-[9px] px-0.5 pb-1 pt-1"
                style={{
                  background: isSel ? "var(--s-accent-soft)" : sh ? "var(--s-bg)" : "transparent",
                  outline: isSel ? "1.5px solid var(--s-accent)" : "none",
                  outlineOffset: -1.5,
                }}
                data-testid={`cal-day-${d}`}
              >
                <span
                  className="flex h-[21px] w-[21px] items-center justify-center rounded-full text-[11.5px] font-semibold leading-none"
                  style={isToday ? { background: "var(--s-ink)", color: "#fff" } : undefined}
                >
                  {Number(d.slice(8))}
                </span>

                {/* 근무 */}
                <span className="mt-[3px] h-[9px] text-[8px] leading-none" style={{ color: "var(--s-muted)" }}>
                  {sh ? (sh.position ? slotLabel(sh.position) : "근무") : ""}
                </span>

                {/* 일정 막대 */}
                <span className="mt-[2px] flex w-full flex-col gap-[2px]">
                  {evs.slice(0, 2).map((e) => (
                    <span
                      key={e.id}
                      className="h-[3px] w-full rounded-full"
                      style={{ background: (KIND_TONE[e.kind] ?? KIND_TONE.etc).bar }}
                    />
                  ))}
                  {evs.length > 2 && (
                    <span className="text-[7.5px] leading-none" style={{ color: "var(--s-faint)" }}>
                      +{evs.length - 2}
                    </span>
                  )}
                </span>

                {/* 준비 작업 점 */}
                {tks.length > 0 && (
                  <span className="mt-[3px] flex gap-[2px]">
                    {tks.slice(0, 3).map((t) => (
                      <span
                        key={t.id}
                        className="h-[4px] w-[4px] rounded-full"
                        style={{ background: t.done === 1 ? "var(--s-faint)" : "var(--s-accent)" }}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 범례 */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
          {Object.entries(KIND_TONE).map(([k, tone]) => (
            <span key={k} className="flex items-center gap-1 text-[10px]" style={{ color: "var(--s-muted)" }}>
              <span className="h-[3px] w-3 rounded-full" style={{ background: tone.bar }} />
              {STAFF_EVENT_KIND_LABEL[k]}
            </span>
          ))}
          <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--s-muted)" }}>
            <span className="h-[4px] w-[4px] rounded-full" style={{ background: "var(--s-accent)" }} />
            준비 작업
          </span>
        </div>
      </div>

      {/* 고른 날 */}
      <div className="s-card mt-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[13.5px] font-semibold">{fmtDay(sel)}</span>
          {sel === data.today && (
            <span className="s-k" style={{ color: "var(--s-accent)" }}>
              오늘
            </span>
          )}
        </div>

        {selShift && (
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className="rounded-full px-2 py-[3px] text-[10.5px] font-medium"
              style={{ background: "var(--s-ink)", color: "#fff" }}
            >
              내 근무 {selShift.position ? slotLabel(selShift.position) : ""}
            </span>
          </div>
        )}

        {selEvents.length === 0 && selTasks.length === 0 && !selShift ? (
          <p className="mt-2 text-[12.5px]" style={{ color: "var(--s-muted)" }}>
            이날은 등록된 일정이 없습니다.
          </p>
        ) : (
          <div className="mt-1">
            {selEvents.map((e) => {
              const tone = KIND_TONE[e.kind] ?? KIND_TONE.etc;
              const span = e.startDate !== e.endDate;
              return (
                <div key={e.id} className="s-li" data-testid={`cal-event-${e.id}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className="rounded-full px-2 py-[3px] text-[10px] font-medium"
                        style={{ background: tone.bg, color: tone.fg }}
                      >
                        {STAFF_EVENT_KIND_LABEL[e.kind] ?? "기타"}
                      </span>
                      <span className="text-[13.5px] font-medium">{e.title}</span>
                    </div>
                    <div className="s-k mt-0.5" style={{ fontSize: 10.5 }}>
                      {span ? `${e.startDate} ~ ${e.endDate} · ` : ""}
                      {e.memo || `${e.createdByName} 등록`}
                    </div>
                  </div>
                  <button className="s-icon" onClick={() => removeEvent(e)} aria-label="삭제">
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                </div>
              );
            })}

            {selTasks.map((t) => (
              <div key={t.id} className="s-li">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px]"
                    style={
                      t.done === 1
                        ? { background: "var(--s-ink)", color: "#fff" }
                        : { background: "var(--s-bg)", boxShadow: "inset 0 0 0 1.5px #dedcd6" }
                    }
                  >
                    {t.done === 1 && <Check className="h-3 w-3" strokeWidth={2.6} />}
                  </span>
                  <span className="min-w-0">
                    <span
                      className="block truncate text-[13px]"
                      style={t.done === 1 ? { color: "var(--s-faint)", textDecoration: "line-through" } : undefined}
                    >
                      {t.title}
                    </span>
                    <span className="s-k block" style={{ fontSize: 10.5 }}>
                      준비 작업{t.done === 1 ? ` · ${t.doneByName} 완료` : ""}
                    </span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 일정 추가 */}
        {adding ? (
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--s-hair)" }}>
            <label className="s-label">종류</label>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(KIND_TONE).map((k) => (
                <button
                  key={k}
                  className={`s-chip ${kind === k ? "on" : ""}`}
                  onClick={() => setKind(k)}
                  data-testid={`kind-${k}`}
                >
                  {STAFF_EVENT_KIND_LABEL[k]}
                </button>
              ))}
            </div>

            <div className="mt-3">
              <label className="s-label">이름</label>
              <input
                className="s-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 디저트 단체 주문 30개"
                data-testid="input-event-title"
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="s-label">시작일</label>
                <input
                  className="s-input"
                  type="date"
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    if (e.target.value > end) setEnd(e.target.value);
                  }}
                  data-testid="input-event-start"
                />
              </div>
              <div>
                <label className="s-label">종료일</label>
                <input
                  className="s-input"
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  data-testid="input-event-end"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="s-label">메모 (선택)</label>
              <input
                className="s-input"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="수량, 픽업 시간 등"
              />
            </div>

            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <button className="s-pill" onClick={save} disabled={busy} data-testid="button-save-event">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "등록"}
              </button>
              <button
                className="s-pill line"
                style={{ paddingLeft: 18, paddingRight: 18 }}
                onClick={() => setAdding(false)}
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>
          </div>
        ) : (
          <button className="s-pill line wide mt-3" onClick={openForm} data-testid="button-open-event-form">
            <Plus className="h-4 w-4" strokeWidth={1.8} />이 날에 일정 추가
          </button>
        )}
      </div>
    </>
  );
}
