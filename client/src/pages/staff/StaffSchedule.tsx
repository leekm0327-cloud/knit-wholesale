import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout, useStaff } from "@/components/StaffLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { staffColor } from "@/lib/staffColors";
import { SHIFT_SLOTS, slotLabel, type Shift } from "@shared/schema";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

type ShiftResponse = { shifts: Shift[]; staff: { id: number; name: string; position: string }[] };

export default function StaffSchedule() {
  const { data: me } = useStaff();
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });

  const weeks = useMemo(() => weeksOfMonth(cursor.y, cursor.m), [cursor]);
  const from = ymd(weeks[0][0]);
  const to = ymd(weeks[weeks.length - 1][6]);
  const todayStr = ymd(today);

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
    <StaffLayout title="스케줄표" subtitle={`${cursor.y}년 ${cursor.m + 1}월 · 내 근무 ${myDays}일`}>
      <div className="mb-4 flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => moveMonth(-1)} data-testid="button-prev-month">
          <ChevronLeft className="h-4 w-4" />
          이전 달
        </Button>
        {(cursor.y !== today.getFullYear() || cursor.m !== today.getMonth()) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}
          >
            이번 달
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => moveMonth(1)} data-testid="button-next-month">
          다음 달
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {weeks.map((week) => {
            const myCount = week.filter((d) =>
              SHIFT_SLOTS.some((slot) => cellMap.get(`${ymd(d)}|${slot}`)?.staffId === me?.id),
            ).length;

            return (
              <Card key={ymd(week[0])} className="overflow-hidden">
                <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5">
                  <span className="font-ui text-[11px] text-muted-foreground">
                    {week[0].getMonth() + 1}.{week[0].getDate()} – {week[6].getMonth() + 1}.{week[6].getDate()}
                  </span>
                  <span className="font-ui text-[11px] font-semibold text-foreground">내 근무 {myCount}일</span>
                </div>
                <div className="table-scroll overflow-x-auto">
                  <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: 520 }}>
                    <thead>
                      <tr>
                        <th className="w-11 border-b border-r bg-muted/40 px-1 py-1.5"></th>
                        {week.map((d, i) => {
                          const inMonth = d.getMonth() === cursor.m;
                          const isToday = ymd(d) === todayStr;
                          return (
                            <th
                              key={ymd(d)}
                              className={`border-b border-r px-1 py-1.5 text-center ${
                                isToday ? "bg-foreground/10" : "bg-muted/40"
                              }`}
                            >
                              <div
                                className={`font-ui text-[9px] font-medium ${
                                  i === 5 ? "text-blue-600" : i === 6 ? "text-red-600" : "text-muted-foreground"
                                }`}
                              >
                                {DOW[i]}
                              </div>
                              <div
                                className={`font-display text-[13px] font-semibold ${
                                  inMonth ? "text-foreground" : "text-muted-foreground/40"
                                }`}
                              >
                                {d.getDate()}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {SHIFT_SLOTS.map((slot) => (
                        <tr key={slot}>
                          <td className="border-b border-r bg-muted/20 px-1 py-1 font-ui text-[10px] font-medium text-muted-foreground">
                            {slotLabel(slot)}
                          </td>
                          {week.map((d) => {
                            const cell = cellMap.get(`${ymd(d)}|${slot}`);
                            const mine = !!cell && cell.staffId === me?.id;
                            const color = cell ? staffColor(cell.staffId) : null;
                            return (
                              <td key={ymd(d)} className="border-b border-r p-0">
                                <div
                                  className={`flex h-8 items-center justify-center text-[11px] ${
                                    mine ? "font-bold" : cell ? "opacity-40" : ""
                                  }`}
                                  style={
                                    color
                                      ? {
                                          backgroundColor: color.bg,
                                          color: color.fg,
                                          boxShadow: mine ? "inset 0 0 0 2px currentColor" : undefined,
                                        }
                                      : undefined
                                  }
                                >
                                  {cell ? nameOf.get(cell.staffId) ?? "-" : ""}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        내 근무는 진하게 · 테두리로 표시됩니다. 옆으로 밀면 한 주 전체가 보입니다.
      </p>
    </StaffLayout>
  );
}
