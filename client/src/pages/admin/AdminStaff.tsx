import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/AdminLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg, fmtDate } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { STAFF_ROLE_LABEL, type PublicStaff, type StaffRole } from "@shared/schema";
import { Loader2, Plus, Users, KeyRound, Check, X } from "lucide-react";

type NewStaff = {
  loginId: string;
  password: string;
  name: string;
  phone: string;
  position: string;
  staffRole: StaffRole;
};

const EMPTY: NewStaff = {
  loginId: "",
  password: "",
  name: "",
  phone: "",
  position: "바리스타",
  staffRole: "staff",
};

export default function AdminStaff() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isOwner = (user as any)?.adminRole === "owner";
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<NewStaff>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [pwFor, setPwFor] = useState<number | null>(null);
  const [pw, setPw] = useState("");

  const { data: list, isLoading } = useQuery<PublicStaff[]>({ queryKey: ["/api/admin/staff"] });

  const set = (patch: Partial<NewStaff>) => setD((prev) => ({ ...prev, ...patch }));
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/staff"] });

  async function create() {
    setBusy(true);
    try {
      await apiRequest("POST", "/api/admin/staff", {
        loginId: d.loginId.trim(),
        password: d.password,
        name: d.name.trim(),
        phone: d.phone.trim(),
        position: d.position.trim() || "바리스타",
        staffRole: d.staffRole,
      });
      toast({ title: "직원 계정이 생성되었습니다." });
      setD(EMPTY);
      setOpen(false);
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "생성 실패", description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: number, body: Record<string, any>, msg = "저장되었습니다.") {
    try {
      await apiRequest("PATCH", `/api/admin/staff/${id}`, body);
      toast({ title: msg });
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "저장 실패", description: errMsg(err) });
    }
  }

  async function resetPassword(id: number) {
    if (pw.length < 6) {
      toast({ variant: "destructive", title: "비밀번호는 6자 이상이어야 합니다." });
      return;
    }
    await patch(id, { password: pw }, "비밀번호가 변경되었습니다.");
    setPwFor(null);
    setPw("");
  }

  async function remove(id: number, name: string) {
    if (!confirm(`'${name}' 계정을 삭제할까요? 기록은 남지만 계정은 사라집니다.`)) return;
    try {
      await apiRequest("DELETE", `/api/admin/staff/${id}`);
      toast({ title: "삭제되었습니다." });
      invalidate();
    } catch (err) {
      toast({ variant: "destructive", title: "삭제 실패", description: errMsg(err) });
    }
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="eyebrow">Staff Accounts</div>
        <h1 className="font-display mb-1 mt-1 text-xl font-semibold text-foreground">직원 계정</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          직원은 <span className="font-medium text-foreground">/#/staff</span> 에서 아이디로 로그인합니다. 거래처 계정과 완전히 분리되어 있어
          주문·재무 화면에는 접근할 수 없습니다.
        </p>

        {isOwner && !open && (
          <Button className="mb-4" onClick={() => setOpen(true)} data-testid="button-open-staff-form">
            <Plus className="h-4 w-4" />
            직원 추가
          </Button>
        )}

        {open && (
          <Card className="mb-5 p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">아이디 (한글·영문·숫자)</Label>
                <Input value={d.loginId} onChange={(e) => set({ loginId: e.target.value })} placeholder="소영 또는 minji" data-testid="input-staff-loginid" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">초기 비밀번호 (6자 이상)</Label>
                <Input type="text" value={d.password} onChange={(e) => set({ password: e.target.value })} placeholder="knit1234" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">이름</Label>
                <Input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="김민지" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">연락처</Label>
                <Input value={d.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="010-0000-0000" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">직책</Label>
                <Input value={d.position} onChange={(e) => set({ position: e.target.value })} placeholder="바리스타" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">권한</Label>
                <select
                  value={d.staffRole}
                  onChange={(e) => set({ staffRole: e.target.value as StaffRole })}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="staff">직원</option>
                  <option value="lead">매니저</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={create} disabled={busy} data-testid="button-create-staff">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "계정 만들기"}
              </Button>
              <Button variant="outline" onClick={() => { setOpen(false); setD(EMPTY); }}>취소</Button>
            </div>
          </Card>
        )}

        <Card className="overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-sm font-semibold text-foreground">등록된 직원</h2>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : (list?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">등록된 직원이 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y">
              {list!.map((s) => (
                <div key={s.id} className="p-4" data-testid={`row-staff-${s.id}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{s.name}</span>
                        <Badge variant="outline" className="text-[10px]">{STAFF_ROLE_LABEL[s.staffRole as StaffRole] ?? s.staffRole}</Badge>
                        {s.active === 0 && <Badge variant="secondary" className="text-[10px]">비활성</Badge>}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {s.loginId} · {s.position} · {s.phone || "연락처 없음"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {s.lastLoginAt ? `최근 로그인 ${fmtDate(s.lastLoginAt)}` : "로그인 이력 없음"}
                      </div>
                    </div>
                    {isOwner && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setPwFor(pwFor === s.id ? null : s.id); setPw(""); }}>
                          <KeyRound className="h-3.5 w-3.5" />
                          비밀번호
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => patch(s.id, { active: s.active === 1 ? 0 : 1 })}
                        >
                          {s.active === 1 ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                          {s.active === 1 ? "비활성화" : "활성화"}
                        </Button>
                        {s.staffRole !== "owner" && (
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(s.id, s.name)}>
                            삭제
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {pwFor === s.id && (
                    <div className="mt-3 flex gap-2">
                      <Input
                        value={pw}
                        onChange={(e) => setPw(e.target.value)}
                        placeholder="새 비밀번호 (6자 이상)"
                        className="max-w-xs"
                      />
                      <Button size="sm" onClick={() => resetPassword(s.id)}>변경</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setPwFor(null); setPw(""); }}>취소</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {!isOwner && (
          <p className="mt-4 text-xs text-muted-foreground">계정 생성·수정은 소유자만 가능합니다.</p>
        )}
      </div>
    </AdminLayout>
  );
}
