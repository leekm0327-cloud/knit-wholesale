import { createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "./queryClient";
import type { PublicCustomer } from "@shared/schema";

interface AuthState {
  user: PublicCustomer | null;
  isLoading: boolean;
  refetch: () => void;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  user: null,
  isLoading: true,
  refetch: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery<PublicCustomer | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/auth/me");
        return await res.json();
      } catch {
        return null;
      }
    },
  });

  async function logout() {
    await apiRequest("POST", "/api/auth/logout");
    qc.setQueryData(["/api/auth/me"], null);
    qc.clear();
  }

  return (
    <AuthCtx.Provider value={{ user: data ?? null, isLoading, refetch, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
