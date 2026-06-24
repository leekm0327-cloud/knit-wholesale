import { useState, useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import { Loader2 } from "lucide-react";

export default function Account() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    managerName: "",
    phone: "",
    bizRegNo: "",
    taxEmail: "",
    defaultAddress: "",
    paymentMethod: "transfer",
  });

  useEffect(() => {
    if (user)
      setForm({
        businessName: user.businessName,
        managerName: user.managerName,
        phone: user.phone,
        bizRegNo: user.bizRegNo,
        taxEmail: user.taxEmail,
        defaultAddress: user.defaultAddress,
        paymentMethod: user.paymentMethod,
      });
  }, [user]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest("PATCH", "/api/auth/me", form);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "저장 완료", description: "거래처 정보가 업데이트되었습니다." });
    } catch (err: any) {
      toast({ title: "저장 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="font-display mb-1 text-xl font-semibold text-foreground">내 거래처 정보</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          주문 시 거래명세서에 자동으로 반영됩니다. 이메일({user?.email})은 변경할 수 없습니다.
        </p>
        <Card className="p-6">
          <form onSubmit={save} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="상호">
                <Input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} data-testid="input-businessName" />
              </Field>
              <Field label="담당자명">
                <Input value={form.managerName} onChange={(e) => set("managerName", e.target.value)} data-testid="input-managerName" />
              </Field>
              <Field label="연락처">
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} data-testid="input-phone" />
              </Field>
              <Field label="사업자등록번호">
                <Input value={form.bizRegNo} onChange={(e) => set("bizRegNo", e.target.value)} data-testid="input-bizRegNo" />
              </Field>
              <Field label="세금계산서 이메일">
                <Input type="email" value={form.taxEmail} onChange={(e) => set("taxEmail", e.target.value)} data-testid="input-taxEmail" />
              </Field>
              <Field label="결제방식">
                <Select value={form.paymentMethod} onValueChange={(v) => set("paymentMethod", v)}>
                  <SelectTrigger data-testid="select-paymentMethod"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transfer">계좌이체</SelectItem>
                    <SelectItem value="card">카드</SelectItem>
                    <SelectItem value="deferred">후지급</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="기본 배송지">
              <Input value={form.defaultAddress} onChange={(e) => set("defaultAddress", e.target.value)} data-testid="input-defaultAddress" />
            </Field>
            <Button type="submit" disabled={loading} data-testid="button-save-account">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              저장
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
