import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errMsg } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { saveAccount } from "@/lib/savedAccounts";
import { KakaoChannelButton } from "@/components/KakaoChannelButton";
import { Loader2 } from "lucide-react";
import "./landing.css";

// 공개 소개 페이지가 읽는 원두 정보 — /api/public/blends
// 단가는 내려오지 않고, 상품 관리에서 고치면 이 화면도 함께 바뀐다.
type PublicBlend = {
  id: number;
  name: string;
  tagline: string;
  flavorNotes: string;
  roastLevel: string;
  components: { name: string; ratio: string }[];
};

// 하우스 블렌드 영문 표기 — 상품 데이터에는 한글 이름만 있어 여기서 맞춘다.
// 목록에 없는 블렌드는 한글 이름을 그대로 쓴다.
const BLEND_EN: Record<string, string> = {
  "울 블렌드": "Wool Blend",
  "코튼 블렌드": "Cotton Blend",
  "실크 블렌드": "Silk Blend",
};
const baseName = (n: string) => n.replace(/\s*\d+(kg|g).*$/, "").trim();

// 한 줄 소개가 여러 문장이면 문장 단위로 끊어 본문 리듬에 맞춘다
const splitSentences = (t: string) =>
  t.split(/(?<=다\.)\s+/).map((x) => x.trim()).filter(Boolean);

const PARTNERS = [
  { img: "/partners/depi.jpg", name: "DEPI", region: "경기도 김포시" },
  { img: "/partners/bamboogil.jpg", name: "Bamboogil", region: "경상남도 산청군" },
  { img: "/partners/noz-coffee.jpg", name: "NOZ Coffee", region: "서울 양재동" },
  { img: "/partners/bread-residence.jpg", name: "The Bread Residence", region: "서울 문정동" },
  { img: "/partners/hinter-haus.jpg", name: "Hinter Haus", region: "경기도 안양시" },
];

export default function Login() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user: loggedIn, isLoading: authLoading } = useAuth();

  // 이미 로그인된 상태로 이 주소에 들어오면 카탈로그로 보낸다.
  // 단, '다른 계정 추가 로그인'으로 왔거나 관리자로 로그인된 경우는 그대로 둔다.
  const [addAccount] = useState(() => {
    try {
      const v = sessionStorage.getItem("knit.addAccount") === "1";
      if (v) sessionStorage.removeItem("knit.addAccount");
      return v;
    } catch {
      return false;
    }
  });
  const isAdminSession = (loggedIn as any)?.role === "admin";
  useEffect(() => {
    if (!addAccount && !authLoading && loggedIn && !isAdminSession) navigate("/catalog");
  }, [addAccount, authLoading, loggedIn, isAdminSession, navigate]);

  const [businessName, setBusinessName] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);

  const { data: blends } = useQuery<PublicBlend[]>({ queryKey: ["/api/public/blends"] });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/login", { businessName, password, rememberMe });
      const user = await res.json();
      queryClient.setQueryData(["/api/auth/me"], user);
      await queryClient.refetchQueries({ queryKey: ["/api/auth/me"] });
      if (user && user.role !== "admin") {
        saveAccount({ businessName, password, managerName: user.managerName });
      }
      navigate("/catalog");
    } catch (err: any) {
      toast({ title: "로그인 실패", description: errMsg(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  // 해시 라우팅을 쓰기 때문에 <a href="#id"> 는 주소를 바꿔버린다. 직접 스크롤한다.
  // 랜딩 CTA → 다음 화면에 의도 전달
  function markSampleIntent() {
    try { sessionStorage.setItem("knit.sampleIntent", "1"); } catch {}
  }
  function markInquiryType(t: string) {
    try {
      if (t) sessionStorage.setItem("knit.inquiryType", t);
      else sessionStorage.removeItem("knit.inquiryType");
    } catch {}
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function slide(dir: 1 | -1) {
    const t = document.getElementById("knit-partner-track");
    t?.scrollBy({ left: dir * 398, behavior: "smooth" });
  }

  return (
    // 카카오 버튼은 .knit-landing 밖에 둔다 — 안에 있으면 `.knit-landing a{color:inherit}`가
    // 버튼의 글자·아이콘 색(text-background)을 덮어써서 검은 배경에 검은 아이콘이 된다.
    <>
    <div className="knit-landing">
      {/* ── 최상단: 로고 + 거래처 로그인 ── */}
      <div className="wrap top">
        <img className="logo" src="/knit-logo-stacked.png" alt="knit COFFEE" />

        <div className="login">
          <div className="t">거래처 로그인</div>
          <div className="s">이미 거래 중이신 사장님</div>
          {loggedIn && (
            <p className="note" style={{ margin: "10px 0 0", textAlign: "left" }}>
              지금 <strong style={{ color: "var(--kl-fg)" }}>{(loggedIn as any).businessName || (loggedIn as any).email}</strong> 계정으로 로그인되어 있습니다.
              아래에 다른 상호명과 비밀번호를 넣으면 그 계정으로 바뀝니다.
            </p>
          )}
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="businessName">상호명 (로그인 ID)</label>
              <input
                id="businessName"
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="예: 니트커피"
                required
                data-testid="input-business-name"
              />
            </div>
            <div className="field">
              <label htmlFor="password">비밀번호</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                required
                data-testid="input-password"
              />
            </div>
            <label className="remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                data-testid="checkbox-remember-me"
              />
              <span>로그인 상태 유지</span>
            </label>
            <button className="btn" type="submit" disabled={loading} data-testid="button-login">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              로그인
            </button>
          </form>
          <div className="links">
            <Link href="/forgot-password" data-testid="link-forgot-password">비밀번호 찾기</Link>
            <Link href="/register" data-testid="link-register">거래처 가입</Link>
          </div>
        </div>
      </div>

      <div className="rule"></div>

      {/* ── 히어로 ── */}
      <div className="wrap hero">
        <h1 className="hero-title">Coffee & Consulting</h1>
        <p className="hero-sub narrow">더 좋은 카페가 될 수 있도록 같이 고민합니다.</p>
        <div className="divider"></div>
        <p className="lead narrow">니트커피는 원두를 납품하는 홀세일 파트너이자, 여러 매장의 시작과 성장을 함께 한 컨설팅 파트너입니다.</p>
        <p className="lead narrow">여러 컨설팅 경험과 노하우를 통해 원두 뿐 아니라 매장에 필요한 부분을 함께 고민합니다.</p>
        <div className="cta-row">
          <button type="button" className="btn" onClick={() => scrollTo("knit-start")}>무료 원두 샘플 신청</button>
          <button type="button" className="btn ghost" onClick={() => scrollTo("knit-consulting")}>상담 문의</button>
        </div>
        <p className="note" style={{ marginTop: "14px" }}>블렌드 2종, 각 500g · 비용도 배송비도 없습니다.</p>
      </div>

      <section>
        <div className="wrap">
          <h2 className="hero-title sm">From setup to cup</h2>
          <p className="hero-sub narrow">좋은 커피는 원두 하나로 완성되지 않습니다</p>
          <div className="divider"></div>
          <p className="lead narrow">같은 원두라도 매장마다 다른 맛이 납니다.</p>
          <p className="lead narrow">장비 구성이 다르고, 물이 다르고, 여러 환경들이 다르기 때문입니다.</p>
          <p className="lead narrow">그래서 저희는 <strong style={{color: "var(--kl-fg)"}}>커피를 추출하기 전 단계부터</strong> 함께 고민합니다.</p>

          <div className="items">
            <div className="item"><div className="k">장비 구성</div><p>주변 환경과 고객, 원두에 맞는 장비를 제안합니다</p></div>
            <div className="item"><div className="k">기본 커피 메뉴</div><p>어떤 메뉴를 기본으로 둘지, 컵 사이즈는 어떻게 할지 제안합니다</p></div>
            <div className="item"><div className="k">추출 기준</div><p>파트너의 취향과 고객 성향에 맞는 추출 레시피와 매뉴얼을 만듭니다</p></div>
            <div className="item"><div className="k">운영 동선</div><p>바리스타가 효율적으로 움직일 수 있도록 업무 동선을 함께 봅니다</p></div>
          </div>

        </div>
      </section>

      <section>
        <div className="wrap">
          <h2 className="hero-title sm">Partnership</h2>
          <p className="hero-sub narrow">단순히 원두만 납품하는 관계가 아닙니다</p>
          <div className="divider"></div>
          <p className="lead narrow">니트커피가 잘 추출될 수 있도록 매장에 방문해 커피 추출 환경을 직접 맞춥니다.</p>
          <p className="lead narrow">또한 언제나 일관된 커피가 추출될 수 있도록 노하우를 공유합니다.</p>

          <div className="logbox">
            <p>니트커피는 직접 매장을 운영하며 바리스타가 매일 아침 레시피를 기록하고, 축적합니다.</p>
            <p style={{marginTop: "7px"}}>그리고 파트너 매장에서도 모니터 하실 수 있도록 공유합니다.</p>
            <Link href="/espresso" className="btn">Espresso Extraction Log →</Link>
          </div>
        </div>
      </section>

      {/* ── 원두 소개 (상품 관리 연동) ── */}
      <section>
        <div className="wrap">
          <h2 className="hero-title sm">Our coffee</h2>
          <p className="hero-sub narrow">원두 소개</p>
          <div className="divider"></div>

          <div className="subhead" style={{ marginTop: "38px" }}>Espresso Blend</div>

          {(blends ?? []).map((b) => {
            const kr = baseName(b.name);
            return (
              <div className="blend" key={b.id}>
                <div className="bn">{BLEND_EN[kr] ?? kr}</div>
                <div className="bk">{kr}</div>
                {splitSentences(b.tagline).map((line, i) => (
                  <p className="lead narrow" key={i}>{line}</p>
                ))}
                <div className="comp">
                  {b.flavorNotes && <div>노트 <b>{b.flavorNotes}</b></div>}
                  {b.roastLevel && <div>로스팅 <b>{b.roastLevel}</b></div>}
                  {b.components.map((c, i) => (
                    <div key={i}>{c.name} <b>{c.ratio}%</b></div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="cta-row">
            <button type="button" className="btn" onClick={() => scrollTo("knit-start")}>무료 샘플로 먼저 확인해 보기</button>
          </div>
        </div>
      </section>

      <section id="knit-consulting">
        <div className="wrap">
          <h2 className="hero-title sm">Cafe consulting</h2>
          <p className="hero-sub narrow">원두 납품과 함께, 매장 컨설팅</p>
          <div className="divider"></div>
          <p className="lead narrow">원두 고민으로 시작했다가 메뉴 구성, 가격, 동선 이야기로 이어지는 경우가 많습니다.</p>
          <p className="lead narrow">저희도 매장을 직접 운영하기 때문에 그 고민을 같은 자리에서 해왔습니다.</p>

          <div className="skills">
            <span>메뉴 개발</span><span>커피바 레이아웃 디자인</span><span>장비 납품 · 설치</span>
            <span>바리스타 교육</span><span>효율적인 동선 구축</span>
          </div>

          <div className="flow">
            <div className="fstep"><i className="dot" />
              <div className="no">STEP 01</div>
              <div className="ft">문의 · 첫 미팅</div>
              <p className="fd">어떤 카페를 하고 싶으신지, 어디에 도움이 필요하신지 먼저 듣습니다.</p>
              <p className="fd">이야기를 나누며 함께할 범위를 정합니다.</p>
            </div>

            <div className="fstep"><i className="dot" />
              <div className="no">STEP 02</div>
              <div className="ft">메뉴 1차 — 메뉴 PT</div>
              <p className="fd">어떤 손님에게 어떻게 어필할 카페인지 정리해 메뉴를 제안드립니다.</p>
              <p className="fd">여기서 컨셉과 카테고리가 정해져야 장비를 고를 수 있어, 가장 먼저 진행합니다.</p>
            </div>

            <div className="fstep"><i className="dot" />
              <div className="no">STEP 03</div>
              <div className="ft">커피바 장비 선정</div>
              <p className="fd">환경과 메뉴, 업무 동선에 맞는 장비를 선정합니다.</p>
            </div>

            <div className="fstep"><i className="dot" />
              <div className="no">STEP 04</div>
              <div className="ft">커피바 레이아웃 디자인</div>
              <p className="fd">인테리어팀과 직접 소통하며 커피바를 그립니다.</p>
              <p className="fd">일하는 동선까지 이 단계에서 함께 잡습니다.</p>
            </div>

            <div className="fstep"><i className="dot" />
              <div className="no">STEP 05</div>
              <div className="ft">메뉴 2차 — 1차 시음</div>
              <p className="fd">니트커피 매장에서 제안한 메뉴를 실제로 만들어 맛을 봅니다.</p>
            </div>

            <div className="fstep"><i className="dot" />
              <div className="no">STEP 06</div>
              <div className="ft">메뉴 3차 — 2차 시음</div>
              <p className="fd">보완한 메뉴를 다시 맛보고 최종 확정합니다.</p>
              <p className="fd">인테리어가 진행되는 동안 여기까지 마칩니다.</p>
            </div>

            <div className="fstep"><i className="dot" />
              <div className="no">STEP 07</div>
              <div className="ft">장비 설치</div>
              <p className="fd">설치 당일 니트커피 팀이 함께 나갑니다.</p>
              <p className="fd">장비 배치의 사소한 부분까지 현장에서 잡습니다.</p>
            </div>

            <div className="fstep"><i className="dot" />
              <div className="no">STEP 08</div>
              <div className="ft">바리스타 교육</div>
              <div className="tagrow"><span>커피 추출</span><span>장비 관리</span><span>음료 제조</span></div>
            </div>

            <div className="fstep"><i className="dot" />
              <div className="no">STEP 09</div>
              <div className="ft">오픈 당일, 그리고 그 이후</div>
              <p className="fd">첫 손님을 맞는 자리에 옆에서 함께 있습니다.</p>
              <p className="fd">문을 연 뒤에도 운영에 대한 고민을 같이 합니다.</p>
            </div>

          </div>

          <p className="lead narrow" style={{marginTop: "44px"}}>어떤 손님에게 어떻게 어필할 카페인지 충분히 고민한 뒤에 메뉴를 짭니다.</p>
          <p className="lead narrow">그래서 니트커피와 함께한 카페들은 모두 서로 다른 메뉴를 가지고 있습니다.</p>

          <p className="lead" style={{marginTop: "34px"}}>컨설팅만 받으셔도 되고, 납품과 함께 하셔도 됩니다.</p>

          <div className="cta-row">
            <Link href="/inquiry" className="btn ghost" onClick={() => markInquiryType("consulting")}>컨설팅 문의</Link>
          </div>
        </div>
      </section>

      {/* ── 함께하는 곳들 ── */}
      <section>
        <div className="wrap">
          <h2 className="hero-title sm">Our partners</h2>
          <p className="hero-sub narrow">함께하고 있는 곳들</p>
          <div className="divider"></div>

          <div className="carousel">
            <div className="track" id="knit-partner-track">
              {PARTNERS.map((p) => (
                <div className="slide" key={p.name}>
                  <div className="card">
                    <img src={p.img} alt={`${p.name} ${p.region}`} loading="lazy" />
                    <div className="veil"></div>
                    <div className="cap">
                      <div className="nm">{p.name}</div>
                      <div className="rg">{p.region}</div>
                      <span className="bg">컨설팅 + 원두 납품</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="arrows">
              <button className="arrow" type="button" onClick={() => slide(-1)} aria-label="이전">←</button>
              <button className="arrow" type="button" onClick={() => slide(1)} aria-label="다음">→</button>
            </div>
          </div>
        </div>
      </section>

      {/* ── 마무리 ── */}
      <div className="wrap final" id="knit-start">
        <div className="subhead">Get in touch</div>
        <div className="cta-row">
          <Link href="/register" className="btn" onClick={markSampleIntent}>무료 샘플 신청하기</Link>
          <Link href="/inquiry" className="btn ghost" onClick={() => markInquiryType("")}>상담 문의</Link>
        </div>
      </div>

      <footer>
        <div className="wrap">
          <div className="lg">니트커피 · 서울시 중구 소월로2길 30, 1층 · <a href="tel:07077170613">070-7717-0613</a></div>
          <div className="lg" style={{ marginTop: "10px" }}>
            <Link href="/admin/login" data-testid="link-admin-login">Admin login</Link>
          </div>
        </div>
      </footer>
    </div>
    <KakaoChannelButton />
    </>
  );
}
