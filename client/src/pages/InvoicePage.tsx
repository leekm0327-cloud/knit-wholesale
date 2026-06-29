import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { AppHeader } from "@/components/AppHeader";
import { Invoice } from "@/components/Invoice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Order } from "@shared/schema";
import { Printer, ArrowLeft, CheckCircle2 } from "lucide-react";

export default function InvoicePage() {
  const [, params] = useRoute("/invoice/:id");
  const [, navigate] = useLocation();
  const id = params?.id;

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ["/api/orders", id],
    enabled: !!id,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="no-print">
        <AppHeader />
      </div>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        {/* 액션 바 (인쇄 시 숨김) */}
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => navigate("/orders")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            data-testid="link-back-orders"
          >
            <ArrowLeft className="h-4 w-4" /> 주문내역
          </button>
          <Button onClick={() => window.print()} data-testid="button-print">
            <Printer className="mr-1.5 h-4 w-4" />
            PDF 다운로드 / 인쇄
          </Button>
        </div>

        {/* 주문 완료 안내 */}
        <div className="no-print mb-5 flex items-start gap-2.5 rounded-none border border-border bg-[#f5f5f5] p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
          <div className="text-sm">
            <p className="font-medium text-foreground">거래명세서가 발행되었습니다.</p>
            <p className="mt-0.5 text-muted-foreground">
              아래 입금 계좌로 송금해 주세요. 'PDF 다운로드 / 인쇄' 버튼으로 저장하거나 인쇄할 수 있습니다.
            </p>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-[700px] w-full rounded-none" />
        ) : !order ? (
          <div className="py-20 text-center text-muted-foreground">
            주문을 찾을 수 없습니다.
          </div>
        ) : (
          <div className="print-area">
            <Invoice order={order} />
          </div>
        )}
      </main>
    </div>
  );
}
