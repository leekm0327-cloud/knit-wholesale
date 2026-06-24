import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTheme } from "@/lib/theme";
import { errMsg } from "@/lib/format";
import { Moon, Sun, Loader2 } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { theme, toggle } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/login", { email, password });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/catalog");
    } catch (err: any) {
      toast({ title: "로그인 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggle}
        className="absolute right-4 top-4"
        aria-label="다크모드 전환"
        data-testid="button-theme-toggle"
      >
        {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </Button>

      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size={44} withWordmark={false} className="mb-4" />
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Knit Coffee Wholesale
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          니트커피 도매 거래처 발주 시스템
        </p>
      </div>

      <Card className="w-full max-w-sm p-6 sm:p-7">
        <h2 className="mb-1 text-base font-semibold text-foreground">거래처 로그인</h2>
        <p className="mb-5 text-xs text-muted-foreground">
          등록된 거래처 이메일로 로그인해 주세요.
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
              data-testid="input-email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              required
              data-testid="input-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading} data-testid="button-login">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            로그인
          </Button>
        </form>

        <div className="mt-5 border-t pt-4 text-center text-sm text-muted-foreground">
          아직 거래처 등록 전이신가요?{" "}
          <Link href="/register" data-testid="link-register" className="font-medium text-accent hover:underline">거래처 가입</Link>
        </div>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        관리자이신가요?{" "}
        <Link href="/admin/login" data-testid="link-admin-login" className="underline hover:text-foreground">관리자 로그인</Link>
      </p>
    </div>
  );
}
