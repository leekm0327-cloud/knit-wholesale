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
import { Loader2 } from "lucide-react";

export default function Register() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    managerName: "",
    phone: "",
    email: "",
    password: "",
    bizRegNo: "",
    taxEmail: "",
    defaultAddress: "",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/register", { ...form, paymentMethod: "transfer" });
      const user = await res.json();
      queryClient.setQueryData(["/api/auth/me"], user);
      await queryClient.refetchQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "거래처 등록 완료", description: "환영합니다! 이제 주문하실 수 있습니다." });
      navigate("/catalog");
    } catch (err: any) {
      toast({ title: "가입 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-10">
      <div className="mb-9 flex flex-col items-center text-center">
        <StackedLogo size={80} className="mb-5" />
        <p className="eyebrow mb-3">New partner</p>
        <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">
          거래처 가입
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          한 번만 입력하면 다음 주문부터 자동으로 채워집니다.
        </p>
      </div>

      <Card className="w-full max-w-lg p-7 sm:p-8">
        <div className="mb-5 rounded-md border border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground break-keep">
          로그인은 입력하신 <strong className="font-semibold text-foreground">상호명</strong>으로 진행됩니다. 이메일은 세금계산서 발송용입니다.
        </div>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="상호 *" helper="로그인 시 사용할 상호명입니다">
              <Input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} required placeholder="예: 니트커피" data-testid="input-businessName" />
            </Field>
            <Field label="담당자명 *">
              <Input value={form.managerName} onChange={(e) => set("managerName", e.target.value)} required placeholder="예: 김도원" data-testid="input-managerName" />
            </Field>
            <Field label="연락처 *">
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} required placeholder="010-0000-0000" data-testid="input-phone" />
            </Field>
            <Field label="사업자등록번호">
              <Input value={form.bizRegNo} onChange={(e) => set("bizRegNo", e.target.value)} placeholder="000-00-00000" data-testid="input-bizRegNo" />
            </Field>
          </div>

          <div className="border-t border-border pt-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="로그인 이메일 *">
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required placeholder="business@example.com" data-testid="input-email" />
              </Field>
              <Field label="비밀번호 * (6자 이상)">
                <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required placeholder="비밀번호" data-testid="input-password" />
              </Field>
              <Field label="세금계산서 이메일">
                <Input type="email" value={form.taxEmail} onChange={(e) => set("taxEmail", e.target.value)} placeholder="tax@example.com" data-testid="input-taxEmail" />
              </Field>
              <Field label="기본 배송지">
                <Input value={form.defaultAddress} onChange={(e) => set("defaultAddress", e.target.value)} placeholder="배송 받으실 주소" data-testid="input-defaultAddress" />
              </Field>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading} data-testid="button-register">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            가입하고 시작하기
          </Button>
        </form>

        <div className="mt-6 border-t border-border pt-5 text-center text-xs text-muted-foreground">
          이미 거래처이신가요?{" "}
          <Link href="/login" data-testid="link-login" className="font-semibold text-foreground underline underline-offset-2">로그인</Link>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children, helper }: { label: string; children: React.ReactNode; helper?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {helper && <p className="text-[11px] leading-snug text-muted-foreground break-keep">{helper}</p>}
    </div>
  );
}
