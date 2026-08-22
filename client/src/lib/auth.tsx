import { createContext, useContext, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, API_BASE } from "./queryClient";
import type { PublicCustomer } from "@shared/schema";

interface AuthState {
  user: PublicCustomer | null;
  isLoading: boolean;
  /**
   * 서버에 물어보지 못한 상태(네트워크 오류·서버 재시작·일시적 502 등).
   * 이때는 "로그인되지 않음"이 아니라 "아직 모름"이다. 화면 가드가 이 둘을 섞으면
   * 멀쩡한 세션인데도 로그인 화면으로 튕겨 나간다.
   */
  authUnknown: boolean;
  refetch: () => void;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  user: null,
  isLoading: true,
  authUnknown: false,
  refetch: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery<PublicCustomer | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
      // 401 만이 "정말 로그인되어 있지 않다"는 확답이다.
      if (res.status === 401) return null;
      // 그 밖의 실패(502, 서버 재시작 중, 네트워크 끊김)는 로그아웃이 아니다.
      // 여기서 null 을 돌려주면 멀쩡히 로그인된 사용자가 로그인 화면으로 쫓겨난다.
      if (!res.ok) throw new Error(`auth ${res.status}`);
      return (await res.json()) as PublicCustomer;
    },
    // 서버가 잠깐 흔들렸을 뿐일 수 있으니 몇 번 다시 물어본다.
    retry: (count) => count < 3,
    retryDelay: (i) => Math.min(1000 * 2 ** i, 4000),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // 휴대폰에서 화면을 껐다 켜거나 앱을 다시 열면, 잠들어 있던 화면이 그대로 살아난다.
  // 이때 한 번 다시 확인해 두면 끊긴 통신 때문에 로그아웃처럼 보이는 일이 없다.
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("online", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("online", wake);
    };
  }, [refetch]);

  async function logout() {
    await apiRequest("POST", "/api/auth/logout");
    qc.setQueryData(["/api/auth/me"], null);
    qc.clear();
    // 저장된 장바구니도 비운다 — 다른 계정으로 로그인했을 때 이전 사용자의 품목이 남지 않도록
    try { localStorage.removeItem("knit.cart.v1"); } catch { /* 무시 */ }
  }

  return (
    <AuthCtx.Provider
      value={{
        user: data ?? null,
        isLoading,
        // 재시도까지 다 실패했고 아직 한 번도 사용자 정보를 받지 못한 상태
        authUnknown: isError && data === undefined,
        refetch,
        logout,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
