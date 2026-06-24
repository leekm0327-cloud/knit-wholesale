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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import type { Order } from "@shared/schema";
import { ArrowLeft, Printer, Loader2, CheckCircle2, RotateCcw } from "lucide-react";

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
          <Skeleton className="h-[600px] w-full rounded-xl" />
        ) : (
          <>
            {/* 관리 패널 */}
            <Card className="no-print mb-6 p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">주문 관리</h2>
                {order.status === "done" ? (
                  <Badge variant="secondary">처리완료</Badge>
                ) : (
                  <Badge className="bg-accent text-accent-foreground hover:bg-accent">미처리</Badge>
                )}
              </div>

              <div className="mb-4">
                <Button
                  variant={order.status === "pending" ? "default" : "outline"}
                  onClick={() => patch({ status: order.status === "pending" ? "done" : "pending" }, "상태 변경됨")}
                  disabled={saving}
                  data-testid="button-toggle-status"
                >
                  {order.status === "pending" ? (
                    <><CheckCircle2 className="mr-1.5 h-4 w-4" /> 처리완료로 변경</>
                  ) : (
                    <><RotateCcw className="mr-1.5 h-4 w-4" /> 미처리로 되돌리기</>
                  )}
                </Button>
              </div>

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
            <div className="print-area">
              <Invoice order={order} />
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
