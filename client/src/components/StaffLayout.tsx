import { useEffect } from "react";
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

const TABS = [
  { href: "/staff", label: "홈", icon: Home },
  { href: "/staff/handover", label: "인계", icon: ArrowLeftRight },
  { href: "/staff/espresso", label: "추출", icon: Coffee },
  { href: "/staff/dessert", label: "생산", icon: CakeSlice },
  { href: "/staff/schedule", label: "스케줄", icon: CalendarDays },
  { href: "/staff/notices", label: "공지", icon: Megaphone },
  { href: "/staff/leave", label: "연차", icon: CalendarOff },
];

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

      {/* 하단 알약 내비 */}
      <nav className="s-navwrap">
        <div className="s-nav" style={{ gridTemplateColumns: `repeat(${TABS.length}, 1fr)` }}>
          {TABS.map((t) => {
            const active = location === t.href;
            const Icon = t.icon;
            return (
              <button
                key={t.href}
                onClick={() => navigate(t.href)}
                className={active ? "on" : ""}
                data-testid={`tab-staff-${t.label}`}
              >
                <Icon className="h-4 w-4" strokeWidth={active ? 2 : 1.6} />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
