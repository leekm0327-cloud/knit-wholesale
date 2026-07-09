import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Wordmark } from "./Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
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
  BookUser,
  MessageCircle,
  Newspaper,
  ChevronDown,
  Menu,
} from "lucide-react";

// NAV 항목 타입
type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  ownerOnly?: boolean;
};

// NAV 그룹 타입 (label === null 이면 그룹 헤더 없이 상단 단독 항목)
type NavGroup = {
  label: string | null;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ href: "/admin", label: "대시보드", icon: LayoutDashboard }],
  },
  {
    label: "판매·주문",
    items: [
      { href: "/admin/orders", label: "주문 관리", icon: ShoppingCart },
      { href: "/admin/products", label: "상품 관리", icon: Package },
      { href: "/admin/customers", label: "거래처 관리", icon: Building2 },
      { href: "/admin/transactions", label: "거래내역서", icon: FileBarChart },
      { href: "/admin/balances", label: "채권 관리", icon: Wallet },
    ],
  },
  {
    label: "매입·공장",
    items: [
      { href: "/admin/suppliers", label: "공급처 관리", icon: Factory },
      { href: "/admin/purchases", label: "발주 관리", icon: PackagePlus },
      { href: "/admin/supplier-payments", label: "공장 지급", icon: Landmark },
      { href: "/admin/supplier-balances", label: "공장 채무", icon: Coins },
    ],
  },
  {
    label: "경영·재무",
    items: [
      { href: "/admin/dashboard-pnl", label: "경영 대시보드", icon: LineChart, ownerOnly: true },
      { href: "/admin/store-sales", label: "매장매출", icon: Store },
      { href: "/admin/expenses", label: "지출 입력", icon: Receipt },
      { href: "/admin/fixed-cost-items", label: "고정비 항목", icon: ListChecks, ownerOnly: true },
      { href: "/admin/personal-ledger", label: "개인 가계부", icon: BookUser, ownerOnly: true },
    ],
  },
  {
    label: "소식·게시판",
    items: [
      { href: "/admin/news", label: "소식", icon: Newspaper },
      { href: "/admin/board", label: "게시판", icon: MessageSquare },
    ],
  },
  {
    label: "설정·연동",
    items: [
      { href: "/admin/ecount", label: "ECOUNT 연동", icon: Link2 },
      { href: "/admin/ecount-logs", label: "ECOUNT 로그", icon: ScrollText },
      { href: "/admin/kakao", label: "카카오 알림", icon: MessageCircle, ownerOnly: true },
      { href: "/admin/managers", label: "매니저", icon: Users, ownerOnly: true },
      { href: "/admin/activity-logs", label: "활동 로그", icon: Activity },
      { href: "/admin/backup", label: "백업", icon: Archive, ownerOnly: true },
    ],
  },
];

// 현재 경로가 해당 메뉴에 속하는지 (하위 경로 포함). '/admin'(대시보드)만 정확히 일치할 때 활성.
function matchActive(location: string, href: string): boolean {
  if (href === "/admin") return location === "/admin";
  return location === href || location.startsWith(href + "/");
}

// 현재 경로가 속한 그룹의 label 반환
function findActiveGroupLabel(location: string): string | null {
  const g = NAV_GROUPS.find(
    (grp) => grp.label !== null && grp.items.some((i) => matchActive(location, i.href)),
  );
  return g?.label ?? null;
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // 열려 있는 아코디언 그룹 (기본: 현재 위치의 그룹, 없으면 판매·주문)
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const active = findActiveGroupLabel(location);
    s.add(active ?? "판매·주문");
    return s;
  });

  // 관리자 가드
  useEffect(() => {
    if (!isLoading && (!user || user.role !== "admin")) {
      navigate("/admin/login");
    }
  }, [isLoading, user, navigate]);

  // 경로가 바뀌면 해당 그룹을 자동으로 펼침 (기존에 펼친 그룹은 유지)
  useEffect(() => {
    const active = findActiveGroupLabel(location);
    if (active) {
      setOpenGroups((prev) => {
        if (prev.has(active)) return prev;
        const next = new Set(prev);
        next.add(active);
        return next;
      });
    }
  }, [location]);

  const isOwner = (user as any)?.adminRole === "owner";

  // 미처리 주문 수 (배지)
  const { data: orders } = useQuery<Order[]>({
    queryKey: ["/api/admin/orders"],
    enabled: !!user && user.role === "admin",
    refetchInterval: 30000,
  });
  const pendingCount = (orders ?? []).filter((o) => o.status === "pending").length;

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // 항목별 배지 수 (대시보드/주문 관리에 미처리 주문 수 표시)
  const badgeFor = (href: string) =>
    href === "/admin" || href === "/admin/orders" ? pendingCount : 0;

  // 단일 메뉴 링크 렌더
  const renderLink = (item: NavItem, indent: boolean, onNavigate?: () => void) => {
    const active = matchActive(location, item.href);
    const Icon = item.icon;
    const badge = badgeFor(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        data-testid={`nav-${item.href}`}
        onClick={onNavigate}
        className={`flex items-center justify-between rounded-none py-2 pr-3 font-ui text-sm font-semibold tracking-wide transition-colors ${
          indent ? "pl-6" : "pl-3"
        } ${
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground hover-elevate"
        }`}
      >
        <span className="flex items-center gap-2.5">
          <Icon className="h-4 w-4" />
          {item.label}
        </span>
        {badge > 0 && (
          <span
            className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-ui text-[11px] font-bold ${
              active
                ? "bg-sidebar-primary-foreground text-sidebar-primary"
                : "bg-foreground text-background"
            }`}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  };

  // 그룹/항목 전체 네비 렌더 (데스크톱·모바일 공용)
  const renderNav = (onNavigate?: () => void) =>
    NAV_GROUPS.map((group) => {
      const items = group.items.filter((i) => !i.ownerOnly || isOwner);
      if (items.length === 0) return null;

      // 그룹 헤더 없는 단독 항목 (대시보드)
      if (group.label === null) {
        return (
          <div key="__top" className="space-y-1">
            {items.map((i) => renderLink(i, false, onNavigate))}
          </div>
        );
      }

      const open = openGroups.has(group.label);
      // 그룹이 접혀 있을 때, 그룹 안의 미처리 주문 수 합계를 헤더에 표시
      const groupBadge = !open
        ? items.reduce((sum, i) => sum + badgeFor(i.href), 0)
        : 0;

      return (
        <div key={group.label} className="pt-1">
          <button
            type="button"
            onClick={() => toggleGroup(group.label as string)}
            aria-expanded={open}
            className="flex w-full items-center justify-between rounded-none px-3 py-2 font-ui text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground hover-elevate"
          >
            <span>{group.label}</span>
            <span className="flex items-center gap-2">
              {groupBadge > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 font-ui text-[10px] font-bold text-background">
                  {groupBadge}
                </span>
              )}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </span>
          </button>
          {open && (
            <div className="mt-1 space-y-1">
              {items.map((i) => renderLink(i, true, onNavigate))}
            </div>
          )}
        </div>
      );
    });

  if (isLoading || !user || user.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const roleBadge = (
    <div className="mt-3 inline-flex items-center border border-foreground px-2 py-0.5 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground">
      {isOwner ? "Owner" : "Manager"}
    </div>
  );

  const logoutButton = (
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
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* 데스크톱 사이드바 */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="border-b border-border p-5">
          <Wordmark size={26} />
          {roleBadge}
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">{renderNav()}</nav>
        <div className="space-y-1 border-t border-border p-3">
          <div className="px-3 py-1 font-ui text-xs text-muted-foreground">
            {user.managerName} · {user.email}
          </div>
          {logoutButton}
        </div>
      </aside>

      {/* 모바일 슬라이드 메뉴 (햄버거) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 sm:max-w-xs">
          <SheetTitle className="sr-only">관리자 메뉴</SheetTitle>
          <div className="flex h-full flex-col bg-sidebar">
            <div className="border-b border-border p-5">
              <Wordmark size={24} />
              {roleBadge}
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {renderNav(() => setMobileOpen(false))}
            </nav>
            <div className="space-y-1 border-t border-border p-3">
              <div className="px-3 py-1 font-ui text-xs text-muted-foreground">
                {user.managerName} · {user.email}
              </div>
              {logoutButton}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* 본문 영역 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 모바일 상단바 */}
        <div className="flex items-center justify-between border-b border-border bg-sidebar px-3 py-3 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            aria-label="메뉴 열기"
            className="relative"
          >
            <Menu className="h-5 w-5" />
            {pendingCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 font-ui text-[10px] font-bold text-background">
                {pendingCount}
              </span>
            )}
          </Button>
          <Wordmark size={22} />
          <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              await logout();
              navigate("/admin/login");
            }}
            aria-label="로그아웃"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>

        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
