import { createContext, useContext, useEffect } from "react";

// 다크모드 제거 — 본 브랜드 사이트와 동일하게 라이트(흑백)로 통일.
// 기존 호출부 호환을 위해 동일한 인터페이스를 유지하되 항상 light, toggle은 no-op.
type Theme = "light";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  return (
    <ThemeCtx.Provider value={{ theme: "light", toggle: () => {} }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
