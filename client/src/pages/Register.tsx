import { useState, useRef } from "react";
import { useLocation, Link } from "wouter";
import { StackedLogo } from "@/components/Logo";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import { Loader2 } from "lucide-react";

import "./registration.css";

const fields = [
 {key:'businessName',label:'상호명',required:true,auto:'username',placeholder:'예: 니트커피',hint:'로그인 ID로 사용합니다.'},
 {key:'managerName',label:'담당자명',required:true,auto:'name',placeholder:'예: 김도원'},
 {key:'phone',label:'연락처',required:true,auto:'tel',type:'tel',placeholder:'010-0000-0000'},
 {key:'bizRegNo',label:'사업자등록번호',required:false,auto:'off',placeholder:'000-00-00000',hint:'샘플 신청에는 사업자 승인이 필요합니다. 가입 후에도 번호를 입력할 수 있습니다.'},
 {key:'email',label:'이메일',required:true,auto:'email',type:'email',placeholder:'business@example.com',hint:'이 이메일로 세금계산서가 발행됩니다.'},
 {key:'password',label:'비밀번호',required:true,auto:'new-password',type:'password',placeholder:'6자 이상'},
 {key:'passwordConfirm',label:'비밀번호 확인',required:true,auto:'new-password',type:'password',placeholder:'비밀번호를 다시 입력해 주세요'},
 {key:'defaultAddress',label:'기본 배송지',required:false,auto:'street-address',placeholder:'도로명 주소 또는 지번 주소'},
];

function readSampleIntent(): boolean {
  try {
    return sessionStorage.getItem("knit.sampleIntent") === "1";
  } catch {
    return false;
  }
}

export default function Register() {
  const [, navigate] = useLocation();
  // 랜딩의 "무료 샘플 신청하기"로 들어온 경우 — 가입 후 바로 샘플 신청으로 보냅니다.
  const [sampleIntent] = useState(readSampleIntent);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const [form, setForm] = useState({
    businessName: "",
    managerName: "",
    phone: "",
    email: "",
    password: "",
    passwordConfirm: "",
    bizRegNo: "",
    defaultAddress: "",
  });
  // 실시간 비밀번호 불일치 표시
  const [pwMismatch, setPwMismatch] = useState(false);

  const set = (k: string, v: string) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      // 비밀번호 확인 필드 입력 중 실시간 검증
      if (k === "passwordConfirm" || k === "password") {
        const pw = k === "password" ? v : next.password;
        const pwc = k === "passwordConfirm" ? v : next.passwordConfirm;
        setPwMismatch(pwc !== "" && pw !== pwc);
      }
      return next;
    });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    if (form.password !== form.passwordConfirm) {
      toast({ title: "비밀번호 불일치", description: "비밀번호와 비밀번호 확인이 일치하지 않습니다.", variant: "destructive" });
      return;
    }
    submitting.current = true;
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/register", {
        ...form,
        paymentMethod: "transfer",
        // taxEmail은 서버에서 email과 동일하게 세팅됨 (#24)
      });
      const user = await res.json();
      queryClient.setQueryData(["/api/auth/me"], user);
      await queryClient.refetchQueries({ queryKey: ["/api/auth/me"] });
      if (sampleIntent) {
        try { sessionStorage.removeItem("knit.sampleIntent"); } catch {}
        toast({ title: "거래처 등록 완료", description: "이어서 무료 샘플을 신청해 주세요." });
        navigate("/sample");
      } else {
        toast({ title: "거래처 등록 완료", description: "환영합니다! 이제 주문하실 수 있습니다." });
        navigate("/catalog");
      }
    } catch (err: any) {
      toast({ title: "가입 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

 const field=(f:typeof fields[number])=><div className={'reg-field '+(f.key==='email'||f.key==='defaultAddress'?'wide':'')} key={f.key}>
 <label htmlFor={f.key}>{f.label}{f.key === "password" ? " (6자 이상)" : ""} <span>{f.required?'필수':'선택'}</span></label>
 <input id={f.key} name={f.key} type={f.type||'text'} autoComplete={f.auto} required={f.required} placeholder={f.placeholder} data-testid={'input-'+f.key} value={form[f.key as keyof typeof form]||''} onChange={e=>set(f.key,e.target.value)} aria-invalid={f.key==='passwordConfirm'&&pwMismatch} aria-describedby={f.key==='passwordConfirm'&&pwMismatch?'password-error':f.hint?f.key+'-hint':undefined}/>
 {f.hint&&<p id={f.key+'-hint'}>{f.hint}</p>}
 {f.key==='passwordConfirm'&&pwMismatch&&<p id="password-error" role="alert" className="error">비밀번호가 일치하지 않습니다.</p>}
 </div>;
 return <main className="registration-page"><header><StackedLogo size={72}/><p className="kicker">NEW PARTNER</p><h1>{sampleIntent?'샘플 신청을 위한 거래처 가입':'거래처 가입'}</h1><p>{sampleIntent?'가입 후 샘플 신청 화면에서 자격을 확인하고 원두를 선택합니다.':'한 번만 입력하면 다음 주문부터 자동으로 채워집니다.'}</p></header>
 <div className="reg-card"><div className="reg-path">{sampleIntent?<><strong>거래처 가입</strong><span>→ 신청 자격 확인 → 원두 선택·샘플 신청</span></>:<><strong>거래처 가입</strong><span>→ 카탈로그에서 주문 시작</span></>}</div>
 {sampleIntent&&<p className="reg-policy">사업자 승인 후 샘플을 신청할 수 있습니다.<br/>승인되지 않은 경우, 다음 화면에서 사업자번호 입력 또는 문의를 안내합니다.</p>}
 <form onSubmit={submit}><section><h2>기본 정보</h2><div className="reg-grid">{fields.slice(0,4).map(field)}</div></section><section><h2>계정 정보</h2><div className="reg-grid">{fields.slice(4,7).map(field)}</div></section><section><h2>배송 정보</h2><div className="reg-grid">{field(fields[7])}</div></section>
 <button type="submit" disabled={loading || pwMismatch} aria-busy={loading} data-testid="button-register">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{sampleIntent?'가입하고 샘플 신청으로':'가입하고 시작하기'}</button></form>
 <footer>이미 거래처이신가요? <Link href="/login" data-testid="link-login">로그인</Link></footer></div></main>;
}
