import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errMsg, fmtDate } from "@/lib/format";
import { VISIT_PURPOSE_LABELS, VISIT_STATUSES } from "@shared/schema";
import { CalendarCheck } from "lucide-react";

type VisitRequest = {
  id: number;
  customerId: number;
  businessName: string;
  contactName: string;
  phone: string;
  purpose: string;
  preferredDate1: string;
  preferredDate2: string;
  message: string;
  status: string;
  confirmedDate: string;
  adminMemo: string;
  createdAt: number;
};

const STATUS_LABELS: Record<string, string> = {
  new: "신규",
  coordinating: "일정 조율",
  confirmed: "방문 확정",
  done: "완료",
};

function Row({ label, value }: { label: string; value?: string }) {
  if (!value || !value.trim()) return null;
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-24 shrink-0 font-ui text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-foreground">{value}</span>
    </div>
  );
}

export default function AdminVisitSetups() {
  const { toast } = useToast();
  const { data: list, isLoading } = useQuery<VisitRequest[]>({
    queryKey: ["/api/admin/visit-requests"],
    refetchInterval: 60000,
  });
  // 편집 중 로컬 상태 (id별)
  const [edits, setEdits] = useState<Record<number, { status?: string; confirmedDate?: string; adminMemo?: string }>>({});
  const [saving, setSaving] = useState<number | null>(null);

  function patchLocal(id: number, key: string, value: string) {
    setEdits((m) => ({ ...m, [id]: { ...m[id], [key]: value } }));
  }

  async function save(it: VisitRequest) {
    const e = edits[it.id] ?? {};
    setSaving(it.id);
    try {
      await apiRequest("PATCH", `/api/admin/visit-requests/${it.id}`, {
        status: e.status ?? it.status,
        confirmedDate: e.confirmedDate ?? it.confirmedDate,
        adminMemo: e.adminMemo ?? it.adminMemo,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/visit-requests"] });
      setEdits((m) => { const n = { ...m }; delete n[it.id]; return n; });
      toast({ title: "저장됨" });
    } catch (err: any) {
      toast({ title: "저장 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setSaving(null);
    }
  }

  const items = list ?? [];
  const newCount = items.filter((i) => i.status === "new").length;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">방문 세팅</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            방문 커피 세팅 신청 내역입니다. {newCount > 0 && <span className="font-semibold text-foreground">· 신규 {newCount}건</span>}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}</div>
        ) : items.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
            <CalendarCheck className="h-10 w-10 text-muted-foreground/40" />
            아직 접수된 신청이 없습니다.
          </Card>
        ) : (
          <div className="space-y-4">
            {items.map((it) => {
              const e = edits[it.id] ?? {};
              const curStatus = e.status ?? it.status;
              const isNew = it.status === "new";
              return (
                <Card key={it.id} className={`p-5 ${isNew ? "border-foreground/40" : ""}`} data-testid={`card-visit-${it.id}`}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-foreground">{it.businessName}</span>
                      <Badge variant={isNew ? "default" : "outline"} className={isNew ? "bg-teal-600 text-white hover:bg-teal-600" : "text-muted-foreground"}>
                        {STATUS_LABELS[it.status] ?? it.status}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{fmtDate(it.createdAt)}</span>
                  </div>

                  <div className="space-y-1.5">
                    <Row label="담당자" value={it.contactName} />
                    <Row label="연락처" value={it.phone} />
                    <Row label="방문 목적" value={VISIT_PURPOSE_LABELS[it.purpose as keyof typeof VISIT_PURPOSE_LABELS] ?? it.purpose} />
                    <Row label="희망일 1지망" value={it.preferredDate1} />
                    <Row label="희망일 2지망" value={it.preferredDate2} />
                  </div>

                  {it.message && it.message.trim() && (
                    <div className="mt-3 whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed text-foreground">
                      {it.message}
                    </div>
                  )}

                  {/* 관리자 처리 */}
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">진행 상태</label>
                      <div className="flex flex-wrap gap-2">
                        {VISIT_STATUSES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => patchLocal(it.id, "status", s)}
                            data-testid={`visit-status-${it.id}-${s}`}
                            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                              curStatus === s
                                ? "border-foreground bg-foreground text-background"
                                : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                            }`}
                          >
                            {STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">방문 확정일</label>
                        <Input
                          type="date"
                          value={e.confirmedDate ?? it.confirmedDate}
                          onChange={(ev) => patchLocal(it.id, "confirmedDate", ev.target.value)}
                          data-testid={`input-visit-confirmed-${it.id}`}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">관리자 메모</label>
                        <Input
                          value={e.adminMemo ?? it.adminMemo}
                          onChange={(ev) => patchLocal(it.id, "adminMemo", ev.target.value)}
                          placeholder="예: 7/15 통화, 오전 방문 확정"
                          data-testid={`input-visit-memo-${it.id}`}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={saving === it.id || !edits[it.id]}
                        onClick={() => save(it)}
                        data-testid={`button-save-visit-${it.id}`}
                      >
                        저장
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
