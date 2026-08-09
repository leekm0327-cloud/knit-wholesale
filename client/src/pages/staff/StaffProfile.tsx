import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { StaffLayout, useStaff } from "@/components/StaffLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/format";
import { Loader2, LogOut } from "lucide-react";

export default function StaffProfile() {
  const { toast } = useToast();
  const { data: me } = useStaff();
  const [, navigate] = useLocation();

  const [phone, setPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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

  async function logout() {
    if (!confirm("로그아웃 할까요?")) return;
    setLoggingOut(true);
    try {
      await apiRequest("POST", "/api/staff/logout");
    } catch {
      /* 세션이 이미 끊겼어도 화면은 로그인으로 보낸다 */
    }
    queryClient.setQueryData(["/api/staff/me"], null);
    queryClient.clear();
    navigate("/staff/login");
  }

  return (
    <StaffLayout title="내 정보" subtitle="설정">
      <div className="s-card" style={{ padding: "4px 16px" }}>
        <Row label="이름" value={me?.name ?? ""} />
        <Row label="아이디" value={me?.loginId ?? ""} />
        <Row label="직책" value={me?.position ?? ""} />
      </div>
      <p className="mt-2 px-2 text-[11px] leading-relaxed" style={{ color: "var(--s-muted)" }}>
        이름·아이디·직책은 대표님만 바꿀 수 있습니다.
      </p>

      <div className="s-sect">연락처</div>
      <div className="s-card">
        <input
          className="s-input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="010-0000-0000"
          inputMode="tel"
          data-testid="input-my-phone"
        />
        <button
          className="s-pill wide mt-2.5"
          onClick={savePhone}
          disabled={savingPhone}
          data-testid="button-save-phone"
        >
          {savingPhone ? <Loader2 className="h-4 w-4 animate-spin" /> : "연락처 저장"}
        </button>
      </div>

      <div className="s-sect">비밀번호 변경</div>
      <div className="s-card">
        <label className="s-label">현재 비밀번호</label>
        <input
          className="s-input"
          type="password"
          value={curPw}
          onChange={(e) => setCurPw(e.target.value)}
          data-testid="input-current-password"
        />
        <div className="mt-3">
          <label className="s-label">새 비밀번호 (6자 이상)</label>
          <input
            className="s-input"
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            data-testid="input-new-password"
          />
        </div>
        <div className="mt-3">
          <label className="s-label">새 비밀번호 확인</label>
          <input
            className="s-input"
            type="password"
            value={newPw2}
            onChange={(e) => setNewPw2(e.target.value)}
            data-testid="input-new-password2"
          />
        </div>
        <button
          className="s-pill wide mt-3.5"
          onClick={savePassword}
          disabled={savingPw}
          data-testid="button-save-password"
        >
          {savingPw ? <Loader2 className="h-4 w-4 animate-spin" /> : "비밀번호 변경"}
        </button>
        <p className="mt-2.5 text-[11px] leading-relaxed" style={{ color: "var(--s-muted)" }}>
          비밀번호를 잊으셨다면 대표님께 요청하시면 새로 발급해 드립니다.
        </p>
      </div>

      <div className="s-sect">계정</div>
      <button className="s-pill line wide" onClick={logout} disabled={loggingOut} data-testid="button-staff-logout">
        {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" strokeWidth={1.8} />}
        로그아웃
      </button>
      <p className="mt-2.5 px-2 text-center text-[11px]" style={{ color: "var(--s-muted)" }}>
        공용 기기에서는 사용 후 꼭 로그아웃해 주세요.
      </p>
    </StaffLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="s-li">
      <span className="s-a" style={{ color: "var(--s-muted)" }}>
        {label}
      </span>
      <span className="text-[13.5px] font-medium">{value || "-"}</span>
    </div>
  );
}
