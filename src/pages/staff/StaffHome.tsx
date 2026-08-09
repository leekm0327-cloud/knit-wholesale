import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { StaffLayout } from "@/components/StaffLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import { staffColor } from "@/lib/staffColors";
import { slotLabel, type StaffHome as StaffHomeData } from "@shared/schema";
import { useState } from "react";
import { Coffee, CakeSlice, CalendarDays, Megaphone, LogIn, LogOut, Loader2 } from "lucide-react";

const WEEK_LABEL = ["월", "화", "수", "목", "금", "토", "일"];

/** 월요일 날짜(YYYY-MM-DD)로부터 7일치 날짜 배열 */
function weekDays(from: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(from + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function hhmm(ts: number | null | undefined): string {
  if (!ts) return "--:--";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtMinutes(m: number): string {
  if (!m) return "0시간";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}시간` : `${h}시간 ${mm}분`;
}

export default function StaffHome() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery<StaffHomeData>({
    queryKey: ["/api/staff/home"],
    refetchInterval: 60000,
  });

  const att = data?.attendance ?? null;
  const workedIn = !!att?.clockInAt;
  const workedOut = !!att?.clockOutAt;

  async function punch(kind: "clock-in" | "clock-out") {
    if (busy) return;
    setBusy(true);
    try {
      await apiRequest("POST", `/api/staff/attendance/${kind}`);
      toast({ title: kind === "clock-in" ? "출근 기록되었습니다." : "퇴근 기록되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/home"] });
    } catch (err) {
      toast({ variant: "destructive", title: "실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <StaffLayout title="오늘" subtitle={data?.today ?? ""}>
      {/* 오늘 근무 */}
      {isLoading ? (
        <Skeleton className="mb-4 h-20 w-full" />
      ) : data?.shift ? (
        <div
          className="mb-4 px-4 py-5 text-center"
          style={{
            backgroundColor: staffColor(data.staff.id).fg,
            color: "#fff",
          }}
          data-testid="banner-today-shift"
        >
          <div className="font-ui text-[10px] font-bold tracking-[0.18em] opacity-75">TODAY</div>
          <div className="font-display mt-0.5 text-2xl font-semibold uppercase tracking-wide">
            {data.shift.position ? slotLabel(data.shift.position) : "근무"}
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-md border border-dashed px-4 py-4 text-center text-xs text-muted-foreground">
          오늘 등록된 근무가 없습니다
        </div>
      )}

      {/* 내일 · 이번 주 */}
      {!isLoading && data && (
        <Card className="mb-4 overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold text-foreground">내일</span>
            {data.tomorrowShift ? (
              <span
                className="rounded-sm px-2.5 py-1 font-ui text-xs font-bold uppercase tracking-wide"
                style={{
                  backgroundColor: staffColor(data.staff.id).bg,
                  color: staffColor(data.staff.id).fg,
                }}
                data-testid="badge-tomorrow-shift"
              >
                {data.tomorrowShift.position ? slotLabel(data.tomorrowShift.position) : "근무"}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">근무 없음</span>
            )}
          </div>

          <div className="px-3 py-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="font-ui text-[11px] font-medium text-muted-foreground">이번 주</span>
              <span className="font-ui text-[11px] text-muted-foreground">
                근무 {data.weekShifts.length}일
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weekDays(data.weekFrom).map((d, i) => {
                const sh = data.weekShifts.find((w) => w.workDate === d);
                const isToday = d === data.today;
                const color = staffColor(data.staff.id);
                return (
                  <div key={d} className="text-center">
                    <div
                      className={`font-ui text-[10px] ${
                        i === 5 ? "text-blue-600" : i === 6 ? "text-red-600" : "text-muted-foreground"
                      }`}
                    >
                      {WEEK_LABEL[i]}
                    </div>
                    <div
                      className={`mt-1 flex h-12 flex-col items-center justify-center text-[10px] leading-tight ${
                        sh ? "font-semibold" : "text-muted-foreground/60"
                      }`}
                      style={
                        sh
                          ? isToday
                            ? { backgroundColor: color.fg, color: "#fff" }
                            : { backgroundColor: color.bg, color: color.fg }
                          : { backgroundColor: "hsl(var(--muted))" }
                      }
                    >
                      <span className="font-display text-[13px] font-semibold">{Number(d.slice(8))}</span>
                      <span className="font-ui">{sh ? (sh.position ? slotLabel(sh.position) : "근무") : "휴무"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* 출퇴근 */}
      <Card className="p-5">
        <div className="mb-4 text-sm font-semibold text-foreground">출퇴근</div>

        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-md border p-3">
                <div className="text-[11px] text-muted-foreground">출근</div>
                <div className="font-display tabular mt-1 text-xl font-semibold">{hhmm(att?.clockInAt)}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-[11px] text-muted-foreground">퇴근</div>
                <div className="font-display tabular mt-1 text-xl font-semibold">{hhmm(att?.clockOutAt)}</div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => punch("clock-in")}
                disabled={busy || workedIn}
                data-testid="button-clock-in"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                {workedIn ? "출근 완료" : "출근"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => punch("clock-out")}
                disabled={busy || !workedIn || workedOut}
                data-testid="button-clock-out"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                {workedOut ? "퇴근 완료" : "퇴근"}
              </Button>
            </div>

            <div className="mt-4 flex justify-between text-[11px] text-muted-foreground">
              <span>이번 주 {fmtMinutes(data?.weekMinutes ?? 0)}</span>
              <span>이번 달 {fmtMinutes(data?.monthMinutes ?? 0)}</span>
            </div>
          </>
        )}
      </Card>

      {/* 공지 */}
      <Card className="mt-4 p-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">공지사항</div>
          {(data?.unreadAnnouncements ?? 0) > 0 && (
            <Badge className="text-[11px]">읽지 않음 {data?.unreadAnnouncements}</Badge>
          )}
        </div>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : data?.latestAnnouncement ? (
          <button
            onClick={() => navigate("/staff/notices")}
            className="w-full rounded-md p-2 text-left hover-elevate"
            data-testid="link-latest-announcement"
          >
            <div className="truncate text-sm text-foreground">{data.latestAnnouncement.title}</div>
            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{data.latestAnnouncement.body}</div>
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">등록된 공지가 없습니다.</p>
        )}
      </Card>

      {/* 연차 */}
      {data?.leaveEnabled && (
        <button
          onClick={() => navigate("/staff/leave")}
          className="mt-4 flex w-full items-center justify-between rounded-md border px-4 py-3 text-left hover-elevate"
          data-testid="link-leave"
        >
          <span className="text-sm font-semibold text-foreground">연차</span>
          <span className="text-sm text-muted-foreground">
            잔여{" "}
            <span className="font-display font-semibold text-foreground">{data.leaveRemaining}일</span>
            {data.leavePending > 0 ? ` · 대기 ${data.leavePending}일` : ""}
          </span>
        </button>
      )}

      {/* 바로가기 */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Tile icon={Coffee} label="에스프레소 기록" onClick={() => navigate("/staff/espresso")} />
        <Tile icon={CakeSlice} label="디저트 생산일지" onClick={() => navigate("/staff/dessert")} />
        <Tile icon={CalendarDays} label="스케줄표" onClick={() => navigate("/staff/schedule")} />
        <Tile icon={Megaphone} label="공지사항" onClick={() => navigate("/staff/notices")} />
      </div>
    </StaffLayout>
  );
}

function Tile({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-md border p-4 text-left hover-elevate">
      <Icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
      <div className="mt-2 text-sm font-medium text-foreground">{label}</div>
    </button>
  );
}
