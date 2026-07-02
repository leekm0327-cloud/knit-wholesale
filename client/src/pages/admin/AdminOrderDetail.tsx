import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Invoice } from "@/components/Invoice";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OrderItemsEditor } from "@/components/OrderItemsEditor";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import { orderToKakaoText } from "@/lib/kakaoFormat";
import type { Order } from "@shared/schema";
import { ArrowLeft, Printer, Loader2, CheckCircle2, RotateCcw, Link2, ScrollText, Pencil, XCircle, Copy } from "lucide-react";

export default function AdminOrderDetail() {
  const [, params] = useRoute("/admin/orders/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = params?.id;

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ["/api/orders", id],
    enabled: !!id,
  });

  const [trackingNo, setTrackingNo] = useState("");
  const [adminMemo, setAdminMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingEcount, setSendingEcount] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // #4 카톡 복사 실패(클립보드 권한 없음) 시 수동 복사용 다이얼로그
  const [kakaoFallback, setKakaoFallback] = useState<string | null>(null);

  // #4 주문 내용을 카카오톡 발주 형식으로 클립보드에 복사
  async function copyKakao(o: Order, opts: { silent?: boolean } = {}) {
    const text = orderToKakaoText(o);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // 비보안 컨텍스트 폴백: 임시 textarea로 execCommand 복사 시도
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("execCommand 실패");
      }
      toast({ title: "카톡 발주 형식 복사 완료", description: "공장 카카오톡에 붙여넣기 하세요." });
    } catch {
      // 복사 실패 시 수동 복사용 다이얼로그 노출
      setKakaoFallback(text);
      if (!opts.silent) {
        toast({ title: "자동 복사 실패", description: "표시된 내용을 수동으로 복사해 주세요.", variant: "destructive" });
      }
    }
  }

  async function doCancel() {
    if (!id) return;
    setCancelling(true);
    try {
      await apiRequest("POST", `/api/admin/orders/${id}/cancel`, {});
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "주문이 취소되었습니다." });
      setConfirmCancel(false);
    } catch (err: any) {
      toast({ title: "취소 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  }

  async function sendToEcount() {
    if (!id) return;
    setSendingEcount(true);
    try {
      const res = await apiRequest("POST", `/api/admin/ecount/orders/${id}/send`, {});
      const data = await res.json();
      if (data.ok) {
        const stepMsg = (data.steps ?? [])
          .map((s: any) => `${s.step}: ${s.message}`)
          .join(" · ");
        toast({
          title: "ECOUNT 전송 성공",
          description: stepMsg || "거래처 + 판매전표 등록 완료",
        });
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

  useEffect(() => {
    if (order) {
      setTrackingNo(order.trackingNo);
      setAdminMemo(order.adminMemo);
    }
  }, [order]);

  async function patch(body: any, msg: string) {
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/admin/orders/${id}`, body);
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: msg });
    } catch (err: any) {
      toast({ title: "저장 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => navigate("/admin")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            data-testid="link-back-dashboard"
          >
            <ArrowLeft className="h-4 w-4" /> 대시보드
          </button>
          <Button variant="outline" onClick={() => window.print()} data-testid="button-print">
            <Printer className="mr-1.5 h-4 w-4" /> 거래명세서 인쇄/PDF
          </Button>
        </div>

        {isLoading || !order ? (
          <Skeleton className="h-[600px] w-full rounded-none" />
        ) : (
          <>
            {/* 관리 패널 */}
            <Card className="no-print mb-6 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">주문 관리</h2>
                <div className="flex items-center gap-2">
                  {(order as any).quickRequest === 1 && (
                    <Badge className="bg-amber-500 text-white hover:bg-amber-600" data-testid="badge-quick-request">
                      ⚡ 퀵 요청
                    </Badge>
                  )}
                  {order.status === "cancelled" ? (
                    <Badge className="bg-gray-200 text-gray-500 hover:bg-gray-200">취소됨</Badge>
                  ) : order.status === "done" ? (
                    <Badge variant="secondary">처리완료</Badge>
                  ) : (
                    <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">미처리</Badge>
                  )}
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <Button
                  variant={order.status === "pending" ? "default" : "outline"}
                  onClick={async () => {
                    const goingToDone = order.status === "pending";
                    await patch({ status: goingToDone ? "done" : "pending" }, "상태 변경됨");
                    // #4 처리완료로 변경 시 카카오톡 발주 형식 자동 복사
                    if (goingToDone) await copyKakao(order, { silent: true });
                  }}
                  disabled={saving || order.status === "cancelled"}
                  data-testid="button-toggle-status"
                >
                  {order.status === "pending" ? (
                    <><CheckCircle2 className="mr-1.5 h-4 w-4" /> 처리완료로 변경</>
                  ) : (
                    <><RotateCcw className="mr-1.5 h-4 w-4" /> 미처리로 되돌리기</>
                  )}
                </Button>
                {/* #4 카톡 발주 형식 수동 복사 */}
                <Button
                  variant="outline"
                  onClick={() => copyKakao(order)}
                  disabled={order.status === "cancelled"}
                  data-testid="button-copy-kakao"
                >
                  <Copy className="mr-1.5 h-4 w-4" /> 카톡 형식 복사
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditing((v) => !v)}
                  disabled={order.status === "cancelled"}
                  data-testid="button-edit-order"
                >
                  <Pencil className="mr-1.5 h-4 w-4" /> 주문 수정
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setConfirmCancel(true)}
                  disabled={order.status === "cancelled"}
                  data-testid="button-cancel-order"
                >
                  <XCircle className="mr-1.5 h-4 w-4" /> 주문 취소
                </Button>
              </div>

              {editing && (
                <div className="mb-4">
                  <OrderItemsEditor
                    order={order}
                    mode="admin"
                    onDone={() => setEditing(false)}
                    onCancel={() => setEditing(false)}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
                <div className="space-y-1.5">
                  <Label className="text-xs">송장번호</Label>
                  <Input value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} placeholder="예: 1234-5678-9012" data-testid="input-tracking" />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={() => patch({ trackingNo }, "송장번호 저장됨")} disabled={saving} data-testid="button-save-tracking">
                    송장 저장
                  </Button>
                </div>
              </div>

              {/* ECOUNT 전송 */}
              <div className="mt-4 rounded-md border border-dashed border-amber-300/60 bg-amber-50/30 p-3 dark:bg-amber-950/10">
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Link2 className="h-3.5 w-3.5" />
                  <span>ECOUNT 연동</span>
                </div>
                <p className="mb-2 text-xs text-muted-foreground">
                  이 주문을 ECOUNT에 거래처 + 판매전표로 전송합니다. 결과는 ECOUNT 로그에 기록됩니다.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={sendToEcount}
                    disabled={sendingEcount}
                    data-testid="button-send-ecount"
                  >
                    {sendingEcount ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Link2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    ECOUNT 전송
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate("/admin/ecount-logs")}
                    data-testid="button-view-ecount-logs"
                  >
                    <ScrollText className="mr-1.5 h-3.5 w-3.5" />
                    로그 보기
                  </Button>
                </div>
              </div>

              <div className="mt-4 space-y-1.5">
                <Label className="text-xs">관리자 메모</Label>
                <Textarea value={adminMemo} onChange={(e) => setAdminMemo(e.target.value)} rows={2} placeholder="내부 메모" data-testid="input-memo" />
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => patch({ adminMemo }, "메모 저장됨")} disabled={saving} data-testid="button-save-memo">
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    메모 저장
                  </Button>
                </div>
              </div>
            </Card>

            {/* 인보이스 동일 뷰 */}
            <div className={`print-area ${order.status === "cancelled" ? "opacity-60 grayscale" : ""}`}>
              <Invoice order={order} />
            </div>
          </>
        )}
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>주문을 취소하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              취소된 주문은 회색으로 표시되며 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-dialog-close">닫기</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doCancel();
              }}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-cancel"
            >
              {cancelling && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              주문 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* #4 클립보드 자동 복사 실패 시 수동 복사용 다이얼로그 */}
      <AlertDialog open={kakaoFallback !== null} onOpenChange={(o) => !o && setKakaoFallback(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>카톡 발주 형식</AlertDialogTitle>
            <AlertDialogDescription>
              자동 복사가 차단되었습니다. 아래 내용을 선택해 직접 복사해 주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            readOnly
            value={kakaoFallback ?? ""}
            rows={8}
            className="font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
            data-testid="textarea-kakao-fallback"
          />
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-kakao-fallback-close">닫기</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
