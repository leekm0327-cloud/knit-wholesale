import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import type { PublicStaff } from "@shared/schema";
import {
  Loader2,
  Home,
  Coffee,
  CalendarDays,
  Megaphone,
  CakeSlice,
  CalendarOff,
  User,
  ArrowLeftRight,
  ShoppingCart,
  MoreHorizontal,
  ListChecks,
  X,
} from "lucide-react";

export function useStaff() {
  return useQuery<PublicStaff | null>({
    queryKey: ["/api/staff/me"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/staff/me");
        return await res.json();
      } catch {
        return null;
      }
    },
  });
}

// 매일 쓰는 네 개만 탭에 두고, 가끔 쓰는 것은 '더보기'로 뺀다.
// 8칸일 때는 한 칸이 44px 남짓이라 엄지로 누르면 옆 탭이 눌렸다.
const TABS = [
  { href: "/staff", label: "홈", icon: Home },
  { href: "/staff/handover", label: "인계", icon: ArrowLeftRight },
  { href: "/staff/espresso", label: "추출", icon: Coffee },
  { href: "/staff/dessert", label: "생산", icon: CakeSlice },
];

const MORE = [
  { href: "/staff/schedule", label: "스케줄", desc: "근무표 · 내 근무", icon: CalendarDays },
  { href: "/staff/dessert", label: "준비 작업", desc: "오늘 해야 할 준비", icon: ListChecks, flag: "knit.staffPrep" },
  { href: "/staff/supply", label: "발주 기록", desc: "소모품·식자재 구매 기록", icon: ShoppingCart },
  { href: "/staff/notices", label: "공지사항", desc: "대표님 공지", icon: Megaphone },
  { href: "/staff/leave", label: "연차", desc: "잔여 · 신청", icon: CalendarOff },
  { href: "/staff/me", label: "내 정보", desc: "연락처 · 비밀번호", icon: User },
];

const MORE_PATHS = new Set(MORE.map((m) => m.href.split("?")[0]));

export function StaffLayout({
  children,
  title,
  subtitle,
  greeting,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  /** 홈처럼 헤더에 인사말을 쓸 때 */
  greeting?: boolean;
}) {
  const { data: staff, isLoading } = useStaff();
  const [location, navigate] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !staff) navigate("/staff/login");
  }, [isLoading, staff, navigate]);

  if (isLoading || !staff) {
    return (
      <div className="staff-ui flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--s-muted)" }} />
      </div>
    );
  }

  return (
    <div className="staff-ui min-h-screen pb-24">
      <div className="mx-auto max-w-xl">
        {/* 헤더 — 선 없이 여백으로만 구분 */}
        <header className="flex items-start justify-between px-4 pb-1 pt-5">
          <div className="min-w-0">
            <div className="s-k">{greeting ? "안녕하세요" : subtitle || title}</div>
            <h1 className="mt-0.5 truncate text-[17px] font-semibold tracking-tight">
              {greeting ? `${staff.name} 님` : title}
            </h1>
          </div>
          <button
            onClick={() => navigate("/staff/me")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--s-surface)", boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}
            data-testid="button-open-profile"
            aria-label="내 정보"
          >
            <User className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </header>

        <main className="px-3.5 pb-4">{children}</main>
      </div>

      {/* 더보기 시트 */}
      {moreOpen && (
        <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} data-testid="sheet-staff-more">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,.35)" }} />
          <div
            className="absolute inset-x-0 bottom-0 mx-auto max-w-xl px-3.5 pb-24"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="s-card p-2">
              <div className="flex items-center justify-between px-3 pt-2 pb-1">
                <span className="s-k">더보기</span>
                <button onClick={() => setMoreOpen(false)} aria-label="닫기" className="p-1">
                  <X className="h-4 w-4" strokeWidth={1.6} />
                </button>
              </div>
              {MORE.map((m) => {
                const Icon = m.icon;
                const active = location === m.href.split("?")[0];
                return (
                  <button
                    key={m.label}
                    onClick={() => {
                      setMoreOpen(false);
                      if ((m as any).flag) { try { sessionStorage.setItem((m as any).flag, "1"); } catch {} }
                      navigate(m.href);
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left"
                    style={active ? { background: "var(--s-accent-soft)" } : undefined}
                    data-testid={`more-staff-${m.label}`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--s-bg)" }}>
                      <Icon className="h-4 w-4" strokeWidth={1.6} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold">{m.label}</span>
                      <span className="block text-[11.5px]" style={{ color: "var(--s-muted)" }}>{m.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 하단 알약 내비 — 4개 + 더보기 */}
      <nav className="s-navwrap">
        <div className="s-nav" style={{ gridTemplateColumns: `repeat(${TABS.length + 1}, 1fr)` }}>
          {TABS.map((t) => {
            const active = location === t.href;
            const Icon = t.icon;
            return (
              <button
                key={t.href}
                onClick={() => { setMoreOpen(false); navigate(t.href); }}
                className={active ? "on" : ""}
                data-testid={`tab-staff-${t.label}`}
              >
                <Icon className="h-4 w-4" strokeWidth={active ? 2 : 1.6} />
                {t.label}
              </button>
            );
          })}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={moreOpen || MORE_PATHS.has(location) ? "on" : ""}
            data-testid="tab-staff-more"
          >
            <MoreHorizontal className="h-4 w-4" strokeWidth={moreOpen ? 2 : 1.6} />
            더보기
          </button>
        </div>
      </nav>
    </div>
  );
}
