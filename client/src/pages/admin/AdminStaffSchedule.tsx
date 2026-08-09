import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import { staffColor } from "@/lib/staffColors";
import { SHIFT_SLOTS, WEEKLY_TARGET_DAYS, type Shift, type PublicStaff } from "@shared/schema";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 그 날이 속한 주의 월요일 */
function mondayOf(d: Date): Date {
  const x = new Date(d);
  const dow = x.getDay();
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
  x.setHours(0, 0, 0, 0);
  return x;
}

/** 해당 월을 덮는 주(월~일) 목록. 앞뒤로 걸친 날짜도 포함한다. */
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

type Res = { shifts: Shift[]; staff: PublicStaff[]; from: string; to: string };

export default function AdminStaffSchedule() {
  const { toast } = useToast();
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [editing, setEditing] = useState<{ date: string; slot: string } | null>(null);

  const weeks = useMemo(() => weeksOfMonth(cursor.y, cursor.m), [cursor]);
  const from = ymd(weeks[0][0]);
  const to = ymd(weeks[weeks.length - 1][6]);
  const todayStr = ymd(today);

  const key = `/api/admin/staff/shifts?from=${from}&to=${to}`;
  const { data, isLoading } = useQuery<Res>({ queryKey: [key] });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [key] });

  const activeStaff = (data?.staff ?? []).filter((s) => s.active === 1);
  const nameOf = new Map((data?.staff ?? []).map((s) => [s.id, s.name]));

  // (날짜|슬롯) → shift
  const cellMap = useMemo(() => {
    const m = new Map<string, Shift>();
    for (const s of data?.shifts ?? []) m.set(`${s.workDate}|${s.position}`, s);
    return m;
  }, [data]);

  async function assign(date: string, slot: string, staffId: number) {
    setEditing(null);
    try {
      if (staffId === 0) {
        await apiRequest("POST", "/api/admin/staff/shifts/clear", { workDate: date, slot });
      } else {
        await apiRequest("POST", "/api/admin/staff/shifts/assign", { workDate: date, slot, staffId });
      }
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "저장 실패", description: errMsg(err) });
    }
  }

  function moveMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Schedule</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">근무 스케줄</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          칸을 눌러 직원을 넣으세요. 오른쪽에 주별 근무일이 집계되고, 주 {WEEKLY_TARGET_DAYS}일이 안 되면 표시됩니다.
        </p>

        <div className="mb-4 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => moveMonth(-1)} data-testid="button-prev-month">
            <ChevronLeft className="h-4 w-4" />
            이전 달
          </Button>
          <span className="font-display text-base font-semibold text-foreground">
            {cursor.y}년 {cursor.m + 1}월
          </span>
          <Button variant="outline" size="sm" onClick={() => moveMonth(1)} data-testid="button-next-month">
            다음 달
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}
          >
            이번 달
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : activeStaff.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-sm text-muted-foreground">
              등록된 직원이 없습니다. 먼저 <span className="font-medium text-foreground">직원 계정</span>에서 직원을 추가해 주세요.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {weeks.map((week) => {
              // 이 주의 직원별 근무일 수
              const counts = new Map<number, number>();
              for (const d of week) {
                const ds = ymd(d);
                for (const slot of SHIFT_SLOTS) {
                  const cell = cellMap.get(`${ds}|${slot}`);
                  if (cell) counts.set(cell.staffId, (counts.get(cell.staffId) ?? 0) + 1);
                }
              }
              // 아직 아무도 배정하지 않은 주는 경고를 띄우지 않는다 (앞으로 짤 주)
              const weekEmpty = counts.size === 0;
              const short = weekEmpty
                ? []
                : activeStaff.filter((s) => (counts.get(s.id) ?? 0) < WEEKLY_TARGET_DAYS);

              return (
                <Card key={ymd(week[0])} className="overflow-hidden">
                  <div className="table-scroll overflow-x-auto">
                    <div className="flex min-w-[900px]">
                      {/* 달력 */}
                      <div className="flex-1">
                        <table className="w-full table-fixed border-collapse text-sm">
                          <thead>
                            <tr>
                              <th className="w-16 border-b border-r bg-muted/40 px-2 py-2"></th>
                              {week.map((d, i) => {
                                const inMonth = d.getMonth() === cursor.m;
                                const isToday = ymd(d) === todayStr;
                                return (
                                  <th
                                    key={ymd(d)}
                                    className={`border-b border-r px-2 py-2 text-center ${
                                      isToday ? "bg-foreground/5" : "bg-muted/40"
                                    }`}
                                  >
                                    <div
                                      className={`font-ui text-[10px] font-medium ${
                                        i === 5 ? "text-blue-600" : i === 6 ? "text-red-600" : "text-muted-foreground"
                                      }`}
                                    >
                                      {DOW[i]}
                                    </div>
                                    <div
                                      className={`font-display text-sm font-semibold ${
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
                                <td className="border-b border-r bg-muted/20 px-2 py-1 font-ui text-[11px] font-medium text-muted-foreground">
                                  {slot}
                                </td>
                                {week.map((d) => {
                                  const ds = ymd(d);
                                  const cell = cellMap.get(`${ds}|${slot}`);
                                  const isEditing = editing?.date === ds && editing?.slot === slot;
                                  const color = cell ? staffColor(cell.staffId) : null;
                                  return (
                                    <td key={ds} className="border-b border-r p-0">
                                      {isEditing ? (
                                        <select
                                          autoFocus
                                          defaultValue={cell ? String(cell.staffId) : ""}
                                          onChange={(e) => assign(ds, slot, Number(e.target.value))}
                                          onBlur={() => setEditing(null)}
                                          className="h-9 w-full min-w-0 border-0 bg-background px-1 text-xs outline-none"
                                          data-testid={`select-shift-${ds}-${slot}`}
                                        >
                                          <option value="">— 비우기 —</option>
                                          {activeStaff.map((s) => (
                                            <option key={s.id} value={s.id}>
                                              {s.name}
                                            </option>
                                          ))}
                                        </select>
                                      ) : (
                                        <button
                                          onClick={() => setEditing({ date: ds, slot })}
                                          className="h-9 w-full text-center text-xs transition-opacity hover:opacity-75"
                                          style={color ? { backgroundColor: color.bg, color: color.fg } : undefined}
                                          data-testid={`cell-shift-${ds}-${slot}`}
                                        >
                                          {cell ? nameOf.get(cell.staffId) ?? "-" : ""}
                                        </button>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* 주간 근무일 집계 */}
                      <div className="w-44 shrink-0 border-l">
                        <div className="flex border-b bg-muted/40 px-2 py-2 font-ui text-[11px] font-medium text-muted-foreground">
                          <span className="flex-1">성함</span>
                          <span className="w-12 text-right">근무일</span>
                        </div>
                        {activeStaff.map((s) => {
                          const n = counts.get(s.id) ?? 0;
                          const color = staffColor(s.id);
                          return (
                            <div key={s.id} className="flex items-center border-b px-2 py-1.5 text-xs">
                              <span
                                className="mr-1.5 inline-block h-3 w-3 shrink-0 rounded-sm"
                                style={{ backgroundColor: color.bg }}
                              />
                              <span className="flex-1 truncate text-foreground">{s.name}</span>
                              <span
                                className={`font-display tabular w-12 text-right font-semibold ${
                                  weekEmpty
                                    ? "text-muted-foreground/50"
                                    : n < WEEKLY_TARGET_DAYS
                                      ? "text-destructive"
                                      : "text-foreground"
                                }`}
                              >
                                {n}일
                              </span>
                            </div>
                          );
                        })}
                        {short.length > 0 && (
                          <div className="flex items-start gap-1.5 px-2 py-2 text-[11px] text-destructive">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                              {short.map((s) => s.name).join(", ")} — 주 {WEEKLY_TARGET_DAYS}일 미만
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
