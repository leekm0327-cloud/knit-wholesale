import { Link, useLocation } from "wouter";
import { Wordmark } from "./Logo";
import { AccountSwitcher } from "./AccountSwitcher";
import { MobileTabBar } from "./MobileTabBar";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { ShoppingBag, LogOut, ClipboardList, User, BookOpen, MessageSquare, HelpCircle, Gift, Newspaper, Wrench } from "lucide-react";

export function AppHeader() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const [location, navigate] = useLocation();

  // 네비게이션 항목 (데스크톱 = 텍스트 / 모바일 = 아이콘, 로고 아래 별도 행)
  const navItems = [
    { href: "/catalog", label: "Catalog", icon: BookOpen, active: location === "/catalog" },
    { href: "/orders", label: "Orders", icon: ClipboardList, active: location === "/orders" },
    { href: "/sample", label: "Sample", icon: Gift, active: location === "/sample" },
    { href: "/visit-setup", label: "Setup", icon: Wrench, active: location.startsWith("/visit-setup") },
    { href: "/board", label: "Board", icon: MessageSquare, active: location.startsWith("/board") },
    { href: "/news", label: "News", icon: Newspaper, active: location.startsWith("/news") },
    { href: "/help", label: "Help", icon: HelpCircle, active: location.startsWith("/help") },
  ];

  const navLink = (active: boolean) =>
    `font-ui text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
      active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
    }`;

  const testId = (href: string) => `link-${href.slice(1)}`;

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
      {/* 상단 행: 모바일 = 로고 + 액션 / 데스크톱 = 메뉴 + 로고 + 액션 */}
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5 sm:grid sm:grid-cols-3 sm:px-10">
        {/* 데스크톱 좌측 메뉴 (모바일 숨김) */}
        <nav className="hidden items-center gap-5 sm:flex">
          {navItems.map((n) => (
            <button
              key={n.href}
              onClick={() => navigate(n.href)}
              data-testid={testId(n.href)}
              className={navLink(n.active)}
            >
              {n.label}
            </button>
          ))}
        </nav>

        {/* 로고: 모바일 = 좌측 / 데스크톱 = 중앙 */}
        <div className="flex justify-start sm:justify-center">
          <Link href="/catalog" data-testid="link-home" className="-m-1 p-1">
            <Wordmark size={28} />
          </Link>
        </div>

        {/* 우측 액션 */}
        <div className="flex items-center justify-end gap-3 sm:gap-4">
          <button
            onClick={() => navigate("/account")}
            aria-label="내 정보"
            data-testid="link-account"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <User className="h-[18px] w-[18px]" />
          </button>

          <button
            onClick={() => navigate("/cart")}
            data-testid="button-cart"
            aria-label="장바구니"
            className="relative text-muted-foreground transition-colors hover:text-foreground"
          >
            <ShoppingBag className="h-[18px] w-[18px]" />
            {count > 0 && (
              <span
                className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 font-ui text-[10px] font-bold text-background"
                data-testid="badge-cart-count"
              >
                {count}
              </span>
            )}
          </button>

          <button
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
            aria-label="로그아웃"
            data-testid="button-logout"
            className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {user && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-border px-5 py-1.5 text-center font-ui text-[11px] tracking-wide text-muted-foreground sm:px-10">
          <span>
            <span className="font-semibold text-foreground">{user.businessName}</span> · {user.managerName}님으로 로그인됨
          </span>
          {/* #3 멀티 계정 전환 (로그인 상태면 항상 표시, 계정 추가/전환 진입점) */}
          <AccountSwitcher />
        </div>
      )}
    </header>
    <MobileTabBar />
    </>
  );
}
