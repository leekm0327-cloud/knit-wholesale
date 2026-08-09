import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StaffLayout, useStaff } from "@/components/StaffLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { Shift } from "@shared/schema";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function weekStart(base: Date): Date {
  const d = new Date(base);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type ShiftResponse = { shifts: Shift[]; staff: { id: number; name: string; position: string }[] };

export default function StaffSchedule() {
  const { data: me } = useStaff();
  const [offset, setOffset] = useState(0);

  const base = new Date();
  base.setDate(base.getDate() + offset * 7);
  const start = weekStart(base);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const from = ymd(days[0]);
  const to = ymd(days[6]);
  const todayStr = ymd(new Date());

  const { data, isLoading } = useQuery<ShiftResponse>({
    queryKey: ["/api/staff/shifts?from=" + from + "&to=" + to],
  });

  const nameOf = new Map((data?.staff ?? []).map((s) => [s.id, s.name]));

  return (
    <StaffLayout title="스케줄표" subtitle={`${from} ~ ${to}`}>
      <div className="mb-4 flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setOffset((o) => o - 1)} data-testid="button-prev-week">
          <ChevronLeft className="h-4 w-4" />
          이전 주
        </Button>
        {offset !== 0 && (
          <Button variant="ghost" size="sm" onClick={() => setOffset(0)}>
            이번 주
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setOffset((o) => o + 1)} data-testid="button-next-week">
          다음 주
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {days.map((d) => {
            const key = ymd(d);
            const rows = (data?.shifts ?? []).filter((s) => s.workDate === key);
            const isToday = key === todayStr;
            return (
              <Card key={key} className={`p-4 ${isToday ? "border-foreground" : ""}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-display text-sm font-semibold text-foreground">
                    {d.getMonth() + 1}.{d.getDate()}
                  </span>
                  <span className="text-xs text-muted-foreground">({DOW[d.getDay()]})</span>
                  {isToday && <Badge className="text-[10px]">오늘</Badge>}
                </div>
                {rows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">근무 없음</p>
                ) : (
                  <div className="space-y-1.5">
                    {rows.map((s) => (
                      <div
                        key={s.id}
                        className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                          s.staffId === me?.id ? "border-foreground/40 bg-muted/40" : ""
                        }`}
                      >
                        <span className="text-foreground">
                          {nameOf.get(s.staffId) ?? "-"}
                          {s.position ? <span className="ml-1.5 text-xs text-muted-foreground">{s.position}</span> : null}
                        </span>
                        <span className="font-display tabular text-xs text-muted-foreground">
                          {s.startTime} – {s.endTime}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </StaffLayout>
  );
}
