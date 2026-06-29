import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errMsg, won, fmtDate } from "@/lib/format";
import type { CustomerBalance, LedgerRow } from "@shared/schema";
import { Loader2, Wallet } from "lucide-react";

const METHOD_LABEL: Record<string, string> = {
  transfer: "계좌이체",
  cash: "현금",
  card: "카드",
  other: "기타",
};

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
      });
  }, [user]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: ledger } = useQuery<{ balance: CustomerBalance; rows: LedgerRow[] }>({
    queryKey: ["/api/account/ledger"],
    enabled: !!user,
    refetchInterval: 60000,
  });

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
        <div className="eyebrow">Account</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">내 정보</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          주문 시 거래명세서에 자동으로 반영됩니다. 이메일({user?.email})은 변경할 수 없습니다.
        </p>

        {ledger?.balance && (
          <Card className="mb-6 overflow-hidden">
            <div className="flex items-center justify-between border-b p-5">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">거래 잔액</h2>
              </div>
              <span className={`font-display tabular text-lg font-semibold ${ledger.balance.balance > 0 ? "text-destructive" : "text-foreground"}`}>
                {won(ledger.balance.balance)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 p-5 text-center">
              <div>
                <div className="text-[11px] text-muted-foreground">누적 청구</div>
                <div className="mt-0.5 font-display tabular text-sm font-semibold text-foreground">{won(ledger.balance.totalOrdered)}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">누적 입금</div>
                <div className="mt-0.5 font-display tabular text-sm font-semibold text-foreground">{won(ledger.balance.totalPaid)}</div>
              </div>
            </div>
            {ledger.rows.length > 0 && (
              <div className="border-t">
                <div className="px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">최근 거래</div>
                <div className="divide-y">
                  {ledger.rows.slice(0, 8).map((r) => (
                    <div key={`${r.kind}-${r.id}`} className="flex items-center justify-between px-5 py-2.5 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        {r.kind === "order" ? (
                          <Badge variant="outline" className="text-[10px]">주문</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">입금</Badge>
                        )}
                        <span className="text-muted-foreground">{fmtDate(r.date)}</span>
                        {r.kind === "order" && <span className="truncate text-foreground">{r.orderNo}</span>}
                        {r.kind === "payment" && <span className="truncate text-muted-foreground">{METHOD_LABEL[r.method] ?? r.method}</span>}
                      </div>
                      <div className="shrink-0 tabular text-foreground">
                        {r.kind === "order" ? won(r.debit) : <span className="text-muted-foreground">-{won(r.credit)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="border-t bg-muted/30 px-5 py-2.5 text-[11px] text-muted-foreground">
              입금은 관리자가 확인 후 반영됩니다.
            </div>
          </Card>
        )}

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

        <PasswordCard />
      </main>
    </div>
  );
}

function PasswordCard() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({ title: "비밀번호를 확인해 주세요", description: "새 비밀번호는 6자 이상이어야 합니다.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "비밀번호가 일치하지 않습니다", description: "새 비밀번호와 확인이 서로 다릅니다.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("POST", "/api/auth/change-password", { currentPassword, newPassword });
      toast({ title: "비밀번호가 변경되었습니다" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "변경 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-6 p-6">
      <h2 className="font-display mb-1 text-base font-semibold text-foreground">비밀번호 변경</h2>
      <p className="mb-5 text-xs text-muted-foreground break-keep">
        현재 비밀번호 확인 후 새 비밀번호로 변경됩니다.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="현재 비밀번호">
          <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" data-testid="input-current-password" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="새 비밀번호 (6자 이상)">
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" data-testid="input-new-password" />
          </Field>
          <Field label="새 비밀번호 확인">
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" data-testid="input-confirm-password" />
          </Field>
        </div>
        <Button type="submit" disabled={saving} data-testid="button-change-password">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          변경
        </Button>
      </form>
    </Card>
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
