import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Phone, AlarmClock } from "lucide-react";

type Row = {
  customerId: number;
  businessName: string;
  managerName: string;
  phone: string;
  lastOrderDate: string;
  daysSince: number;
  orderCount: number;
  cycleDays: number;
  overdue: boolean;
  overdueRatio: number;
  recentDates: string[];
};

type Res = {
  today: string;
  since: string;
  days: number;
  beanOnly: boolean;
  totalCustomers: number;
  rows: Row[];
};

const PRESETS = [7, 14, 21, 30, 60];

export default function AdminCustomerActivity() {
  const [days, setDays] = useState(7);
  const [beanOnly, setBeanOnly] = useState(true);
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const key = `/api/admin/customer-activity?days=${days}&beanOnly=${beanOnly ? 1 : 0}`;
  const { data, isLoading } = useQuery<Res>({ queryKey: [key] });

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    if (!onlyOverdue) return all;
    return all.filter((r) => r.overdue).sort((a, b) => b.overdueRatio - a.overdueRatio);
  }, [data, onlyOverdue]);

  const overdueCount = (data?.rows ?? []).filter((r) => r.overdue).length;
  const neverCount = (data?.rows ?? []).filter((r) => r.daysSince < 0).length;

  function downloadCsv() {
    const head = ["상호명", "담당자", "연락처", "마지막 주문일", "경과일", "평소 주기(일)", "주기 초과", "주문 건수"];
    const body = rows.map((r) => [
      r.businessName,
      r.managerName,
      r.phone,
      r.lastOrderDate || "주문 이력 없음",
      r.daysSince < 0 ? "" : String(r.daysSince),
      r.cycleDays > 0 ? String(r.cycleDays) : "",
      r.overdue ? "O" : "",
      String(r.orderCount),
    ]);
    const csv = [head, ...body]
      .map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    // 엑셀에서 한글이 깨지지 않도록 BOM 을 붙인다
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `미주문거래처_${data?.today ?? ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Activity</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">미주문 거래처</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          정한 기간 동안 주문이 없는 거래처를 오래 비어 있는 순서로 보여드립니다. 평소 주문 주기를 계산해 그 주기를
          넘긴 곳은 따로 표시하고, 그것만 골라 볼 수도 있습니다. 취소된 주문과 무료 샘플, 매장 내부 계정은 빼고
          셉니다.
        </p>

        {/* 조건 */}
        <Card className="mb-5 p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">기간 (일)</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(Math.min(365, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-24"
                  data-testid="input-days"
                />
                <div className="flex gap-1">
                  {PRESETS.map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      variant={days === d ? "default" : "outline"}
                      onClick={() => setDays(d)}
                      data-testid={`preset-${d}`}
                    >
                      {d}일
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={beanOnly}
                onChange={(e) => setBeanOnly(e.target.checked)}
                data-testid="check-bean-only"
              />
              원두 주문만 계산
            </label>

            <label className="flex items-center gap-2 pb-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={onlyOverdue}
                onChange={(e) => setOnlyOverdue(e.target.checked)}
                data-testid="check-only-overdue"
              />
              주기 넘긴 곳만
            </label>

            <Button variant="outline" onClick={downloadCsv} className="ml-auto" data-testid="button-csv">
              <Download className="h-4 w-4" />
              CSV 내려받기
            </Button>
          </div>
          {data && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {data.since} 부터 {data.today} 까지 주문이 없는 거래처입니다. 전체 거래처 {data.totalCustomers}곳 중{" "}
              {data.rows.length}곳.
            </p>
          )}
        </Card>

        {/* 요약 */}
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <div className="text-xs text-muted-foreground">{days}일간 미주문</div>
            <div className="font-display tabular mt-1 text-2xl font-semibold text-foreground">
              {data?.rows.length ?? 0}곳
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-xs text-muted-foreground">평소 주기를 넘긴 곳</div>
            <div className="font-display tabular mt-1 text-2xl font-semibold text-foreground">{overdueCount}곳</div>
            <div className="mt-1 text-[11px] text-muted-foreground">주기의 1.5배를 넘긴 경우</div>
          </Card>
          <Card className="p-5">
            <div className="text-xs text-muted-foreground">주문 이력이 아예 없는 곳</div>
            <div className="font-display tabular mt-1 text-2xl font-semibold text-foreground">{neverCount}곳</div>
          </Card>
        </div>

        {/* 목록 */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {onlyOverdue ? "주기를 넘긴 거래처" : "미주문 거래처"}
            </h2>
            <span className="text-xs text-muted-foreground">{rows.length}곳</span>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-14 text-center text-sm text-muted-foreground">
              {onlyOverdue ? "주기를 넘긴 거래처가 없습니다." : "이 기간에 모든 거래처가 주문했습니다."}
            </p>
          ) : (
            <div className="divide-y">
              {rows.map((r) => (
                <div
                  key={r.customerId}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4"
                  data-testid={`row-inactive-${r.customerId}`}
                >
                  <div className="min-w-[180px] flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground">{r.businessName}</span>
                      {r.overdue && (
                        <Badge className="gap-1 text-[10px]">
                          <AlarmClock className="h-3 w-3" />
                          주기 초과 {r.overdueRatio}배
                        </Badge>
                      )}
                      {r.daysSince < 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          주문 이력 없음
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {r.managerName}
                      {r.phone ? ` · ${r.phone}` : ""}
                    </div>
                  </div>

                  <div className="w-32">
                    <div className="text-[11px] text-muted-foreground">마지막 주문</div>
                    <div className="font-display tabular text-sm text-foreground">
                      {r.lastOrderDate || "—"}
                    </div>
                  </div>

                  <div className="w-20">
                    <div className="text-[11px] text-muted-foreground">경과</div>
                    <div className="font-display tabular text-sm font-semibold text-foreground">
                      {r.daysSince < 0 ? "—" : `${r.daysSince}일`}
                    </div>
                  </div>

                  <div className="w-24">
                    <div className="text-[11px] text-muted-foreground">평소 주기</div>
                    <div className="font-display tabular text-sm text-foreground">
                      {r.cycleDays > 0 ? `${r.cycleDays}일` : "—"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {r.phone && (
                      <a href={`tel:${r.phone.replace(/[^0-9+]/g, "")}`}>
                        <Button size="sm" variant="outline" aria-label="전화">
                          <Phone className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    )}
                    <Link href={`/admin/chat/${r.customerId}`}>
                      <Button size="sm" variant="outline">
                        채팅
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          평소 주기는 최근 8번의 주문 간격을 모아 그 가운데 값으로 계산합니다. 간격이 두 번 이상 쌓여야 계산하므로,
          주문이 세 번 미만인 거래처는 주기가 빈칸으로 나옵니다. 한 달에 한 번 시키던 곳이 45일을 넘겼을 때처럼
          평소보다 확실히 늦어진 경우에만 주기 초과로 표시합니다.
        </p>
      </div>
    </AdminLayout>
  );
}
