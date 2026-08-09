import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PublicStaff } from "@shared/schema";
import { Loader2, Home, Coffee, CalendarDays, Megaphone, CakeSlice, LogOut } from "lucide-react";

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
  { href: "/staff/espresso", label: "추출", icon: Coffee },
  { href: "/staff/dessert", label: "생산", icon: CakeSlice },
  { href: "/staff/schedule", label: "스케줄", icon: CalendarDays },
  { href: "/staff/notices", label: "공지", icon: Megaphone },
];

export function StaffLayout({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  const { data: staff, isLoading } = useStaff();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !staff) navigate("/staff/login");
  }, [isLoading, staff, navigate]);

  async function logout() {
    try {
      await apiRequest("POST", "/api/staff/logout");
    } catch {
      /* 무시 */
    }
    queryClient.setQueryData(["/api/staff/me"], null);
    queryClient.clear();
    navigate("/staff/login");
  }

  if (isLoading || !staff) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="min-w-0">
            <div className="eyebrow">Knit Staff</div>
            <div className="truncate text-sm font-semibold text-foreground">
              {staff.name}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">{staff.position}</span>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover-elevate"
            data-testid="button-staff-logout"
          >
            <LogOut className="h-3.5 w-3.5" />
            로그아웃
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">
        <h1 className="font-display text-lg font-semibold text-foreground">{title}</h1>
        {subtitle ? <p className="mb-4 mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : <div className="mb-4" />}
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background">
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {TABS.map((t) => {
            const active = location === t.href;
            const Icon = t.icon;
            return (
              <button
                key={t.href}
                onClick={() => navigate(t.href)}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
                data-testid={`tab-staff-${t.label}`}
              >
                <Icon className={`h-4.5 w-4.5 ${active ? "" : "opacity-70"}`} strokeWidth={active ? 2 : 1.5} />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
