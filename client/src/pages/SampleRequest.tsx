import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errMsg, CATEGORY_LABEL } from "@/lib/format";
import type { Product } from "@shared/schema";
import { ArrowLeft, Loader2, Check, PackageCheck } from "lucide-react";

// B-2: 샘플 신청 페이지 — 원두 최대 2종, 각 1kg 고정, 무료. 승인+미사용 고객만 신청 가능.
const BEAN_CATEGORIES = ["blend", "decaf", "single"];
const MAX_TYPES = 2;

type Eligibility = { eligible: boolean; bizVerified: boolean; alreadyUsed: boolean; reason: string };

export default function SampleRequest() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  const { data: eligibility, isLoading: eligLoading } = useQuery<Eligibility>({
    queryKey: ["/api/sample/eligibility"],
  });
  const { data: products, isLoading: prodLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const beans = (products ?? []).filter(
    (p) => BEAN_CATEGORIES.includes(p.category) && p.available === 1,
  );

  function toggle(id: number) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_TYPES) {
        toast({ title: `샘플은 최대 ${MAX_TYPES}종까지 신청할 수 있습니다.`, variant: "destructive" });
        return prev;
      }
      return [...prev, id];
    });
  }

  async function submit() {
    if (selected.length === 0) {
      toast({ title: "샘플 받을 원두를 1종 이상 선택해 주세요.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/sample/request", { productIds: selected });
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/sample/eligibility"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/mine"] });
      toast({ title: "샘플 신청이 완료되었습니다.", description: "담당자가 확인 후 발송해 드립니다." });
      navigate(`/invoice/${result.id ?? result.orderId}`);
    } catch (err: any) {
      toast({ title: "샘플 신청 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const eligible = eligibility?.eligible === true;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-10">
        <button
          onClick={() => navigate("/catalog")}
          className="mb-5 flex items-center gap-1.5 font-ui text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
          data-testid="link-back-catalog"
        >
          <ArrowLeft className="h-4 w-4" /> 카탈로그
        </button>
        <p className="eyebrow mb-2">Sample</p>
        <h1 className="font-display mb-2 text-3xl font-medium tracking-tight text-foreground">샘플 신청</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          원두를 최대 {MAX_TYPES}종까지 각 1kg씩 무료로 받아보실 수 있습니다. 샘플은 승인된 거래처당 1회 제공됩니다.
        </p>

        {eligLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !eligible ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center" data-testid="card-not-eligible">
            <PackageCheck className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {eligibility?.reason || "현재 샘플을 신청할 수 없습니다."}
            </p>
            {!eligibility?.bizVerified && (
              <p className="text-xs text-muted-foreground">
                사업자등록번호 검증 후 승인되면 샘플 신청이 가능합니다.
              </p>
            )}
            <Button variant="outline" onClick={() => navigate("/catalog")} data-testid="button-go-catalog">
              카탈로그로 이동
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-3">
              {prodLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : beans.length === 0 ? (
                <Card className="py-12 text-center text-sm text-muted-foreground">
                  신청 가능한 원두가 없습니다.
                </Card>
              ) : (
                beans.map((p) => {
                  const on = selected.includes(p.id);
                  return (
                    <Card
                      key={p.id}
                      onClick={() => toggle(p.id)}
                      className={`flex cursor-pointer items-center gap-3 p-4 hover-elevate ${on ? "border-foreground" : ""}`}
                      data-testid={`row-sample-${p.id}`}
                    >
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border ${on ? "border-foreground bg-foreground text-background" : "border-border"}`}
                      >
                        {on && <Check className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{p.name}</span>
                          <span className="shrink-0 border border-border px-1.5 py-0.5 font-ui text-[10px] tracking-wide text-muted-foreground">
                            {CATEGORY_LABEL[p.category] ?? p.category}
                          </span>
                        </div>
                        {p.origin && <div className="mt-0.5 truncate text-xs text-muted-foreground">{p.origin}</div>}
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-muted-foreground">1kg · 무료</span>
                    </Card>
                  );
                })
              )}
            </div>

            <div>
              <Card className="sticky top-24 space-y-4 p-5">
                <h2 className="font-display text-lg font-semibold text-foreground">신청 요약</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>선택 원두</span>
                    <span className="tabular text-foreground" data-testid="text-sample-count">
                      {selected.length} / {MAX_TYPES}종
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                    <span className="text-foreground">합계</span>
                    <span className="font-ui tabular text-foreground">무료</span>
                  </div>
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={submit}
                  disabled={loading || selected.length === 0}
                  data-testid="button-submit-sample"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  샘플 신청하기
                </Button>
                <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                  신청 즉시 접수되며 담당자가 확인 후<br />발송해 드립니다.
                </p>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
