import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { slotLabel, type Shift } from "@shared/schema";

type TeamSchedule = {
  shifts: Shift[];
  staff: { id: number; name: string; position: string }[];
};

export default function StaffWeekTeam({ from, today, staffId, myShifts, onOpenSchedule }: {
  from: string;
  today: string;
  staffId: number;
  myShifts: Shift[];
  onOpenSchedule: () => void;
}) {
  const [selected, setSelected] = useState(today);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(from + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const day = days.includes(selected) ? selected : today;
  const { data, isLoading, isError, refetch } = useQuery<TeamSchedule>({
    queryKey: [`/api/staff/shifts?from=${from}&to=${days[6]}`],
    refetchInterval: 60000,
  });
  const daily = (data?.shifts ?? []).filter((s) => s.workDate === day);
  const mine = daily.some((s) => s.staffId === staffId);
  // 여러 담당을 맡은 사람도 명단에는 한 번만 표시한다.
  const people = Array.from(new Set(daily.map((s) => s.staffId))).map((id) => ({
    id,
    name: data?.staff.find((s) => s.id === id)?.name ?? "이름 미등록",
    roles: Array.from(new Set(daily.filter((s) => s.staffId === id).map((s) => slotLabel(s.position || "근무")))),
  })).sort((a, b) => Number(b.id === staffId) - Number(a.id === staffId));

  return (
    <div className="s-card" data-testid="week-team">
      <div className="grid grid-cols-7 gap-1.5" aria-label="이번 주 날짜 선택">
        {days.map((d, i) => {
          const shift = myShifts.find((s) => s.workDate === d);
          return (
            <button key={d} type="button" onClick={() => setSelected(d)}
              aria-pressed={d === day} aria-label={`${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일 근무자 보기`}
              className="min-h-[64px] rounded-xl py-2 text-center"
              style={{ background: d === day ? "var(--s-ink)" : shift ? "var(--s-accent-soft)" : "var(--s-bg)", color: d === day ? "#fff" : "var(--s-ink)" }}>
              <span className="block text-[11px]">{["월", "화", "수", "목", "금", "토", "일"][i]}</span>
              <b className="block text-[14px]">{Number(d.slice(8))}</b>
              <span className="block text-[10px]">{shift ? slotLabel(shift.position || "근무") : "—"}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4" aria-live="polite">
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <h2 className="text-[14px] font-semibold">{day === today ? "오늘" : `${Number(day.slice(5, 7))}/${Number(day.slice(8))}`} 근무자</h2>
          {!isLoading && !isError && data && <span className="text-[12px]" style={{ color: "var(--s-muted)" }}>{mine ? `나 포함 ${people.length}명` : "내 근무 배정 없음"}</span>}
        </div>
        {isLoading ? <p className="mt-2 text-[13px]">근무표를 불러오는 중…</p> : isError ? (
          <div className="mt-2 text-[13px]">근무표를 불러오지 못했습니다.
            <button type="button" className="ml-2 underline" onClick={() => refetch()}>다시 시도</button>
          </div>
        ) : people.length === 0 ? <p className="mt-2 text-[13px]" style={{ color: "var(--s-muted)" }}>아직 배정된 근무자가 없습니다.</p> : (
          <ul className="mt-2">
            {people.map((p) => <li key={p.id} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
              <span className="min-w-0 break-words">{p.name}{p.id === staffId && <span className="ml-1 text-[11px]" style={{ color: "var(--s-accent)" }}>(나)</span>}</span>
              <span className="shrink-0 text-[12px]" style={{ color: "var(--s-muted)" }}>{p.roles.join(" · ")}</span>
            </li>)}
          </ul>
        )}
        <p className="mt-1 text-[11px]" style={{ color: "var(--s-muted)" }}>같은 날짜의 근무 배정 기준입니다.</p>
      </div>
      <button type="button" className="mt-3 min-h-11 w-full text-left text-[12px]" onClick={onOpenSchedule} data-testid="link-week">전체 근무표 보기 ›</button>
    </div>
  );
}
