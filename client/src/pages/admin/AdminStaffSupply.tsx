import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import type { SupplyOrder, SupplyOrderSummary, SupplyVendor } from "@shared/schema";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

function today(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function monthStart(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
function won(n: number): string {
  return n.toLocaleString("ko-KR");
}
function fmtDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const dow = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  return `${iso} (${dow})`;
}

export default function AdminStaffSupply() {
  const { toast } = useToast();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [vName, setVName] = useState("");

  const key = `/api/admin/staff/supply-orders?from=${from}&to=${to}`;
  const { data, isLoading } = useQuery<{ rows: SupplyOrder[]; summary: SupplyOrderSummary }>({ queryKey: [key] });
  const { data: vendors } = useQuery<SupplyVendor[]>({ queryKey: ["/api/admin/staff/supply-vendors"] });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [key] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/staff/supply-vendors"] });
  };

  async function addVendor() {
    if (!vName.trim()) {
      toast({ variant: "destructive", title: "구입처 이름을 입력해 주세요." });
      return;
    }
    try {
      await apiRequest("POST", "/api/admin/staff/supply-vendors", { name: vName.trim() });
      setVName("");
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "등록 실패", description: errMsg(err) });
    }
  }

  async function moveVendor(id: number, dir: -1 | 1) {
    try {
      await apiRequest("POST", `/api/admin/staff/supply-vendors/${id}/move`, { dir });
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "이동 실패", description: errMsg(err) });
    }
  }

  async function delVendor(v: SupplyVendor) {
    if (!confirm(`'${v.name}' 을(를) 목록에서 지울까요?\n이미 남긴 기록은 그대로 있습니다.`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/staff/supply-vendors/${v.id}`);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  async function delOrder(r: SupplyOrder) {
    if (!confirm(`${r.orderDate} ${r.vendor || ""} 기록을 지울까요?`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/staff/supply-orders/${r.id}`);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  const summary = data?.summary;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Supply</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">발주 기록</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          직원들이 매장 소모품·식자재를 발주하고 남긴 기록입니다. 결제와 주문은 기존 방식대로 하고, 여기에는 기록만
          쌓입니다. 원두 발주(클라리멘토)는 매입·공장 메뉴에서 따로 관리합니다.
        </p>

        <Card className="mb-5 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">시작일</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">종료일</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
          </div>
        </Card>

        {/* 합계 */}
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <div className="text-xs text-muted-foreground">기간 합계</div>
            <div className="font-display tabular mt-1 text-2xl font-semibold text-foreground">
              {won(summary?.total ?? 0)}원
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{summary?.count ?? 0}건</div>
          </Card>
          <Card className="overflow-hidden">
            <div className="border-b px-4 py-2.5 text-xs font-semibold text-foreground">구입처별</div>
            <div className="divide-y">
              {(summary?.byVendor ?? []).slice(0, 6).map((v) => (
                <div key={v.vendor} className="flex items-center justify-between px-4 py-2 text-xs">
                  <span className="text-muted-foreground">
                    {v.vendor} <span className="text-[10px]">({v.count})</span>
                  </span>
                  <span className="font-display tabular font-semibold text-foreground">{won(v.amount)}</span>
                </div>
              ))}
              {(summary?.byVendor ?? []).length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">기록 없음</p>
              )}
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="border-b px-4 py-2.5 text-xs font-semibold text-foreground">담당자별</div>
            <div className="divide-y">
              {(summary?.byStaff ?? []).slice(0, 6).map((v) => (
                <div key={v.staffName} className="flex items-center justify-between px-4 py-2 text-xs">
                  <span className="text-muted-foreground">
                    {v.staffName} <span className="text-[10px]">({v.count})</span>
                  </span>
                  <span className="font-display tabular font-semibold text-foreground">{won(v.amount)}</span>
                </div>
              ))}
              {(summary?.byStaff ?? []).length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">기록 없음</p>
              )}
            </div>
          </Card>
        </div>

        {/* 구입처 목록 */}
        <Card className="mb-5 p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">구입처 목록</h2>
          <p className="mb-3 text-[11px] text-muted-foreground">
            여기에 저장해 두면 직원 앱에서 탭 한 번으로 고를 수 있습니다. 위에 있는 것부터 보입니다.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <Label className="text-xs text-muted-foreground">이름</Label>
              <Input
                value={vName}
                onChange={(e) => setVName(e.target.value)}
                placeholder="예: 우유 대리점, 식자재마트, 쿠팡"
                data-testid="input-vendor-name"
              />
            </div>
            <Button onClick={addVendor} data-testid="button-add-vendor">
              <Plus className="h-4 w-4" />
              추가
            </Button>
          </div>

          {(vendors ?? []).length > 0 && (
            <div className="mt-4 divide-y rounded-md border">
              {(vendors ?? []).map((v, i, arr) => (
                <div key={v.id} className="flex items-center gap-2 px-3 py-2" data-testid={`vendor-row-${v.id}`}>
                  <span className="text-sm text-foreground">{v.name}</span>
                  <div className="ml-auto flex items-center gap-0.5">
                    <Button size="sm" variant="ghost" onClick={() => moveVendor(v.id, -1)} disabled={i === 0} aria-label="위로">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => moveVendor(v.id, 1)}
                      disabled={i === arr.length - 1}
                      aria-label="아래로"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => delVendor(v)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 기록 */}
        <Card className="overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">기록</h2>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (data?.rows ?? []).length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">이 기간에 남겨진 기록이 없습니다.</p>
          ) : (
            <div className="divide-y">
              {data!.rows.map((r) => (
                <div key={r.id} className="p-4" data-testid={`admin-supply-${r.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground">{fmtDay(r.orderDate)}</span>
                        {r.vendor && <span className="text-xs text-muted-foreground">· {r.vendor}</span>}
                        <span className="text-xs text-muted-foreground">· {r.staffName}</span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">{r.body}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {r.amount > 0 && (
                        <span className="font-display tabular text-sm font-semibold text-foreground">
                          {won(r.amount)}원
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => delOrder(r)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
