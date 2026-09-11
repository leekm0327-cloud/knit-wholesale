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
  // 입금 등록 완료 상태
  const [savedPayment, setSavedPayment] = useState<{ id: number; amount: number } | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(defaultAmount && defaultAmount > 0 ? String(defaultAmount) : "");
      setPaidAt(todayStr());
      setMemo("");
      setSavedPayment(null);
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
      // 등록 완료 내용을 표시
      setSavedPayment({ id: payment.id, amount: payment.amount });
    } catch (e) {
      toast({ variant: "destructive", title: "등록 실패", description: errMsg(e) });
    } finally {
      setBusy(false);
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

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>
                닫기
              </Button>

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
