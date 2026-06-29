import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errMsg, fmtDateTime } from "@/lib/format";
import { Plus, Trash2, Edit2, Loader2 } from "lucide-react";

interface Manager {
  id: number;
  email: string;
  managerName: string;
  phone: string;
  adminRole: string;
  createdAt: string;
}

export default function AdminManagers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Manager | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Manager | null>(null);

  const { data: managers, isLoading } = useQuery<Manager[]>({
    queryKey: ["/api/admin/managers"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/managers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/managers"] });
      toast({ title: "매니저 삭제됨" });
      setDeleteTarget(null);
    },
    onError: (e: Error) => {
      toast({ title: "삭제 실패", description: e.message, variant: "destructive" });
    },
  });

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="mb-6 flex flex-col gap-2 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow mb-1">Team management</p>
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              매니저 관리
            </h1>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="button-create-manager">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            매니저 추가
          </Button>
        </div>

        <div className="rounded-none border border-border">
          {/* 테이블 헤더 */}
          <div className="hidden border-b border-border bg-muted/30 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:grid sm:grid-cols-[1fr_160px_140px_100px_80px]">
            <div>이름 / 이메일</div>
            <div>연락처</div>
            <div>생성일</div>
            <div>권한</div>
            <div className="text-right">작업</div>
          </div>

          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-none" />
              ))}
            </div>
          ) : !managers || managers.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              등록된 매니저가 없습니다.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {managers.map((m) => {
                const isSelf = m.id === user?.id;
                return (
                  <li
                    key={m.id}
                    className="px-4 py-3"
                    data-testid={`row-manager-${m.id}`}
                  >
                    <div className="flex items-center justify-between gap-3 sm:grid sm:grid-cols-[1fr_160px_140px_100px_80px]">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{m.managerName}</span>
                          {isSelf && (
                            <span className="border border-border px-1.5 py-0.5 font-ui text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                              나
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{m.email}</p>
                      </div>
                      <div className="hidden text-xs text-muted-foreground sm:block">
                        {m.phone || "-"}
                      </div>
                      <div className="hidden text-xs text-muted-foreground sm:block">
                        {fmtDateTime(m.createdAt)}
                      </div>
                      <div className="hidden sm:block">
                        <Badge variant={m.adminRole === "owner" ? "default" : "secondary"} className="text-[10px]">
                          {m.adminRole === "owner" ? "Owner" : "Manager"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditTarget(m)}
                          data-testid={`button-edit-manager-${m.id}`}
                          aria-label="수정"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(m)}
                          disabled={isSelf}
                          data-testid={`button-delete-manager-${m.id}`}
                          aria-label="삭제"
                          className="text-destructive hover:text-destructive disabled:opacity-30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* 생성 다이얼로그 */}
      {createOpen && (
        <ManagerFormDialog
          mode="create"
          onClose={() => setCreateOpen(false)}
        />
      )}

      {/* 수정 다이얼로그 */}
      {editTarget && (
        <ManagerFormDialog
          mode="edit"
          manager={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* 삭제 확인 다이얼로그 */}
      {deleteTarget && (
        <Dialog open onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>매니저 삭제</DialogTitle>
              <DialogDescription>
                <span className="font-semibold text-foreground">{deleteTarget.managerName}</span>({deleteTarget.email})을
                삭제합니다. 이 작업은 되돌릴 수 없습니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                취소
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete-manager"
              >
                {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                삭제
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AdminLayout>
  );
}

function ManagerFormDialog({
  mode,
  manager,
  onClose,
}: {
  mode: "create" | "edit";
  manager?: Manager;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(manager?.managerName ?? "");
  const [email, setEmail] = useState(manager?.email ?? "");
  const [phone, setPhone] = useState(manager?.phone ?? "");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === "create") {
        const res = await apiRequest("POST", "/api/admin/managers", {
          email: email.trim(),
          managerName: name.trim(),
          phone: phone.trim(),
          password,
        });
        return res.json();
      } else {
        const body: Record<string, string> = {
          managerName: name.trim(),
          phone: phone.trim(),
        };
        if (password) body.password = password;
        const res = await apiRequest("PATCH", `/api/admin/managers/${manager!.id}`, body);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/managers"] });
      toast({ title: mode === "create" ? "매니저 추가됨" : "매니저 수정됨" });
      onClose();
    },
    onError: (e: Error) => {
      toast({ title: "저장 실패", description: errMsg(e), variant: "destructive" });
    },
  });

  const canSubmit =
    name.trim() &&
    (mode === "edit" || (email.trim() && password.length >= 4));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "매니저 추가" : "매니저 수정"}</DialogTitle>
          <DialogDescription className="text-xs">
            {mode === "create"
              ? "새 매니저 계정을 생성합니다. 매니저는 Owner 전용 메뉴(매니저 관리, 백업)에 접근할 수 없습니다."
              : "매니저 정보를 수정합니다. 비밀번호는 변경 시에만 입력하세요."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {mode === "create" && (
            <div className="space-y-1.5">
              <Label className="text-xs">이메일</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="manager@example.com"
                data-testid="input-manager-email"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">이름</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="담당자 이름"
              data-testid="input-manager-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">연락처</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              data-testid="input-manager-phone"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              {mode === "create" ? "비밀번호" : "새 비밀번호 (변경 시만 입력)"}
            </Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "create" ? "4자 이상" : "변경하지 않으면 빈칸"}
              data-testid="input-manager-password"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !canSubmit}
            data-testid="button-submit-manager"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "create" ? "추가" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
