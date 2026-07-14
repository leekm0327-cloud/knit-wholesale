import { useState } from "react";
import { useLocation, Link } from "wouter";
import { StackedLogo } from "@/components/Logo";
import { KakaoChannelButton } from "@/components/KakaoChannelButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import { saveAccount } from "@/lib/savedAccounts";
import { Loader2 } from "lucide-react";

export default function Login() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [businessName, setBusinessName] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true); // #45: 기본 체크(ON)
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/login", { businessName, password, rememberMe });
      const user = await res.json();
      // staleTime:Infinity 환경에서 invalidate만으로는 refetch가 보장되지 않음.
      // 응답으로 받은 user를 캐시에 직접 박아넣어 ProtectedRoute가 즉시 통과되도록 함.
      queryClient.setQueryData(["/api/auth/me"], user);
      await queryClient.refetchQueries({ queryKey: ["/api/auth/me"] });
      // #3 멀티 계정: 로그인 성공 시 이 기기에 계정 저장 (거래처 계정만, 관리자 제외)
      if (user && user.role !== "admin") {
        saveAccount({ businessName, password, managerName: user.managerName });
      }
      navigate("/catalog");
    } catch (err: any) {
      toast({ title: "로그인 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="mb-10 flex flex-col items-center text-center">
        <StackedLogo size={88} className="mb-6" />
        <p className="eyebrow mb-3">Wholesale</p>
        <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">
          니트커피 파트너스
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          니트커피 도매 거래처 전용 주문 공간
        </p>
      </div>

      <Card className="w-full max-w-sm p-7 sm:p-8">
        <h2 className="font-display mb-1 text-lg font-semibold text-foreground">거래처 로그인</h2>
        {/* #27: 안내문 추가 */}
        <p className="mb-6 text-xs text-muted-foreground">
          가입 시 입력한 상호명으로 로그인하세요 (이메일 아님)
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            {/* #27: 입력란 라벨 강화 */}
            <Label htmlFor="businessName">상호명 (로그인 ID)</Label>
            <Input
              id="businessName"
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="예: 니트커피"
              required
              data-testid="input-business-name"
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
            {/* #27: 비밀번호 찾기 링크 */}
            <div className="text-right">
              <Link href="/forgot-password" className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground" data-testid="link-forgot-password">
                비밀번호를 잊으셨나요?
              </Link>
            </div>
          </div>
          {/* #45: 로그인 상태 유지 (기본 체크) */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="rememberMe"
              checked={rememberMe}
              onCheckedChange={(v) => setRememberMe(v === true)}
              data-testid="checkbox-remember-me"
            />
            <Label
              htmlFor="rememberMe"
              className="cursor-pointer text-sm font-normal text-muted-foreground"
            >
              로그인 상태 유지
            </Label>
          </div>
          <Button type="submit" className="w-full" disabled={loading} data-testid="button-login">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            로그인
          </Button>
        </form>

        <div className="mt-6 border-t border-border pt-5 text-center text-xs text-muted-foreground">
          아직 거래처 등록 전이신가요?{" "}
          <Link href="/register" data-testid="link-register" className="font-semibold text-foreground underline underline-offset-2">거래처 가입</Link>
        </div>
        <div className="mt-3 text-center text-xs text-muted-foreground">
          도매 납품을 검토 중이신가요?{" "}
          <Link href="/inquiry" data-testid="link-inquiry" className="font-semibold text-teal-700 underline underline-offset-2">홀세일 납품 문의</Link>
        </div>
        <div className="mt-2 text-center text-xs text-muted-foreground">
          <Link href="/espresso" data-testid="link-espresso" className="font-semibold text-foreground underline underline-offset-2">에스프레소 추출 로그 보기</Link>
        </div>
        {/* #3 멀티 계정 안내: 여러 지점을 운영하는 사장님을 위한 설명 */}
        <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground/80">
          여러 지점을 운영하시나요? 각 지점 상호로 한 번씩 로그인해 두면,
          이후 상단 ‘계정 전환’ 메뉴에서 로그아웃 없이 계정을 바꿀 수 있습니다.
        </p>
      </Card>

      <p className="mt-7 text-center font-ui text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        <Link href="/admin/login" data-testid="link-admin-login" className="hover:text-foreground">Admin login</Link>
      </p>

      <KakaoChannelButton />
    </div>
  );
}
