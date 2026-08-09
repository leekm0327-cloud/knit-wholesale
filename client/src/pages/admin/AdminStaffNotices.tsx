import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg, fmtDateTime } from "@/lib/format";
import type { Announcement } from "@shared/schema";
import { Loader2, Plus, Trash2, Pin, AlertCircle, Megaphone } from "lucide-react";

type Row = Announcement & { readCount: number; staffCount: number };

export default function AdminStaffNotices() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [important, setImportant] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery<Row[]>({ queryKey: ["/api/admin/staff/announcements"] });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/staff/announcements"] });

  async function create() {
    if (!title.trim()) {
      toast({ variant: "destructive", title: "제목을 입력해 주세요." });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/admin/staff/announcements", {
        title: title.trim(),
        body: body.trim(),
        pinned: pinned ? 1 : 0,
        important: important ? 1 : 0,
      });
      toast({ title: "공지가 등록되었습니다." });
      setTitle(""); setBody(""); setPinned(false); setImportant(false); setOpen(false);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "등록 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: number, body: Record<string, any>) {
    try {
      await apiRequest("PATCH", `/api/admin/staff/announcements/${id}`, body);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "저장 실패", description: errMsg(err) });
    }
  }

  async function remove(id: number) {
    if (!confirm("이 공지를 삭제할까요?")) return;
    try {
      await apiRequest("DELETE", `/api/admin/staff/announcements/${id}`);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Notices</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">직원 공지사항</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          직원 앱 홈과 공지 탭에 표시됩니다. 누가 읽었는지는 읽음 수로 확인할 수 있습니다.
        </p>

        {!open && (
          <Button className="mb-4" onClick={() => setOpen(true)} data-testid="button-open-notice-form">
            <Plus className="h-4 w-4" />
            공지 작성
          </Button>
        )}

        {open && (
          <Card className="mb-5 p-5">
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">제목</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 이번 주 원두 변경 안내" data-testid="input-notice-title" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">내용</Label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="내용을 입력해 주세요." />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
                  상단 고정
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
                  중요 표시
                </label>
              </div>
              <div className="flex gap-2">
                <Button onClick={create} disabled={busy} data-testid="button-create-notice">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "등록"}
                </Button>
                <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
              </div>
            </div>
          </Card>
        )}

        <Card className="overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">등록된 공지</h2>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : (data?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Megaphone className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">등록된 공지가 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y">
              {data!.map((a) => (
                <div key={a.id} className="p-4" data-testid={`row-notice-${a.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {a.pinned === 1 && <Pin className="h-3.5 w-3.5 text-muted-foreground" />}
                        {a.important === 1 && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                        <span className="text-sm font-semibold text-foreground">{a.title}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {fmtDateTime(a.createdAt)} · {a.authorName}
                      </div>
                      {a.body && <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{a.body}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        읽음 {a.readCount}/{a.staffCount}
                      </Badge>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => patch(a.id, { pinned: a.pinned === 1 ? 0 : 1 })}>
                          {a.pinned === 1 ? "고정 해제" : "고정"}
                        </Button>
                        <button onClick={() => remove(a.id)} className="px-2 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
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
