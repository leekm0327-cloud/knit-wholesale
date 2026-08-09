import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout, useStaff } from "@/components/StaffLayout";
import { staffColor } from "@/lib/staffColors";
import { SHIFT_SLOTS, type Shift } from "@shared/schema";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DOW = ["월", "화", "수", "목", "금", "토", "일"];

/**
 * 파트 구분 — 오픈 / 베이커 / 클로즈 / 파트 네 갈래.
 * 클로즈는 두 명이므로 한 묶음 안에 두 줄로 둔다.
 * 파트는 '색'이 아니라 여백과 라벨로 나눈다. 색은 사람 몫이다.
 */
const PART_GROUPS = [
  { key: "Open", label: "OPEN", ko: "오픈", slots: ["Open"] },
  { key: "Baker", label: "BAKER", ko: "베이커", slots: ["Baker"] },
  { key: "Close", label: "CLOSE", ko: "마감", slots: ["Close", "Close2"] },
  { key: "Part", label: "PART", ko: "파트", slots: ["Part"] },
].filter((g) => g.slots.some((s) => (SHIFT_SLOTS as readonly string[]).includes(s)));

const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "29px repeat(7, minmax(0, 1fr))",
  gap: "3px",
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mondayOf(d: Date): Date {
  const x = new Date(d);
  const dow = x.getDay();
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
  x.setHours(0, 0, 0, 0);
  return x;
}

function weeksOfMonth(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const weeks: Date[][] = [];
  let cur = mondayOf(first);
  while (cur <= last) {
    const start = new Date(cur);
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return d;
      }),
    );
    cur = new Date(cur);
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

/** 이름을 좁은 칸에 넣기 위해 성을 뺀 이름만 (3자 이상일 때) */
function shortName(name: string): string {
  const n = name.trim();
  return n.length >= 3 ? n.slice(1) : n;
}

type ShiftResponse = { shifts: Shift[]; staff: { id: number; name: string; position: string }[] };

export default function StaffSchedule() {
  const { data: me } = useStaff();
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });

  const weeks = useMemo(() => weeksOfMonth(cursor.y, cursor.m), [cursor]);
  const from = ymd(weeks[0][0]);
  const to = ymd(weeks[weeks.length - 1][6]);
  const todayStr = ymd(today);
  const isThisMonth = cursor.y === today.getFullYear() && cursor.m === today.getMonth();

  const { data, isLoading } = useQuery<ShiftResponse>({
    queryKey: [`/api/staff/shifts?from=${from}&to=${to}`],
  });

  const nameOf = new Map((data?.staff ?? []).map((s) => [s.id, s.name]));
  const cellMap = useMemo(() => {
    const m = new Map<string, Shift>();
    for (const s of data?.shifts ?? []) m.set(`${s.workDate}|${s.position}`, s);
    return m;
  }, [data]);

  // 이번 달 내 근무일 수 (이 달에 속한 날짜만)
  const myDays = useMemo(() => {
    const days = new Set<string>();
    for (const s of data?.shifts ?? []) {
      if (!me || s.staffId !== me.id) continue;
      const d = new Date(s.workDate + "T00:00:00");
      if (d.getMonth() === cursor.m && d.getFullYear() === cursor.y) days.add(s.workDate);
    }
    return days.size;
  }, [data, me, cursor]);

  function moveMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  return (
    <StaffLayout title="스케줄" subtitle="근무표">
      {/* 월 이동 — 선 없이 카드 하나로 */}
      <div className="s-card flex items-center justify-between" style={{ padding: "9px 10px" }}>
        <button
          onClick={() => moveMonth(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ background: "var(--s-bg)" }}
          data-testid="button-prev-month"
          aria-label="이전 달"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
        </button>

        <button
          onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}
          className="text-center"
          disabled={isThisMonth}
        >
          <div className="text-[15px] font-semibold tracking-tight">
            {cursor.y}년 {cursor.m + 1}월
          </div>
          <div className="s-k" style={{ marginTop: 1 }}>
            {isThisMonth ? `내 근무 ${myDays}일` : "이번 달로"}
          </div>
        </button>

        <button
          onClick={() => moveMonth(1)}
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ background: "var(--s-bg)" }}
          data-testid="button-next-month"
          aria-label="다음 달"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>

      {isLoading ? (
        <div className="mt-2.5 space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-40 w-full animate-pulse"
              style={{ background: "var(--s-surface)", borderRadius: "var(--s-radius)" }}
            />
          ))}
        </div>
      ) : (
        weeks.map((week) => {
          const myCount = week.filter((d) =>
            SHIFT_SLOTS.some((slot) => cellMap.get(`${ymd(d)}|${slot}`)?.staffId === me?.id),
          ).length;
          const hasToday = week.some((d) => ymd(d) === todayStr);

          return (
            <div key={ymd(week[0])}>
              <div className="s-sect flex items-baseline justify-between" style={{ margin: "16px 4px 8px" }}>
                <span className="text-[13px] font-medium" style={{ color: "var(--s-muted)" }}>
                  {week[0].getMonth() + 1}.{week[0].getDate()} – {week[6].getMonth() + 1}.{week[6].getDate()}
                  {hasToday && (
                    <span style={{ color: "var(--s-accent)", fontWeight: 600 }}> · 이번 주</span>
                  )}
                </span>
                <span className="text-[12px] font-semibold">내 근무 {myCount}일</span>
              </div>

              <div className="s-card" style={{ padding: "10px 9px 11px" }}>
                {/* 날짜 머리 */}
                <div style={GRID}>
                  <div />
                  {week.map((d, i) => {
                    const inMonth = d.getMonth() === cursor.m;
                    const isToday = ymd(d) === todayStr;
                    return (
                      <div key={ymd(d)} className="pb-1 text-center">
                        <div
                          className="text-[9.5px] font-medium"
                          style={{ color: isToday ? "var(--s-ink)" : "var(--s-faint)" }}
                        >
                          {DOW[i]}
                        </div>
                        <div className="mt-0.5 flex justify-center">
                          <span
                            className="flex h-[19px] w-[19px] items-center justify-center rounded-full text-[11.5px] font-semibold leading-none"
                            style={
                              isToday
                                ? { background: "var(--s-ink)", color: "#fff" }
                                : { color: inMonth ? "var(--s-ink)" : "var(--s-faint)" }
                            }
                          >
                            {d.getDate()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 파트 묶음 — 묶음 사이를 띄워 네 갈래가 한눈에 갈리게 */}
                {PART_GROUPS.map((g, gi) => (
                  <div key={g.key} style={{ ...GRID, marginTop: gi === 0 ? 2 : 11 }}>
                    <div
                      className="flex items-center justify-center text-[8px] font-bold leading-none"
                      style={{
                        gridRow: `span ${g.slots.length}`,
                        color: "var(--s-muted)",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {g.label}
                    </div>
                    {g.slots.map((slot) =>
                      week.map((d) => {
                        const cell = cellMap.get(`${ymd(d)}|${slot}`);
                        const mine = !!cell && cell.staffId === me?.id;
                        const color = cell ? staffColor(cell.staffId) : null;
                        return (
                          <div
                            key={slot + ymd(d)}
                            className="flex h-[25px] items-center justify-center truncate rounded-[7px] px-0.5 text-[10px] leading-none"
                            style={
                              color
                                ? mine
                                  ? { background: "var(--s-ink)", color: "#fff", fontWeight: 600 }
                                  : { background: color.bg, color: color.fg }
                                : { background: "var(--s-hair)" }
                            }
                          >
                            {cell ? shortName(nameOf.get(cell.staffId) ?? "-") : ""}
                          </div>
                        );
                      }),
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* 범례 — 색은 사람을 가리킨다 */}
      <div className="s-sect" style={{ margin: "18px 4px 8px" }}>
        <span className="text-[13px] font-medium" style={{ color: "var(--s-muted)" }}>
          색 구분
        </span>
      </div>
      <div className="s-card" style={{ padding: "12px 13px" }}>
        <div className="flex flex-wrap gap-x-3.5 gap-y-2.5">
          <span className="flex items-center gap-1.5 text-[11.5px]">
            <span className="h-4 w-4 rounded-[5px]" style={{ background: "var(--s-ink)" }} />
            <b className="font-semibold">내 근무</b>
          </span>
          {(data?.staff ?? [])
            .filter((s) => s.id !== me?.id)
            .map((s) => {
              const c = staffColor(s.id);
              return (
                <span key={s.id} className="flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--s-muted)" }}>
                  <span className="h-4 w-4 rounded-[5px]" style={{ background: c.bg, border: `1.5px solid ${c.fg}33` }} />
                  {s.name}
                </span>
              );
            })}
        </div>
        <div className="mt-2.5 text-[11px]" style={{ color: "var(--s-faint)" }}>
          왼쪽 라벨이 파트입니다. OPEN 오픈 · BAKER 베이커 · CLOSE 마감(2명) · PART 파트
        </div>
      </div>
    </StaffLayout>
  );
}
