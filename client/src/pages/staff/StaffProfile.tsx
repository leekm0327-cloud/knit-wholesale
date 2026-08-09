import { useEffect, useState } from "react";
import { StaffLayout, useStaff } from "@/components/StaffLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import { Loader2, KeyRound, Phone } from "lucide-react";

export default function StaffProfile() {
  const { toast } = useToast();
  const { data: me } = useStaff();

  const [phone, setPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (me) setPhone(me.phone ?? "");
  }, [me]);

  async function savePhone() {
    setSavingPhone(true);
    try {
      await apiRequest("PATCH", "/api/staff/me", { phone: phone.trim() });
      toast({ title: "연락처가 저장되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/me"] });
    } catch (err) {
      toast({ variant: "destructive", title: "저장 실패", description: errMsg(err) });
    } finally {
      setSavingPhone(false);
    }
  }

  async function savePassword() {
    if (newPw.length < 6) {
      toast({ variant: "destructive", title: "새 비밀번호는 6자 이상이어야 합니다." });
      return;
    }
    if (newPw !== newPw2) {
      toast({ variant: "destructive", title: "새 비밀번호가 서로 다릅니다." });
      return;
    }
    setSavingPw(true);
    try {
      await apiRequest("PATCH", "/api/staff/me/password", {
        currentPassword: curPw,
        newPassword: newPw,
      });
      toast({ title: "비밀번호가 변경되었습니다." });
      setCurPw("");
      setNewPw("");
      setNewPw2("");
    } catch (err) {
      toast({ variant: "destructive", title: "변경 실패", description: errMsg(err) });
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <StaffLayout title="내 정보" subtitle="연락처와 비밀번호를 바꿀 수 있습니다">
      <Card className="p-5">
        <div className="mb-4 space-y-1">
          <Row label="이름" value={me?.name ?? ""} />
          <Row label="아이디" value={me?.loginId ?? ""} />
          <Row label="직책" value={me?.position ?? ""} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          이름·아이디·직책은 대표님만 바꿀 수 있습니다. 수정이 필요하면 말씀해 주세요.
        </p>
      </Card>

      <Card className="mt-4 p-5">
        <div className="mb-3 flex items-center gap-1.5">
          <Phone className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <span className="text-sm font-semibold text-foreground">연락처</span>
        </div>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="010-0000-0000"
          data-testid="input-my-phone"
        />
        <Button className="mt-3 w-full" onClick={savePhone} disabled={savingPhone} data-testid="button-save-phone">
          {savingPhone ? <Loader2 className="h-4 w-4 animate-spin" /> : "연락처 저장"}
        </Button>
      </Card>

      <Card className="mt-4 p-5">
        <div className="mb-3 flex items-center gap-1.5">
          <KeyRound className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <span className="text-sm font-semibold text-foreground">비밀번호 변경</span>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">현재 비밀번호</Label>
            <Input
              type="password"
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
              data-testid="input-current-password"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">새 비밀번호 (6자 이상)</Label>
            <Input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              data-testid="input-new-password"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">새 비밀번호 확인</Label>
            <Input
              type="password"
              value={newPw2}
              onChange={(e) => setNewPw2(e.target.value)}
              data-testid="input-new-password2"
            />
          </div>
        </div>
        <Button className="mt-4 w-full" onClick={savePassword} disabled={savingPw} data-testid="button-save-password">
          {savingPw ? <Loader2 className="h-4 w-4 animate-spin" /> : "비밀번호 변경"}
        </Button>
        <p className="mt-3 text-[11px] text-muted-foreground">
          비밀번호를 잊으셨다면 대표님께 요청하시면 새로 발급해 드립니다.
        </p>
      </Card>
    </StaffLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value || "-"}</span>
    </div>
  );
}
