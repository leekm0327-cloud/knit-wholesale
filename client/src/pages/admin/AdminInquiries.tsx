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
import { Inbox } from "lucide-react";

type Inquiry = {
  id: number;
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  region: string;
  volume: string;
  message: string;
  status: string;
  adminMemo: string;
  createdAt: number;
};

function Row({ label, value }: { label: string; value?: string }) {
  if (!value || !value.trim()) return null;
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-20 shrink-0 font-ui text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-foreground">{value}</span>
    </div>
  );
}

export default function AdminInquiries() {
  const { toast } = useToast();
  const { data: list, isLoading } = useQuery<Inquiry[]>({
    queryKey: ["/api/admin/inquiries"],
    refetchInterval: 60000,
  });
  const [memos, setMemos] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);

  async function patch(id: number, body: any, msg: string) {
    setSaving(id);
    try {
      await apiRequest("PATCH", `/api/admin/inquiries/${id}`, body);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/inquiries"] });
      toast({ title: msg });
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
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">납품 문의</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            홀세일 납품 문의 접수 내역입니다. {newCount > 0 && <span className="font-semibold text-foreground">· 신규 {newCount}건</span>}
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
        ) : items.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center text-sm text-muted-foreground">
            <Inbox className="h-10 w-10 text-muted-foreground/40" />
            아직 접수된 문의가 없습니다.
          </Card>
        ) : (
          <div className="space-y-4">
            {items.map((it) => {
              const isNew = it.status === "new";
              return (
                <Card key={it.id} className={`p-5 ${isNew ? "border-foreground/40" : ""}`} data-testid={`card-inquiry-${it.id}`}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-foreground">{it.businessName}</span>
                      {isNew ? (
                        <Badge className="bg-teal-600 text-white hover:bg-teal-600">신규</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">연락완료</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{fmtDate(it.createdAt)}</span>
                  </div>

                  <div className="space-y-1.5">
                    <Row label="담당자" value={it.contactName} />
                    <Row label="연락처" value={it.phone} />
                    <Row label="이메일" value={it.email} />
                    <Row label="지역" value={it.region} />
                    <Row label="월 물량" value={it.volume} />
                  </div>

                  <div className="mt-3 whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed text-foreground">
                    {it.message}
                  </div>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1 space-y-1.5">
                      <label className="text-xs text-muted-foreground">관리자 메모</label>
                      <Input
                        value={memos[it.id] ?? it.adminMemo}
                        onChange={(e) => setMemos((m) => ({ ...m, [it.id]: e.target.value }))}
                        placeholder="처리 메모 (예: 3/12 통화, 견적 발송)"
                        data-testid={`input-inq-memo-${it.id}`}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={saving === it.id}
                        onClick={() => patch(it.id, { adminMemo: memos[it.id] ?? it.adminMemo }, "메모 저장됨")}
                        data-testid={`button-save-memo-${it.id}`}
                      >
                        메모 저장
                      </Button>
                      <Button
                        size="sm"
                        variant={isNew ? "default" : "outline"}
                        disabled={saving === it.id}
                        onClick={() => patch(it.id, { status: isNew ? "done" : "new" }, isNew ? "연락완료로 변경" : "신규로 변경")}
                        data-testid={`button-toggle-inq-${it.id}`}
                      >
                        {isNew ? "연락완료 처리" : "신규로 되돌리기"}
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
