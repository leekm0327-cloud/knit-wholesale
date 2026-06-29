import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { StackedLogo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import { Loader2 } from "lucide-react";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // hash 라우터이므로 window.location.hash에서 token 파싱
  const [token, setToken] = useState("");
  useEffect(() => {
    const hash = window.location.hash; // e.g. "#/reset-password?token=abc"
    const queryStr = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    const params = new URLSearchParams(queryStr);
    setToken(params.get("token") ?? "");
  }, []);

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pwMismatch = passwordConfirm !== "" && password !== passwordConfirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (!token) {
      setError("유효하지 않은 링크입니다. 비밀번호 찾기를 다시 시도해 주세요.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", { token, password, passwordConfirm });
      toast({ title: "비밀번호 변경 완료", description: "새 비밀번호로 로그인해 주세요." });
      navigate("/login");
    } catch (err: any) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="mb-10 flex flex-col items-center text-center">
        <StackedLogo size={80} className="mb-6" />
        <p className="eyebrow mb-3">Wholesale</p>
        <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">
          새 비밀번호 설정
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          새로 사용할 비밀번호를 입력해 주세요.
        </p>
      </div>

      <Card className="w-full max-w-sm p-7 sm:p-8">
        {!token ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">유효하지 않은 링크입니다.</p>
            <Link href="/forgot-password" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
              비밀번호 찾기로 돌아가기
            </Link>
          </div>
        ) : (
          <>
            <h2 className="font-display mb-1 text-lg font-semibold text-foreground">비밀번호 재설정</h2>
            <p className="mb-6 text-xs text-muted-foreground">
              6자 이상의 새 비밀번호를 입력하세요.
            </p>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">새 비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="새 비밀번호 (6자 이상)"
                  required
                  minLength={6}
                  data-testid="input-reset-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="passwordConfirm">새 비밀번호 확인</Label>
                <Input
                  id="passwordConfirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="비밀번호 확인"
                  required
                  data-testid="input-reset-password-confirm"
                  className={pwMismatch ? "border-destructive focus-visible:ring-destructive" : ""}
                />
                {pwMismatch && (
                  <p className="text-[11px] text-destructive">비밀번호가 일치하지 않습니다.</p>
                )}
              </div>
              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={loading || pwMismatch}
                data-testid="button-reset-submit"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                비밀번호 변경
              </Button>
            </form>
            <div className="mt-6 border-t border-border pt-5 text-center text-xs text-muted-foreground">
              <Link href="/login" className="font-semibold text-foreground underline underline-offset-2" data-testid="link-back-to-login-reset">
                로그인으로 돌아가기
              </Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
