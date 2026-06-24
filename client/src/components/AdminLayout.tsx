import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import type { Order } from "@shared/schema";
import {
  LayoutDashboard,
  Package,
  Building2,
  Moon,
  Sun,
  LogOut,
  Loader2,
} from "lucide-react";

const NAV = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/products", label: "상품 관리", icon: Package },
  { href: "/admin/customers", label: "거래처 관리", icon: Building2 },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const [location, navigate] = useLocation();
  const { theme, toggle } = useTheme();

  // 관리자 가드
  useEffect(() => {
    if (!isLoading && (!user || user.role !== "admin")) {
      navigate("/admin/login");
    }
  }, [isLoading, user, navigate]);

  // 미처리 주문 수 (배지)
  const { data: orders } = useQuery<Order[]>({
    queryKey: ["/api/admin/orders"],
    enabled: !!user && user.role === "admin",
    refetchInterval: 30000,
  });
  const pendingCount = (orders ?? []).filter((o) => o.status === "pending").length;

  if (isLoading || !user || user.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* 사이드바 */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="border-b p-5">
          <Logo size={28} />
          <div className="mt-3 inline-flex items-center rounded-md bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
            관리자
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((n) => {
            const active = location === n.href;
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                data-testid={`nav-${n.href}`}
                className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover-elevate"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4" />
                  {n.label}
                </span>
                {n.href === "/admin" && pendingCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-accent-foreground">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-1 border-t p-3">
          <div className="px-3 py-1 text-xs text-muted-foreground">{user.managerName} · {user.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={toggle} data-testid="button-theme-toggle">
            {theme === "light" ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
            {theme === "light" ? "다크모드" : "라이트모드"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={async () => {
              await logout();
              navigate("/admin/login");
            }}
            data-testid="button-logout"
          >
            <LogOut className="mr-2 h-4 w-4" />
            로그아웃
          </Button>
        </div>
      </aside>

      {/* 모바일 상단바 */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b bg-sidebar px-4 py-3 md:hidden">
          <Logo size={26} />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="테마">
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={async () => { await logout(); navigate("/admin/login"); }} aria-label="로그아웃">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/* 모바일 네비 */}
        <div className="flex gap-1 overflow-x-auto border-b bg-background px-3 py-2 md:hidden">
          {NAV.map((n) => {
            const active = location === n.href;
            return (
              <Link key={n.href} href={n.href} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover-elevate"}`}>
                {n.label}
                {n.href === "/admin" && pendingCount > 0 && ` (${pendingCount})`}
              </Link>
            );
          })}
        </div>

        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
