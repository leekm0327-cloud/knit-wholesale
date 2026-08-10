import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { StaffLayout } from "@/components/StaffLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import { slotLabel, type StaffHome as StaffHomeData } from "@shared/schema";
import { LogIn, LogOut, Loader2, ChevronRight } from "lucide-react";

const WEEK_LABEL = ["월", "화", "수", "목", "금", "토", "일"];

/** 월요일(YYYY-MM-DD)로부터 7일치 날짜 */
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

function fmtToday(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${dow}요일`;
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
    <StaffLayout title="오늘" greeting>
      {/* 오늘 근무 — 화면에서 가장 중요한 하나 */}
      <button
        onClick={() => navigate("/staff/schedule")}
        className="s-dark flex w-full items-center justify-between text-left"
        data-testid="banner-today-shift"
      >
        <div>
          <div className="s-k">{fmtToday(data?.today ?? "")}</div>
          <div className="mt-0.5 text-[19px] font-semibold tracking-wide">
            {data?.shift ? (data.shift.position ? slotLabel(data.shift.position).toUpperCase() : "근무") : "휴무"}
          </div>
        </div>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: "#fff", color: "var(--s-ink)" }}
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </span>
      </button>

      {/* 출퇴근 */}
      <div className="s-sect">출퇴근</div>
      <div className="s-card">
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-xl" style={{ background: "var(--s-bg)" }} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="s-k">출근</div>
                <div className={`s-big ${workedIn ? "" : "off"}`}>{hhmm(att?.clockInAt)}</div>
              </div>
              <div>
                <div className="s-k">퇴근</div>
                <div className={`s-big ${workedOut ? "" : "off"}`}>{hhmm(att?.clockOutAt)}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                className="s-pill"
                onClick={() => punch("clock-in")}
                disabled={busy || workedIn}
                data-testid="button-clock-in"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" strokeWidth={1.8} />}
                {workedIn ? "출근 완료" : "출근"}
              </button>
              <button
                className="s-pill ghost"
                onClick={() => punch("clock-out")}
                disabled={busy || !workedIn || workedOut}
                data-testid="button-clock-out"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" strokeWidth={1.8} />}
                {workedOut ? "퇴근 완료" : "퇴근"}
              </button>
            </div>

            <div className="mt-3 flex justify-between text-[11px]" style={{ color: "var(--s-muted)" }}>
              <span>이번 주 {fmtMinutes(data?.weekMinutes ?? 0)}</span>
              <span>이번 달 {fmtMinutes(data?.monthMinutes ?? 0)}</span>
            </div>
          </>
        )}
      </div>

      {/* 이번 주 */}
      {data && (
        <>
          <div className="s-sect flex items-baseline justify-between">
            <span>이번 주</span>
            <span className="text-[11px] font-normal" style={{ color: "var(--s-muted)" }}>
              근무 {data.weekShifts.length}일
            </span>
          </div>
          <button
            onClick={() => navigate("/staff/schedule")}
            className="s-card block w-full text-left"
            data-testid="link-week"
          >
            <div className="grid grid-cols-7 gap-1.5">
              {weekDays(data.weekFrom).map((d, i) => {
                const sh = data.weekShifts.find((w) => w.workDate === d);
                const isToday = d === data.today;
                return (
                  <div key={d} className="text-center">
                    <div className="text-[10px]" style={{ color: "var(--s-faint)" }}>
                      {WEEK_LABEL[i]}
                    </div>
                    <div
                      className="mt-1 flex h-[44px] flex-col items-center justify-center rounded-xl text-[9px] leading-tight"
                      style={
                        sh
                          ? isToday
                            ? { background: "var(--s-ink)", color: "#fff" }
                            : { background: "var(--s-accent-soft)", color: "var(--s-accent)" }
                          : { background: "var(--s-bg)", color: "var(--s-faint)" }
                      }
                    >
                      <b className="text-[12.5px] font-semibold">{Number(d.slice(8))}</b>
                      <span>{sh ? (sh.position ? slotLabel(sh.position) : "근무") : "휴무"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </button>
        </>
      )}

      {/* 오늘 인수인계 · 준비 작업 */}
      <div className="s-sect">오늘 할 일</div>
      <div className="s-card" style={{ padding: "4px 16px" }}>
        <button
          onClick={() => navigate("/staff/handover")}
          className="s-li w-full text-left"
          data-testid="link-handover"
        >
          <span className="s-a">인수인계</span>
          <span className="flex items-center gap-1.5">
            {(data?.handoverUnread ?? 0) > 0 ? (
              <span
                className="rounded-full px-2 py-[3px] text-[10.5px] font-medium"
                style={{ background: "var(--s-accent-soft)", color: "var(--s-accent)" }}
              >
                미확인 {data?.handoverUnread}
              </span>
            ) : (
              <span className="s-b">{(data?.handoverCount ?? 0) > 0 ? `${data?.handoverCount}건 확인함` : "없음"}</span>
            )}
            <ChevronRight className="h-4 w-4" style={{ color: "var(--s-faint)" }} />
          </span>
        </button>
        <button onClick={() => navigate("/staff/dessert")} className="s-li w-full text-left" data-testid="link-prep">
          <span className="s-a">준비 작업</span>
          <span className="flex items-center gap-1.5">
            {(data?.prepTodo ?? 0) > 0 ? (
              <span
                className="rounded-full px-2 py-[3px] text-[10.5px] font-medium"
                style={{ background: "var(--s-ink)", color: "#fff" }}
              >
                {data?.prepTodo}개 남음
              </span>
            ) : (
              <span className="s-b">{(data?.prepTotal ?? 0) > 0 ? "모두 완료" : "없음"}</span>
            )}
            <ChevronRight className="h-4 w-4" style={{ color: "var(--s-faint)" }} />
          </span>
        </button>
      </div>

      {/* 공지 */}
      <div className="s-sect flex items-baseline justify-between">
        <span>공지사항</span>
        {(data?.unreadAnnouncements ?? 0) > 0 && (
          <span className="text-[11px] font-normal" style={{ color: "var(--s-accent)" }}>
            읽지 않음 {data?.unreadAnnouncements}
          </span>
        )}
      </div>
      <button
        onClick={() => navigate("/staff/notices")}
        className="s-card block w-full text-left"
        data-testid="link-latest-announcement"
      >
        {data?.latestAnnouncement ? (
          <div className="s-li" style={{ padding: "2px 0" }}>
            <span className="s-a truncate">{data.latestAnnouncement.title}</span>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--s-faint)" }} />
          </div>
        ) : (
          <div className="py-0.5 text-[12px]" style={{ color: "var(--s-muted)" }}>
            등록된 공지가 없습니다.
          </div>
        )}
      </button>

      {/* 연차 */}
      {data?.leaveEnabled && (
        <>
          <div className="s-sect">연차</div>
          <button
            onClick={() => navigate("/staff/leave")}
            className="s-card block w-full text-left"
            data-testid="link-leave"
          >
            <div className="s-li" style={{ padding: "2px 0" }}>
              <span className="s-a">잔여</span>
              <span className="s-b">
                <b>{data.leaveRemaining}일</b>
                {data.leavePending > 0 ? ` · 대기 ${data.leavePending}일` : ""}
              </span>
            </div>
          </button>
        </>
      )}
    </StaffLayout>
  );
}
