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
import type { StaffHome as StaffHomeData } from "@shared/schema";
import { useState } from "react";
import { Coffee, CakeSlice, CalendarDays, Megaphone, LogIn, LogOut, Loader2 } from "lucide-react";

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
      {/* 출퇴근 */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">출퇴근</div>
          {data?.shift ? (
            <Badge variant="outline" className="text-[11px]">
              오늘 근무{data.shift.position ? ` · ${data.shift.position}` : ""}
            </Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground">등록된 스케줄 없음</span>
          )}
        </div>

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
