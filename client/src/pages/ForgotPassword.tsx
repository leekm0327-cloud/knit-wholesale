import { useState } from "react";
import { Link } from "wouter";
import { StackedLogo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import { Loader2 } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email });
      setSent(true);
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
          비밀번호 찾기
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          가입 시 등록한 이메일로 재설정 링크를 보내드립니다.
        </p>
      </div>

      <Card className="w-full max-w-sm p-7 sm:p-8">
        {sent ? (
          <div className="space-y-4 text-center">
            <div className="text-4xl">📬</div>
            <p className="text-sm font-medium text-foreground">메일을 보냈습니다.</p>
            <p className="text-xs text-muted-foreground">
              받은편지함을 확인하세요.<br />
              링크는 1시간 동안 유효합니다.
            </p>
            <Link href="/login" className="mt-2 block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
              로그인 페이지로 돌아가기
            </Link>
          </div>
        ) : (
          <>
            <h2 className="font-display mb-1 text-lg font-semibold text-foreground">이메일 입력</h2>
            <p className="mb-6 text-xs text-muted-foreground">
              가입 시 등록한 이메일 주소를 입력하세요.
            </p>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="business@example.com"
                  required
                  data-testid="input-forgot-email"
                />
              </div>
              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading} data-testid="button-forgot-submit">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                재설정 링크 발송
              </Button>
            </form>
            <div className="mt-6 border-t border-border pt-5 text-center text-xs text-muted-foreground">
              <Link href="/login" className="font-semibold text-foreground underline underline-offset-2" data-testid="link-back-to-login">
                로그인으로 돌아가기
              </Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
