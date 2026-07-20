import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { X } from "lucide-react";

// 모바일 전용 하단 탭바. 데스크톱(sm↑)에서는 숨김.
// 핵심 4개(발주·주문내역·내정보·더보기)만 노출하고, 나머지는 '더보기' 시트로.
const MORE_ITEMS = [
  { href: "/sample", label: "샘플 신청" },
  { href: "/visit-setup", label: "커피 세팅" },
  { href: "/board", label: "게시판" },
  { href: "/news", label: "니트커피 소식" },
  { href: "/help", label: "도움말" },
];

const ACCENT = "#6b6a45";

export function MobileTabBar() {
  const [loc, navigate] = useLocation();
  const { logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = [
    { href: "/catalog", label: "발주" },
    { href: "/orders", label: "주문내역" },
    { href: "/account", label: "내정보" },
  ];
  const isActive = (href: string) =>
    href === "/catalog" ? loc === "/catalog" : loc.startsWith(href);

  return (
    <>
      {/* 더보기 바텀시트 */}
      {moreOpen && (
        <div className="fixed inset-0 z-[60] sm:hidden" role="dialog" aria-modal="true" data-testid="sheet-more">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-background pb-8 pt-2">
            <div className="mx-auto mb-1 mt-1 h-1 w-10 rounded-full bg-border" />
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-sm font-semibold text-foreground">더보기</span>
              <button onClick={() => setMoreOpen(false)} aria-label="닫기" className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col">
              {MORE_ITEMS.map((m) => (
                <button
                  key={m.href}
                  onClick={() => { setMoreOpen(false); navigate(m.href); }}
                  data-testid={`more-${m.href.slice(1)}`}
                  className="px-4 py-3.5 text-left text-sm text-foreground hover-elevate"
                >
                  {m.label}
                </button>
              ))}
              <button
                onClick={async () => { setMoreOpen(false); await logout(); navigate("/login"); }}
                data-testid="more-logout"
                className="mt-1 border-t border-border px-4 py-3.5 text-left text-sm text-muted-foreground hover-elevate"
              >
                로그아웃
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* 하단 탭바 (텍스트만) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-background/95 backdrop-blur sm:hidden"
        data-testid="mobile-tabbar"
      >
        {tabs.map((t) => (
          <button
            key={t.href}
            onClick={() => navigate(t.href)}
            data-testid={`tab-${t.href.slice(1)}`}
            className="flex-1 py-3 text-center text-xs font-semibold transition-colors"
            style={isActive(t.href) ? { color: ACCENT } : undefined}
          >
            <span className={isActive(t.href) ? "" : "text-muted-foreground"}>{t.label}</span>
          </button>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          data-testid="tab-more"
          className="flex-1 py-3 text-center text-xs font-semibold transition-colors"
          style={moreOpen ? { color: ACCENT } : undefined}
        >
          <span className={moreOpen ? "" : "text-muted-foreground"}>더보기</span>
        </button>
      </nav>
    </>
  );
}
