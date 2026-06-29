import { Link, useLocation } from "wouter";
import { Wordmark } from "./Logo";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { ShoppingBag, LogOut, ClipboardList, User, BookOpen, MessageSquare } from "lucide-react";

export function AppHeader() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const [location, navigate] = useLocation();

  const navLink = (active: boolean) =>
    `font-ui text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
      active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto grid h-16 max-w-[1280px] grid-cols-3 items-center px-5 sm:px-10">
        {/* 좌측 메뉴 */}
        <nav className="flex items-center gap-5">
          <button
            onClick={() => navigate("/catalog")}
            data-testid="link-catalog"
            className={navLink(location === "/catalog")}
          >
            <span className="hidden sm:inline">Catalog</span>
            <BookOpen className="h-4 w-4 sm:hidden" />
          </button>
          <button
            onClick={() => navigate("/orders")}
            data-testid="link-orders"
            className={navLink(location === "/orders")}
          >
            <span className="hidden sm:inline">Orders</span>
            <ClipboardList className="h-4 w-4 sm:hidden" />
          </button>
          <button
            onClick={() => navigate("/board")}
            data-testid="link-board"
            className={navLink(location.startsWith("/board"))}
          >
            <span className="hidden sm:inline">Board</span>
            <MessageSquare className="h-4 w-4 sm:hidden" />
          </button>
        </nav>

        {/* 중앙 로고 */}
        <div className="flex justify-center">
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
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {user && (
        <div className="border-t border-border px-5 py-1.5 text-center font-ui text-[11px] tracking-wide text-muted-foreground sm:px-10">
          <span className="font-semibold text-foreground">{user.businessName}</span> · {user.managerName}님으로 로그인됨
        </div>
      )}
    </header>
  );
}
