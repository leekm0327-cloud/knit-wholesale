import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, errMsg } from "@/lib/format";
import { MessageCircle, Loader2, LogIn, Send } from "lucide-react";

type KakaoStatus = {
  configured: boolean;
  linked: boolean;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  updatedAt: number;
};

export default function AdminKakao() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isOwner = (user as any)?.adminRole === "owner";
  const [testing, setTesting] = useState(false);

  const { data: status, isLoading } = useQuery<KakaoStatus>({
    queryKey: ["/api/admin/kakao/status"],
    enabled: isOwner,
  });

  // 콜백 리다이렉트 결과(#/admin/kakao?linked=1 또는 ?error=...) 처리
  useEffect(() => {
    const hash = window.location.hash; // 예: #/admin/kakao?linked=1
    const qIndex = hash.indexOf("?");
    if (qIndex === -1) return;
    const params = new URLSearchParams(hash.slice(qIndex + 1));
    if (params.get("linked") === "1") {
      toast({ title: "카카오톡 연동 완료", description: "이제 알림이 사장님 카카오톡으로 발송됩니다." });
    } else if (params.get("error")) {
      toast({ variant: "destructive", title: "카카오 연동 실패", description: "다시 시도해 주세요." });
    }
    // 쿼리 제거 (히스토리 정리)
    window.history.replaceState(null, "", hash.slice(0, qIndex));
  }, [toast]);

  if (!isOwner) {
    return (
      <AdminLayout>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">사장님(Owner) 전용 메뉴입니다.</p>
        </div>
      </AdminLayout>
    );
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await apiRequest("POST", "/api/admin/kakao/test", {});
      const data = await res.json();
      if (data.ok) {
        toast({ title: "테스트 발송 완료", description: "카카오톡을 확인해 주세요." });
      } else {
        toast({ variant: "destructive", title: "테스트 발송 실패", description: "연동 상태와 환경변수를 확인해 주세요." });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "테스트 발송 실패", description: errMsg(e) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Kakao</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">카카오톡 알림 연동</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          샘플/승인, 새 도매 주문 등 주요 이벤트를 사장님 본인 카카오톡("나에게 보내기")으로 받습니다.
        </p>

        {isLoading || !status ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <Card className="p-5">
            {/* 상태 표시 */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">연동 상태</span>
              {!status.configured ? (
                <Badge variant="secondary">환경변수 미설정</Badge>
              ) : status.linked ? (
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600" data-testid="badge-kakao-linked">연동됨</Badge>
              ) : (
                <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive" data-testid="badge-kakao-unlinked">미연동</Badge>
              )}
            </div>

            {!status.configured ? (
              <p className="mb-4 text-sm text-muted-foreground">
                서버에 카카오 환경변수(KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET, KAKAO_REDIRECT_URI)가 설정되어야 연동할 수 있습니다.
              </p>
            ) : (
              <div className="mb-4 space-y-1.5 text-sm text-muted-foreground">
                {status.linked && (
                  <>
                    <p>access token 만료: <span className="text-foreground">{status.accessTokenExpiresAt ? fmtDateTime(status.accessTokenExpiresAt) : "-"}</span></p>
                    <p>refresh token 만료: <span className="text-foreground">{status.refreshTokenExpiresAt ? fmtDateTime(status.refreshTokenExpiresAt) : "-"}</span></p>
                    <p>마지막 갱신: <span className="text-foreground">{status.updatedAt ? fmtDateTime(status.updatedAt) : "-"}</span></p>
                  </>
                )}
                {!status.linked && (
                  <p>아직 연동되지 않았습니다. 아래 버튼으로 카카오 로그인 후 알림을 활성화하세요.</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => { window.location.href = "/oauth/kakao/login"; }}
                disabled={!status.configured}
                data-testid="button-kakao-login"
              >
                <LogIn className="mr-1.5 h-4 w-4" />
                {status.linked ? "카카오 재연동" : "카카오 로그인하여 연동"}
              </Button>
              <Button
                variant="outline"
                onClick={sendTest}
                disabled={!status.linked || testing}
                data-testid="button-kakao-test"
              >
                {testing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                테스트 발송
              </Button>
            </div>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
