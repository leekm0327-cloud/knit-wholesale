import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="eyebrow">Knit Staff</div>
          <h1 className="font-display mt-1 text-xl font-semibold text-foreground">직원 로그인</h1>
          <p className="mt-1 text-xs text-muted-foreground">니트커피 내부 관리 시스템</p>
        </div>
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label htmlFor="loginId" className="text-xs text-muted-foreground">아이디</Label>
              <Input
                id="loginId"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="지급받은 아이디"
                data-testid="input-staff-login-id"
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-xs text-muted-foreground">비밀번호</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                data-testid="input-staff-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy} data-testid="button-staff-login">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "로그인"}
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          아이디는 대표님께 문의해 주세요.
        </p>
      </div>
    </div>
  );
}
