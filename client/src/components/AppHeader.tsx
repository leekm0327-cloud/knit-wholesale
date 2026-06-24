import { Link, useLocation } from "wouter";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useTheme } from "@/lib/theme";
import { ShoppingBag, Moon, Sun, LogOut, ClipboardList, User } from "lucide-react";

export function AppHeader() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const { theme, toggle } = useTheme();
  const [, navigate] = useLocation();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/catalog" data-testid="link-home" className="hover-elevate -m-1 rounded-md p-1">
          <Logo size={30} />
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label="다크모드 전환"
            data-testid="button-theme-toggle"
          >
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/orders")}
            data-testid="link-orders"
            className="hidden sm:inline-flex"
          >
            <ClipboardList className="mr-1.5 h-4 w-4" />
            주문내역
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/account")}
            aria-label="내 정보"
            data-testid="link-account"
          >
            <User className="h-4 w-4" />
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => navigate("/cart")}
            data-testid="button-cart"
            className="relative"
          >
            <ShoppingBag className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">장바구니</span>
            {count > 0 && (
              <span
                className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-accent-foreground"
                data-testid="badge-cart-count"
              >
                {count}
              </span>
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
            aria-label="로그아웃"
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {user && (
        <div className="border-t bg-secondary/40 px-4 py-1.5 text-center text-xs text-muted-foreground sm:px-6">
          <span className="font-medium text-foreground">{user.businessName}</span> · {user.managerName}님으로 로그인됨
        </div>
      )}
    </header>
  );
}
