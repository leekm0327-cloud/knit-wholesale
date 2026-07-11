import { useState } from "react";
import { useLocation, Link } from "wouter";
import { StackedLogo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import { Loader2, CheckCircle2, ArrowLeft } from "lucide-react";

export default function Inquiry() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [form, setForm] = useState({
    businessName: "",
    contactName: "",
    phone: "",
    email: "",
    region: "",
    volume: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.businessName.trim() || !form.phone.trim() || !form.message.trim()) {
      toast({ title: "필수 항목을 입력해 주세요.", description: "상호 · 연락처 · 문의 내용은 필수입니다.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiRequest("POST", "/api/inquiry", form);
      setDone(true);
    } catch (err: any) {
      toast({ title: "문의 접수 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <StackedLogo size={80} className="mb-5" />
        <p className="eyebrow mb-3">Wholesale Inquiry</p>
        <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">홀세일 납품 문의</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          니트커피 원두 도매 납품을 검토 중이신가요?<br />
          아래로 문의를 남겨 주시면 담당자가 확인 후 연락드립니다.
        </p>
      </div>

      {done ? (
        <Card className="flex w-full max-w-md flex-col items-center gap-4 p-10 text-center" data-testid="card-inquiry-done">
          <CheckCircle2 className="h-12 w-12 text-teal-600" />
          <h2 className="font-display text-xl font-semibold text-foreground">문의가 접수되었습니다</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            남겨주신 연락처로 담당자가 확인 후 연락드리겠습니다.<br />감사합니다.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => navigate("/login")} data-testid="button-go-login">로그인으로</Button>
            <Button variant="ghost" onClick={() => { setForm({ businessName: "", contactName: "", phone: "", email: "", region: "", volume: "", message: "" }); setDone(false); }}>
              추가 문의하기
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="w-full max-w-md p-7 sm:p-8">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">상호(업체명) <span className="text-teal-600">*</span></Label>
                <Input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder="예: 니트 로스터리" data-testid="input-inq-business" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">담당자명</Label>
                <Input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="예: 홍길동" data-testid="input-inq-contact" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">연락처 <span className="text-teal-600">*</span></Label>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="예: 010-1234-5678" data-testid="input-inq-phone" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">이메일</Label>
                <Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="예: hello@cafe.com" data-testid="input-inq-email" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">지역</Label>
                <Input value={form.region} onChange={(e) => set("region", e.target.value)} placeholder="예: 서울 성수동" data-testid="input-inq-region" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">예상 월 물량</Label>
                <Input value={form.volume} onChange={(e) => set("volume", e.target.value)} placeholder="예: 월 20kg 내외" data-testid="input-inq-volume" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">문의 내용 <span className="text-teal-600">*</span></Label>
                <Textarea value={form.message} onChange={(e) => set("message", e.target.value)} rows={5} placeholder="원하시는 원두, 납품 조건, 궁금한 점 등을 자유롭게 적어 주세요." data-testid="textarea-inq-message" />
              </div>
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={loading} data-testid="button-submit-inquiry">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              문의 보내기
            </Button>
          </form>
        </Card>
      )}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link href="/login" className="inline-flex items-center gap-1 hover:text-foreground" data-testid="link-back-login">
          <ArrowLeft className="h-3 w-3" /> 로그인으로 돌아가기
        </Link>
      </p>
    </div>
  );
}
