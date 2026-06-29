import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg, won } from "@/lib/format";
import { Link2, Loader2, CheckCircle2 } from "lucide-react";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

interface Props {
  open: boolean;
  customerId: number | null;
  businessName: string;
  defaultAmount?: number;
  onClose: () => void;
}

export function PaymentDialog({ open, customerId, businessName, defaultAmount, onClose }: Props) {
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>("");
  const [paidAt, setPaidAt] = useState<string>(todayStr());
  const [memo, setMemo] = useState<string>("");
  const [busy, setBusy] = useState(false);
  // 입금 등록 후 ECOUNT 전송 단계 상태
  const [savedPayment, setSavedPayment] = useState<{ id: number; amount: number } | null>(null);
  const [sendingEcount, setSendingEcount] = useState(false);
  const [ecountSent, setEcountSent] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(defaultAmount && defaultAmount > 0 ? String(defaultAmount) : "");
      setPaidAt(todayStr());
      setMemo("");
      setSavedPayment(null);
      setSendingEcount(false);
      setEcountSent(false);
    }
  }, [open, defaultAmount]);

  async function submit() {
    if (!customerId) return;
    const amt = Number(amount.replace(/[^0-9]/g, ""));
    if (!amt || amt <= 0) {
      toast({ variant: "destructive", title: "입금액을 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/admin/payments", {
        customerId,
        amount: amt,
        paidAt,
        method: "transfer",
        memo,
      });
      const payment = await res.json();
      toast({ title: "입금이 등록되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers", customerId, "ledger"] });
      queryClient.invalidateQueries({ queryKey: ["/api/account/ledger"] });
      // 다이얼로그를 닫지 않고 ECOUNT 전송 단계로 이어감
      setSavedPayment({ id: payment.id, amount: payment.amount });
    } catch (e) {
      toast({ variant: "destructive", title: "등록 실패", description: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  async function sendToEcount() {
    if (!savedPayment) return;
    setSendingEcount(true);
    try {
      const res = await apiRequest("POST", `/api/admin/ecount/payments/${savedPayment.id}/send`, {});
      const data = await res.json();
      if (data.ok) {
        const stepMsg = (data.steps ?? [])
          .map((s: any) => `${s.step}: ${s.message}`)
          .join(" · ");
        toast({
          title: "ECOUNT 전송 성공",
          description: stepMsg || "회계자동분개 전표 등록 완료",
        });
        setEcountSent(true);
      } else {
        const failStep = (data.steps ?? []).find((s: any) => !s.ok);
        toast({
          variant: "destructive",
          title: "ECOUNT 전송 실패",
          description: failStep ? `${failStep.step}: ${failStep.message}` : data.message ?? "오류",
        });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "ECOUNT 전송 실패", description: errMsg(e) });
    } finally {
      setSendingEcount(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>입금 등록 — {businessName}</DialogTitle>
        </DialogHeader>

        {savedPayment ? (
          <div className="space-y-4">
            <div className="rounded-md border border-emerald-300/50 bg-emerald-50/40 p-3 text-sm dark:bg-emerald-950/20">
              <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                입금 등록 완료
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {businessName} · {won(savedPayment.amount)}
              </div>
            </div>
            <div className="rounded-md border border-dashed border-amber-300/60 bg-amber-50/30 p-3 dark:bg-amber-950/10">
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-foreground">
                <Link2 className="h-3.5 w-3.5" />
                ECOUNT 전송
              </div>
              <p className="text-xs text-muted-foreground">
                이 입금을 ECOUNT 회계자동분개 전표로 보냅니다. 결과는 "ECOUNT 로그" 페이지에서 확인할 수 있습니다.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>
                닫기
              </Button>
              {!ecountSent ? (
                <Button
                  onClick={sendToEcount}
                  disabled={sendingEcount}
                  data-testid="button-send-payment-ecount"
                >
                  {sendingEcount ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Link2 className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  ECOUNT 전송
                </Button>
              ) : (
                <Button disabled variant="secondary">
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  전송됨
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="amount" className="text-xs">
                입금액 (원)
              </Label>
              <Input
                id="amount"
                inputMode="numeric"
                value={amount ? Number(amount.replace(/[^0-9]/g, "")).toLocaleString("ko-KR") : ""}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
                data-testid="input-payment-amount"
              />
            </div>
            <div>
              <Label htmlFor="paidAt" className="text-xs">입금일</Label>
              <Input
                id="paidAt"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                data-testid="input-payment-date"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">결제 방식은 계좌이체로 고정되어 있습니다.</p>
            </div>
            <div>
              <Label htmlFor="memo" className="text-xs">메모 (선택)</Label>
              <Input
                id="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="비고"
                data-testid="input-payment-memo"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                취소
              </Button>
              <Button onClick={submit} disabled={busy} data-testid="button-submit-payment">
                {busy ? "등록 중…" : "등록"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
