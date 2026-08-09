import { useState } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import { Loader2 } from "lucide-react";

export default function StaffLogin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/staff/login", { loginId, password });
      const me = await res.json();
      queryClient.setQueryData(["/api/staff/me"], me);
      navigate("/staff");
    } catch (err) {
      toast({ variant: "destructive", title: "로그인 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="staff-ui flex min-h-screen flex-col justify-center px-5">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 px-1">
          <div className="s-k" style={{ letterSpacing: "0.08em" }}>
            KNIT STAFF
          </div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">직원 로그인</h1>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--s-muted)" }}>
            니트커피 내부 관리 시스템
          </p>
        </div>

        <form onSubmit={submit}>
          <div className="s-card">
            <label className="s-label" htmlFor="loginId">
              아이디
            </label>
            <input
              id="loginId"
              className="s-input"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="지급받은 아이디"
              data-testid="input-staff-login-id"
            />
            <div className="mt-3">
              <label className="s-label" htmlFor="password">
                비밀번호
              </label>
              <input
                id="password"
                className="s-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                data-testid="input-staff-password"
              />
            </div>
          </div>

          <button type="submit" className="s-pill wide mt-2.5" disabled={busy} data-testid="button-staff-login">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "로그인"}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px]" style={{ color: "var(--s-muted)" }}>
          아이디는 대표님께 문의해 주세요.
        </p>
      </div>
    </div>
  );
}
