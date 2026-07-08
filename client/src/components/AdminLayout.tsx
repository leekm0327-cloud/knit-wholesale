import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Wordmark } from "./Logo";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { Order } from "@shared/schema";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Building2,
  LogOut,
  Loader2,
  Wallet,
  Link2,
  ScrollText,
  MessageSquare,
  Users,
  Archive,
  Activity,
  FileBarChart,
  Factory,
  PackagePlus,
  Landmark,
  Coins,
  LineChart,
  Store,
  Receipt,
  ListChecks,
} from "lucide-react";

// NAV 항목 타입
type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  ownerOnly?: boolean;
};

const NAV_BASE: NavItem[] = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/orders", label: "주문 관리", icon: ShoppingCart },
  { href: "/admin/products", label: "상품 관리", icon: Package },
  { href: "/admin/customers", label: "거래처 관리", icon: Building2 },
  { href: "/admin/balances", label: "채권 관리", icon: Wallet },
  { href: "/admin/transactions", label: "거래내역서", icon: FileBarChart },
  { href: "/admin/suppliers", label: "공급처 관리", icon: Factory },
  { href: "/admin/purchases", label: "발주 관리", icon: PackagePlus },
  { href: "/admin/supplier-payments", label: "공장 지급", icon: Landmark },
  { href: "/admin/supplier-balances", label: "공장 채무", icon: Coins },
  { href: "/admin/dashboard-pnl", label: "경영 대시보드", icon: LineChart, ownerOnly: true },
  { href: "/admin/store-sales", label: "매장매출", icon: Store },
  { href: "/admin/expenses", label: "지출 입력", icon: Receipt },
  { href: "/admin/fixed-cost-items", label: "고정비 항목", icon: ListChecks, ownerOnly: true },
  { href: "/admin/ecount", label: "ECOUNT 연동", icon: Link2 },
  { href: "/admin/ecount-logs", label: "ECOUNT 로그", icon: ScrollText },
  { href: "/admin/board", label: "게시판", icon: MessageSquare },
  { href: "/admin/managers", label: "매니저", icon: Users, ownerOnly: true },
  { href: "/admin/activity-logs", label: "활동 로그", icon: Activity },
  { href: "/admin/backup", label: "백업", icon: Archive, ownerOnly: true },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const [location, navigate] = useLocation();

  // 관리자 가드
  useEffect(() => {
    if (!isLoading && (!user || user.role !== "admin")) {
      navigate("/admin/login");
    }
  }, [isLoading, user, navigate]);

  const isOwner = (user as any)?.adminRole === "owner";

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

  // ownerOnly 메뉴는 manager에게 숨김
  const visibleNav = NAV_BASE.filter((n) => !n.ownerOnly || isOwner);

  return (
    <div className="flex min-h-screen bg-background">
      {/* 사이드바 */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="border-b border-border p-5">
          <Wordmark size={26} />
          <div className="mt-3 inline-flex items-center border border-foreground px-2 py-0.5 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">
            {isOwner ? "Owner" : "Manager"}
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {visibleNav.map((n) => {
            const active = location === n.href;
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                data-testid={`nav-${n.href}`}
                className={`flex items-center justify-between rounded-none px-3 py-2 font-ui text-sm font-semibold tracking-wide transition-colors ${
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
                  <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-ui text-[11px] font-bold ${active ? "bg-sidebar-primary-foreground text-sidebar-primary" : "bg-foreground text-background"}`}>
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-1 border-t border-border p-3">
          <div className="px-3 py-1 font-ui text-xs text-muted-foreground">{user.managerName} · {user.email}</div>
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
        <div className="flex items-center justify-between border-b border-border bg-sidebar px-4 py-3 md:hidden">
          <Wordmark size={24} />
          <Button variant="ghost" size="icon" onClick={async () => { await logout(); navigate("/admin/login"); }} aria-label="로그아웃">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        {/* 모바일 네비 */}
        <div className="flex gap-1 overflow-x-auto border-b border-border bg-background px-3 py-2 md:hidden">
          {visibleNav.map((n) => {
            const active = location === n.href;
            return (
              <Link key={n.href} href={n.href} className={`whitespace-nowrap rounded-none px-3 py-1.5 font-ui text-sm font-semibold tracking-wide ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover-elevate"}`}>
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
