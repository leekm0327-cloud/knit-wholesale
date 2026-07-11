import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import { VISIT_PURPOSES, VISIT_PURPOSE_LABELS } from "@shared/schema";
import { Loader2, CheckCircle2, MapPin } from "lucide-react";

type Me = { businessName?: string; managerName?: string; phone?: string };

export default function VisitSetup() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: me } = useQuery<Me>({ queryKey: ["/api/auth/me"] });

  const [purpose, setPurpose] = useState<(typeof VISIT_PURPOSES)[number]>("open");
  const [date1, setDate1] = useState("");
  const [date2, setDate2] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest("POST", "/api/visit-request", {
        purpose,
        preferredDate1: date1,
        preferredDate2: date2,
        phone,
        message,
      });
      setDone(true);
    } catch (err: any) {
      toast({ title: "신청 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8">
        <div className="mb-6">
          <p className="eyebrow mb-2">Visit Setup</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">방문 커피 세팅 신청</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            파트너 매장의 커피 세팅, 니트커피가 직접 찾아가 잡아드립니다.<br />
            에스프레소·그라인더 세팅과 추출값 점검을 도와드려요.
          </p>
        </div>

        {/* 무료 + 원거리 안내 */}
        <Card className="mb-6 flex items-start gap-3 border-teal-600/20 bg-teal-50/40 p-4 dark:bg-teal-950/20">
          <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
          <p className="text-sm leading-relaxed text-foreground">
            첫 방문 세팅은 <span className="font-semibold">무료</span>로 도와드립니다.
            <br />
            <span className="text-muted-foreground">
              다만 거리가 많이 먼 지역은 방문 여건에 따라 소정의 출장비가 협의될 수 있습니다.
            </span>
          </p>
        </Card>

        {done ? (
          <Card className="flex flex-col items-center gap-4 p-10 text-center" data-testid="card-visit-done">
            <CheckCircle2 className="h-12 w-12 text-teal-600" />
            <h2 className="font-display text-xl font-semibold text-foreground">신청이 접수되었습니다</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              희망일을 참고해 담당자가 일정을 조율한 뒤 연락드리겠습니다.<br />감사합니다.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => navigate("/catalog")} data-testid="button-go-catalog">카탈로그로</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setPurpose("open"); setDate1(""); setDate2(""); setPhone(""); setMessage(""); setDone(false);
                }}
              >
                추가 신청하기
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6 sm:p-8">
            <form onSubmit={submit} className="space-y-6">
              {/* 신청 거래처 (읽기 전용 안내) */}
              {me?.businessName && (
                <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
                  <span className="text-muted-foreground">신청 거래처</span>{" "}
                  <span className="font-semibold text-foreground">{me.businessName}</span>
                  {me.managerName ? <span className="text-muted-foreground"> · {me.managerName}</span> : null}
                </div>
              )}

              {/* 방문 목적 */}
              <div className="space-y-2">
                <Label className="text-xs">방문 목적</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {VISIT_PURPOSES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPurpose(p)}
                      data-testid={`purpose-${p}`}
                      className={`rounded-md border px-3 py-2.5 text-sm transition-colors ${
                        purpose === p
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                      }`}
                    >
                      {VISIT_PURPOSE_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              {/* 방문 희망일 */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">방문 희망일 (1지망)</Label>
                  <Input type="date" value={date1} onChange={(e) => setDate1(e.target.value)} data-testid="input-visit-date1" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">방문 희망일 (2지망)</Label>
                  <Input type="date" value={date2} onChange={(e) => setDate2(e.target.value)} data-testid="input-visit-date2" />
                </div>
              </div>

              {/* 연락처 */}
              <div className="space-y-1.5">
                <Label className="text-xs">연락처</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={me?.phone ? `${me.phone} (계정 등록 번호)` : "예: 010-1234-5678"}
                  data-testid="input-visit-phone"
                />
                <p className="text-[11px] text-muted-foreground">비워두면 계정에 등록된 연락처로 연락드립니다.</p>
              </div>

              {/* 요청사항 */}
              <div className="space-y-1.5">
                <Label className="text-xs">요청사항</Label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  placeholder="현재 장비(머신·그라인더) 상황, 원하시는 세팅 방향, 특이사항 등을 자유롭게 적어 주세요."
                  data-testid="textarea-visit-message"
                />
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={loading} data-testid="button-submit-visit">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                방문 세팅 신청하기
              </Button>
            </form>
          </Card>
        )}
      </main>
    </div>
  );
}
