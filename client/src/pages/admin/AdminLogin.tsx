import { useState } from "react";
import { useLocation } from "wouter";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { Moon, Sun, Loader2, ShieldCheck } from "lucide-react";

export default function AdminLogin() {
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
      const res = await apiRequest("POST", "/api/auth/login", { email, password });
      const user = await res.json();
      if (user.role !== "admin") {
        await apiRequest("POST", "/api/auth/logout");
        toast({ title: "접근 거부", description: "관리자 계정이 아닙니다.", variant: "destructive" });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/admin");
    } catch (err: any) {
      toast({ title: "로그인 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <Button variant="ghost" size="icon" onClick={toggle} className="absolute right-4 top-4" aria-label="테마" data-testid="button-theme-toggle">
        {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </Button>

      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size={40} withWordmark={false} className="mb-4" />
        <div className="flex items-center gap-1.5 text-accent">
          <ShieldCheck className="h-4 w-4" />
          <span className="text-sm font-semibold">관리자 콘솔</span>
        </div>
      </div>

      <Card className="w-full max-w-sm p-6 sm:p-7">
        <h2 className="mb-5 text-base font-semibold text-foreground">관리자 로그인</h2>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">이메일</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@knitcoffee.kr" required data-testid="input-email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="input-password" />
          </div>
          <Button type="submit" className="w-full" disabled={loading} data-testid="button-admin-login">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            로그인
          </Button>
        </form>
      </Card>
    </div>
  );
}
