// 거래처가 로그인했을 때 화면 가운데 띄우는 안내.
// '오늘 하루 보지 않기'를 누르면 그날은 다시 뜨지 않고, 그냥 닫으면 다음 로그인 때 또 뜬다.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import type { PopupNotice } from "@shared/schema";
import { X, CalendarX2, CalendarCheck2, Truck } from "lucide-react";

const KEY = "knit.popupNotice.hidden.v1";

function today(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** { [공지id]: "YYYY-MM-DD" } — 그날 하루 숨긴 기록 */
function readHidden(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function hideToday(id: number) {
  try {
    const map = readHidden();
    map[String(id)] = today();
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* 저장에 실패해도 닫히기는 한다 */
  }
}

export function PopupNoticeLayer() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [closed, setClosed] = useState<number[]>([]);

  const { data } = useQuery<PopupNotice[]>({
    queryKey: ["/api/popup-notices/active"],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // 로그인 계정이 바뀌면 닫은 기록을 초기화한다
  useEffect(() => {
    setClosed([]);
  }, [user?.id]);

  // 관리 화면에서는 띄우지 않는다. 작업 중에 가리기만 하기 때문.
  // 대신 주문 사이트 쪽에서는 대표님도 거래처와 똑같이 보이게 해서 직접 확인할 수 있게 한다.
  if (!user || location.startsWith("/admin")) return null;

  const hidden = readHidden();
  const t = today();
  const list = (data ?? []).filter((n) => !closed.includes(n.id) && hidden[String(n.id)] !== t);
  const notice = list[0];
  if (!notice) return null;

  return (
    <PopupNoticeCard
      notice={notice}
      onClose={() => setClosed((c) => [...c, notice.id])}
      onHideToday={() => {
        hideToday(notice.id);
        setClosed((c) => [...c, notice.id]);
      }}
    />
  );
}

/** 실제로 보이는 모양 — 관리자 미리보기에서도 같은 것을 쓴다 */
export function PopupNoticeCard({
  notice,
  onClose,
  onHideToday,
}: {
  notice: Pick<PopupNotice, "id" | "title" | "body" | "orderUntil" | "orderResume" | "deliveryNote">;
  onClose: () => void;
  onHideToday?: () => void;
}) {
  const rows: { icon: typeof CalendarX2; label: string; value: string }[] = [
    { icon: CalendarX2, label: "주문 마감", value: notice.orderUntil },
    { icon: CalendarCheck2, label: "주문 재개", value: notice.orderResume },
    { icon: Truck, label: "배송 안내", value: notice.deliveryNote },
  ].filter((r) => r.value.trim().length > 0);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(20,20,18,.55)" }}
      role="dialog"
      aria-modal="true"
      aria-label={notice.title}
    >
      <div
        className="w-full max-w-sm overflow-hidden bg-background"
        style={{ borderRadius: 2, boxShadow: "0 18px 50px rgba(0,0,0,.28)" }}
        data-testid="popup-notice"
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 pb-3 pt-5">
          <h2 className="font-display text-base font-semibold leading-snug text-foreground">{notice.title}</h2>
          <button
            onClick={onClose}
            className="-mr-1 -mt-1 shrink-0 p-1 text-muted-foreground hover:text-foreground"
            aria-label="닫기"
            data-testid="button-close-popup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {rows.length > 0 && (
          <div className="divide-y border-b bg-muted/30">
            {rows.map((r) => {
              const Icon = r.icon;
              return (
                <div key={r.label} className="flex items-center gap-3 px-5 py-3">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                  <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{r.label}</span>
                  <span className="font-display text-sm font-semibold text-foreground">{r.value}</span>
                </div>
              );
            })}
          </div>
        )}

        {notice.body.trim() && (
          <p className="whitespace-pre-wrap px-5 py-4 text-[13px] leading-relaxed text-foreground">{notice.body}</p>
        )}

        <div className="flex border-t">
          <button
            onClick={onHideToday ?? onClose}
            className="flex-1 border-r py-3 text-[12px] text-muted-foreground hover:text-foreground"
            data-testid="button-hide-today"
          >
            오늘 하루 보지 않기
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-foreground py-3 text-[12px] font-medium text-background"
            data-testid="button-confirm-popup"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
