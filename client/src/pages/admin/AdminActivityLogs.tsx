import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDateTime } from "@/lib/format";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ActivityLog {
  id: number;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string | null;
  metadata: string | null;
  createdAt: string;
}

interface LogsResponse {
  logs: ActivityLog[];
  total: number;
  page: number;
  pageSize: number;
}

const ACTION_OPTIONS = [
  { value: "", label: "전체 액션" },
  { value: "order.status_change", label: "주문 상태 변경" },
  { value: "customer.create", label: "거래처 생성" },
  { value: "customer.update", label: "거래처 수정" },
  { value: "customer.delete", label: "거래처 삭제" },
  { value: "product.create", label: "상품 생성" },
  { value: "product.update", label: "상품 수정" },
  { value: "product.delete", label: "상품 삭제" },
  { value: "manager.create", label: "매니저 생성" },
  { value: "manager.delete", label: "매니저 삭제" },
  { value: "backup.restore", label: "백업 복원" },
  { value: "board_post.create", label: "게시글 작성" },
  { value: "board_post.delete", label: "게시글 삭제" },
  { value: "customer_prices.update", label: "전용가 수정" },
];

const TARGET_TYPE_OPTIONS = [
  { value: "", label: "전체 대상" },
  { value: "order", label: "주문" },
  { value: "customer", label: "거래처" },
  { value: "product", label: "상품" },
  { value: "manager", label: "매니저" },
  { value: "board_post", label: "게시글" },
  { value: "system", label: "시스템" },
];

export default function AdminActivityLogs() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");

  const params = new URLSearchParams();
  params.set("page", String(page));
  if (actionFilter) params.set("action", actionFilter);
  if (actorFilter) params.set("actor", actorFilter);
  if (targetTypeFilter) params.set("targetType", targetTypeFilter);
  if (fromFilter) params.set("from", fromFilter);
  if (toFilter) params.set("to", toFilter);

  const { data, isLoading } = useQuery<LogsResponse>({
    queryKey: [`/api/admin/activity-logs?${params.toString()}`],
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function resetFilters() {
    setPage(1);
    setActionFilter("");
    setActorFilter("");
    setTargetTypeFilter("");
    setFromFilter("");
    setToFilter("");
  }

  function applyFilter() {
    setPage(1);
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="mb-6 border-b border-border pb-5">
          <p className="eyebrow mb-1">Audit trail</p>
          <h1 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            활동 로그
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            모든 변경 작업의 감사 기록입니다. 삭제 불가.
          </p>
        </div>

        {/* 필터 */}
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="h-9 rounded-none border border-border bg-background px-2 font-ui text-xs text-foreground"
            data-testid="filter-action"
          >
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <Input
            value={actorFilter}
            onChange={(e) => { setActorFilter(e.target.value); setPage(1); }}
            placeholder="액터 이메일"
            className="h-9 rounded-none text-xs"
            data-testid="filter-actor"
          />

          <select
            value={targetTypeFilter}
            onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1); }}
            className="h-9 rounded-none border border-border bg-background px-2 font-ui text-xs text-foreground"
            data-testid="filter-targetType"
          >
            {TARGET_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <Input
            type="date"
            value={fromFilter}
            onChange={(e) => { setFromFilter(e.target.value); setPage(1); }}
            className="h-9 rounded-none text-xs"
            data-testid="filter-from"
          />

          <Input
            type="date"
            value={toFilter}
            onChange={(e) => { setToFilter(e.target.value); setPage(1); }}
            className="h-9 rounded-none text-xs"
            data-testid="filter-to"
          />
        </div>

        {(actionFilter || actorFilter || targetTypeFilter || fromFilter || toFilter) && (
          <div className="mb-4">
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 text-xs">
              필터 초기화
            </Button>
          </div>
        )}

        {/* 테이블 */}
        <div className="rounded-none border border-border">
          <div className="hidden border-b border-border bg-muted/30 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:grid lg:grid-cols-[160px_1fr_100px_100px_140px]">
            <div>시간</div>
            <div>요약</div>
            <div>액터</div>
            <div>대상 유형</div>
            <div>액션</div>
          </div>

          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-none" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground" data-testid="empty-logs">
              활동 로그가 없습니다.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="px-4 py-3"
                  data-testid={`row-log-${log.id}`}
                >
                  <div className="flex flex-col gap-1 lg:grid lg:grid-cols-[160px_1fr_100px_100px_140px] lg:items-center">
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {fmtDateTime(log.createdAt)}
                    </div>
                    <div className="text-sm text-foreground">
                      {log.summary ?? log.action}
                      {log.targetId && (
                        <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                          #{log.targetId}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      <span title={log.actorEmail}>{log.actorEmail.split("@")[0]}</span>
                      <span className="ml-1 text-[10px] uppercase tracking-wide opacity-60">
                        {log.actorRole === "owner" ? "Owner" : "Mgr"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {log.targetType ?? "-"}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {log.action}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="mt-5 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              총 {total}개 · {page} / {totalPages} 페이지
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-ui text-xs font-semibold tabular text-foreground">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                data-testid="button-next-page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
