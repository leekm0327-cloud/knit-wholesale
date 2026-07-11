import { useState } from "react";
import { useLocation, Link } from "wouter";
import { StackedLogo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import { Loader2, ShieldCheck } from "lucide-react";

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/admin/login", { email, password });
      const user = await res.json();
      if (user.role !== "admin") {
        await apiRequest("POST", "/api/auth/logout");
        toast({ title: "접근 거부", description: "관리자 계정이 아닙니다.", variant: "destructive" });
        return;
      }
      queryClient.setQueryData(["/api/auth/me"], user);
      await queryClient.refetchQueries({ queryKey: ["/api/auth/me"] });
      navigate("/admin");
    } catch (err: any) {
      toast({ title: "로그인 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="mb-9 flex flex-col items-center text-center">
        <StackedLogo size={80} className="mb-5" />
        <div className="flex items-center gap-1.5 text-foreground">
          <ShieldCheck className="h-4 w-4" />
          <span className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em]">Admin console</span>
        </div>
      </div>

      <Card className="w-full max-w-sm p-7 sm:p-8">
        <h2 className="font-display mb-6 text-lg font-semibold text-foreground">관리자 로그인</h2>
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

      {/* #1 거래처 로그인 이동 링크 — 거래처 로그인의 "ADMIN LOGIN" 링크와 대칭 형태 */}
      <p className="mt-7 text-center font-ui text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        <Link href="/login" data-testid="link-customer-login" className="hover:text-foreground">
          니트커피 파트너스 로그인 →
        </Link>
      </p>
    </div>
  );
}
