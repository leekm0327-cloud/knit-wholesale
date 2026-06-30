import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, LogIn, KeyRound, ShoppingBag, ClipboardList, Pencil, X, UserCog, HelpCircle } from "lucide-react";

const sections = [
  { id: "register", title: "1. 거래처 가입", icon: UserCog },
  { id: "login", title: "2. 로그인", icon: LogIn },
  { id: "forgot", title: "3. 비밀번호 재설정", icon: KeyRound },
  { id: "order", title: "4. 원두 발주", icon: ShoppingBag },
  { id: "orders", title: "5. 주문 내역 확인", icon: ClipboardList },
  { id: "edit", title: "6. 주문 수정", icon: Pencil },
  { id: "cancel", title: "7. 주문 취소", icon: X },
  { id: "account", title: "8. 내 정보 변경", icon: UserCog },
  { id: "faq", title: "9. 자주 묻는 질문", icon: HelpCircle },
];

function Anchor({ id }: { id: string }) {
  return <div id={id} className="-mt-20 pt-20" />;
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-8 font-display text-lg font-semibold text-foreground">{children}</h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 leading-relaxed text-foreground/85">{children}</p>;
}

function Tip({ children, variant = "tip" }: { children: React.ReactNode; variant?: "tip" | "warn" | "note" }) {
  const styles = {
    tip: "border-l-4 border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
    warn: "border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/30",
    note: "border-l-4 border-l-sky-500 bg-sky-50 dark:bg-sky-950/30",
  }[variant];
  const label = { tip: "TIP", warn: "주의", note: "참고" }[variant];
  return (
    <div className={`mt-4 rounded-r-md px-4 py-3 text-sm leading-relaxed text-foreground/85 ${styles}`}>
      <span className="mr-2 inline-block rounded bg-foreground px-1.5 py-0.5 font-ui text-[10px] font-bold uppercase tracking-wider text-background">
        {label}
      </span>
      {children}
    </div>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="mt-4 space-y-3">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground font-ui text-xs font-bold text-background">
            {i + 1}
          </span>
          <div className="flex-1 leading-relaxed text-foreground/85">{it}</div>
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 leading-relaxed text-foreground/85">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/60" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Help() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <div className="mx-auto max-w-[1100px] px-5 py-10 sm:px-10 sm:py-14">
        {/* 헤더 */}
        <div className="flex flex-col gap-4 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Badge variant="outline" className="mb-3 font-ui text-[10px] uppercase tracking-[0.14em]">
              사용 안내
            </Badge>
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              니트커피 거래처 도움말
            </h1>
            <p className="mt-2 max-w-xl leading-relaxed text-muted-foreground">
              가입부터 발주, 주문 관리, 내 정보 변경까지 — 사용에 필요한 모든 안내를 모아둔 곳이에요.
            </p>
          </div>
          <Button asChild size="lg" className="shrink-0" data-testid="button-download-pdf">
            <a href="/knit_wholesale_manual.pdf" download>
              <Download className="mr-2 h-4 w-4" />
              PDF 매뉴얼 다운로드
            </a>
          </Button>
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[220px_1fr]">
          {/* 사이드 목차 (데스크탑) */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-1">
              <div className="mb-3 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                목차
              </div>
              {sections.map((s) => {
                const Icon = s.icon;
                return (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {s.title}
                  </a>
                );
              })}
            </div>
          </aside>

          {/* 본문 */}
          <article className="space-y-14">
            {/* 모바일 목차 */}
            <Card className="p-5 lg:hidden">
              <div className="mb-3 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                목차
              </div>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="rounded px-2 py-1.5 text-sm text-foreground/85 hover:bg-muted"
                  >
                    {s.title}
                  </a>
                ))}
              </div>
            </Card>

            {/* 1. 가입 */}
            <section>
              <Anchor id="register" />
              <H2>1. 거래처 가입</H2>
              <P>
                니트커피 도매 사이트는 <b>거래처 등록 후</b> 사용하실 수 있어요. 회원가입 페이지에서 직접 등록하시거나,
                니트커피로 연락 주시면 도와드릴게요.
              </P>

              <H3>가입 페이지에서 입력하는 정보</H3>
              <Bullets
                items={[
                  <><b>상호명</b> · 카페/매장 이름 (로그인 ID로도 사용해요)</>,
                  <><b>대표자/담당자명</b> · 실제 연락 가능한 분</>,
                  <><b>연락처</b> · 휴대폰 번호</>,
                  <><b>이메일</b> · 1개만 등록해요. 비밀번호 재설정 시 사용돼요</>,
                  <><b>사업자등록번호</b> · 세금계산서 발행용 (선택)</>,
                  <><b>기본 배송지</b> · 발주 시 자동으로 입력돼요</>,
                  <><b>비밀번호</b> · 6자 이상</>,
                ]}
              />
              <Tip>
                결제 방식 같은 별도 설정은 없어요. 가입 후 첫 발주 시 사장님이 거래 조건을 확인해 드려요.
              </Tip>
            </section>

            {/* 2. 로그인 */}
            <section>
              <Anchor id="login" />
              <H2>2. 로그인</H2>
              <P>로그인 페이지에서 <b>상호명</b>과 <b>비밀번호</b>를 입력하면 돼요.</P>
              <Steps
                items={[
                  <>주소창에 사이트 URL 입력 → 로그인 화면 자동 표시</>,
                  <>가입할 때 입력한 <b>상호명</b> 입력 (예: 테스트카페)</>,
                  <><b>비밀번호</b> 입력 후 <b>로그인</b> 버튼 클릭</>,
                  <>로그인 성공 시 <b>원두 카탈로그</b> 화면이 열려요</>,
                ]}
              />
              <Tip variant="note">
                상호명이 기억나지 않으면 니트커피(knitcoffee00@gmail.com)로 연락 주세요.
              </Tip>
            </section>

            {/* 3. 비번 재설정 */}
            <section>
              <Anchor id="forgot" />
              <H2>3. 비밀번호 재설정</H2>
              <P>비밀번호를 잊으셨다면 가입할 때 등록한 이메일로 재설정할 수 있어요.</P>
              <Steps
                items={[
                  <>로그인 화면에서 <b>비밀번호를 잊으셨나요?</b> 클릭</>,
                  <>가입할 때 등록한 <b>이메일 주소</b> 입력 → <b>재설정 메일 보내기</b></>,
                  <>이메일 받은 편지함 확인 → 메일 안의 <b>재설정 링크</b> 클릭</>,
                  <>새 비밀번호 입력 (6자 이상) → <b>비밀번호 변경</b></>,
                  <>변경된 비밀번호로 다시 로그인</>,
                ]}
              />
              <Tip variant="warn">
                재설정 링크는 <b>발송 후 1시간 동안만</b> 유효해요. 메일이 안 보이면 스팸함도 확인해 보세요.
              </Tip>
            </section>

            {/* 4. 발주 */}
            <section>
              <Anchor id="order" />
              <H2>4. 원두 발주</H2>
              <P>로그인 후 카탈로그에서 원두를 골라 장바구니에 담고 주문하면 돼요.</P>

              <H3>4-1. 카탈로그에서 원두 고르기</H3>
              <Bullets
                items={[
                  <>상단 메뉴의 <b>Catalog</b> 클릭 → 전체 원두 목록 표시</>,
                  <>각 카드에는 <b>이름, 가격(kg당), 가공방식, 컵노트</b> 등이 표시돼요</>,
                  <>이름을 클릭하면 <b>상세 페이지</b>에서 더 자세한 정보를 볼 수 있어요</>,
                ]}
              />

              <H3>4-2. 출고 방식 · 수량 선택</H3>
              <Bullets
                items={[
                  <><b>출고 방식</b>: 홀빈(원두 통째) / 분쇄(주문 시 그라인딩) 중 선택</>,
                  <>분쇄 선택 시 <b>분쇄도</b> 추가 선택 (에스프레소, 핸드드립, 프렌치프레스 등)</>,
                  <><b>수량</b>: 1kg 단위로 입력 (기본 1)</>,
                  <><b>장바구니 담기</b> 클릭</>,
                ]}
              />
              <Tip>
                분쇄 출고는 <b>주문 받은 후 당일 분쇄</b>해서 보내드려요. 신선한 상태로 받아보실 수 있어요.
              </Tip>

              <H3>4-3. 장바구니 확인 · 주문서 작성</H3>
              <Bullets
                items={[
                  <>우측 상단 <b>장바구니 아이콘</b> 클릭</>,
                  <>품목별 수량 조정 / 삭제 가능</>,
                  <><b>배송지</b>는 내 정보에 등록된 기본 배송지로 자동 입력 (변경 가능)</>,
                  <><b>요청 사항</b>: 자유롭게 입력 (예: "오전 도착 부탁드려요")</>,
                  <>퀵 요청 체크박스로 <b>착불 요청 / 카카오톡 안내</b> 등 선택 가능</>,
                ]}
              />

              <H3>4-4. 주문 확정 · 입금</H3>
              <Steps
                items={[
                  <>장바구니에서 <b>주문하기</b> 클릭</>,
                  <>최종 금액 확인 (부가세 별도 표시될 수 있어요)</>,
                  <>아래 계좌로 입금</>,
                ]}
              />
              <Card className="mt-4 bg-muted/40 p-4">
                <div className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  입금 계좌
                </div>
                <div className="mt-1 font-mono text-sm font-semibold text-foreground">
                  국민은행 098937-04-011092
                </div>
                <div className="text-sm text-foreground/85">예금주: 이강민(니트커피)</div>
              </Card>
              <Tip variant="note">
                주문 확정 후 <b>1~2영업일 내</b> 출고돼요. 입금 확인이 늦어지면 출고도 지연될 수 있어요.
              </Tip>
            </section>

            {/* 5. 주문 내역 */}
            <section>
              <Anchor id="orders" />
              <H2>5. 주문 내역 확인</H2>
              <P>상단 메뉴의 <b>Orders</b>에서 지난 주문을 모두 확인할 수 있어요.</P>
              <Bullets
                items={[
                  <><b>검색</b>: 주문번호 / 품목명으로 검색</>,
                  <><b>상태 필터</b>: 접수됨 · 준비중 · 출고완료 · 취소 등</>,
                  <><b>기간 필터</b>: 최근 1개월 / 3개월 / 6개월 / 전체</>,
                  <>주문을 클릭하면 <b>주문 상세</b>로 이동</>,
                ]}
              />

              <H3>주문 상세에서 할 수 있는 것</H3>
              <Bullets
                items={[
                  <><b>거래명세서 보기</b> · 인쇄 가능한 명세서 페이지 열림</>,
                  <><b>주문 수정</b> · "접수됨" 상태일 때만 가능</>,
                  <><b>주문 취소</b> · "접수됨" 상태일 때만 가능</>,
                ]}
              />
            </section>

            {/* 6. 주문 수정 */}
            <section>
              <Anchor id="edit" />
              <H2>6. 주문 수정</H2>
              <P><b>"접수됨" 상태</b>의 주문만 수정할 수 있어요. 출고 준비가 시작되면 수정이 막혀요.</P>
              <Steps
                items={[
                  <>Orders에서 수정할 주문 클릭 → 주문 상세 진입</>,
                  <>우측 상단 <b>주문 수정</b> 버튼 클릭</>,
                  <>수량 조정 / 품목 삭제 / 요청 사항 변경</>,
                  <><b>저장</b> 클릭 → 변경 내용 반영</>,
                ]}
              />
              <Tip variant="warn">
                상태가 <b>"준비중"</b>으로 바뀌면 수정 버튼이 사라져요. 급하게 변경이 필요하면 니트커피로 바로 연락 주세요.
              </Tip>
            </section>

            {/* 7. 주문 취소 */}
            <section>
              <Anchor id="cancel" />
              <H2>7. 주문 취소</H2>
              <P>이것도 <b>"접수됨" 상태</b>일 때만 가능해요.</P>
              <Steps
                items={[
                  <>Orders → 취소할 주문 클릭</>,
                  <>우측 상단 <b>주문 취소</b> 버튼 클릭</>,
                  <>취소 사유 간단히 입력 → 확인</>,
                  <>이미 입금하신 경우 환불 받을 계좌 알려주세요</>,
                ]}
              />
            </section>

            {/* 8. 내 정보 */}
            <section>
              <Anchor id="account" />
              <H2>8. 내 정보 변경</H2>
              <P>우측 상단 <b>사람 아이콘</b> 클릭 → 내 정보 페이지로 이동해요.</P>

              <H3>거래 잔액</H3>
              <P>
                상단에 <b>누적 청구 / 누적 입금 / 잔액</b>이 표시돼요. 잔액이 마이너스(미수)면 미입금된 금액이 있다는 뜻이에요.
              </P>

              <H3>기본 정보 변경 (변경 가능)</H3>
              <Bullets
                items={[
                  <>상호명, 담당자명, 연락처, 사업자등록번호, 기본 배송지</>,
                  <>비밀번호 변경 (현재 비밀번호 → 새 비밀번호)</>,
                ]}
              />

              <H3>변경 불가</H3>
              <Bullets
                items={[
                  <>가입 시 등록한 <b>로그인 이메일</b>은 직접 변경할 수 없어요. 변경이 필요하면 니트커피로 연락 주세요.</>,
                ]}
              />

              <H3>세금계산서 이메일 (별도 관리)</H3>
              <P>
                세금계산서 발행 시 받을 이메일은 <b>가입 이메일과 따로 설정</b>할 수 있어요. 회계 담당자 메일로 받고 싶을 때 유용해요.
              </P>
              <Tip>
                세금계산서 이메일을 비워두면 가입 이메일로 발행돼요.
              </Tip>
            </section>

            {/* 9. FAQ */}
            <section>
              <Anchor id="faq" />
              <H2>9. 자주 묻는 질문</H2>

              <div className="mt-5 space-y-5">
                {[
                  {
                    q: "최소 주문 수량이 있나요?",
                    a: "원두는 1kg부터 주문 가능해요.",
                  },
                  {
                    q: "분쇄해서 보내주실 수 있나요?",
                    a: "네, 출고 방식에서 '분쇄' 선택 후 분쇄도를 골라주세요. 주문 받은 후 당일 분쇄해서 보내드려요.",
                  },
                  {
                    q: "배송은 얼마나 걸리나요?",
                    a: "주문·입금 확인 후 보통 1~2영업일 내 출고돼요. 지역에 따라 추가 1~2일 소요될 수 있어요.",
                  },
                  {
                    q: "택배비는요?",
                    a: "기본 선불이며, 장바구니에서 '착불 요청'을 체크하면 착불로 변경돼요.",
                  },
                  {
                    q: "세금계산서는 자동 발행되나요?",
                    a: "네, 매월 정해진 날짜에 일괄 발행돼요. 세금계산서 이메일을 따로 설정해두시면 그쪽으로 받아보실 수 있어요.",
                  },
                  {
                    q: "주문을 잘못했어요, 어떻게 하죠?",
                    a: "'접수됨' 상태면 주문 상세에서 직접 수정/취소 가능해요. '준비중' 이후라면 니트커피로 바로 연락 주세요.",
                  },
                  {
                    q: "비밀번호를 자주 잊어버려요.",
                    a: "로그인 화면의 '비밀번호를 잊으셨나요?' 링크로 언제든 재설정할 수 있어요. 가입 이메일이 살아있어야 해요.",
                  },
                  {
                    q: "여러 매장이 있는데 한 계정으로 써도 되나요?",
                    a: "가능은 하지만, 매장별 계정 분리를 권장해요. 배송지/잔액 관리가 깔끔해져요.",
                  },
                  {
                    q: "원두 외 다른 제품도 살 수 있나요?",
                    a: "현재는 원두 위주이지만, 부자재/장비 문의는 니트커피로 직접 연락 주세요.",
                  },
                  {
                    q: "문의는 어디로 하나요?",
                    a: (
                      <>
                        이메일{" "}
                        <a
                          href="mailto:knitcoffee00@gmail.com"
                          className="underline decoration-foreground/40 underline-offset-2 hover:decoration-foreground"
                        >
                          knitcoffee00@gmail.com
                        </a>
                        {" "}로 보내주시면 가장 빨라요.
                      </>
                    ),
                  },
                ].map((item, i) => (
                  <div key={i} className="border-b border-border pb-4 last:border-0">
                    <div className="font-display text-base font-semibold text-foreground">
                      Q. {item.q}
                    </div>
                    <div className="mt-1.5 leading-relaxed text-foreground/85">A. {item.a}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* 푸터 안내 */}
            <Card className="mt-10 bg-muted/30 p-6">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div className="font-display text-base font-semibold text-foreground">
                      인쇄해두고 보고 싶으세요?
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    스크린샷이 포함된 14페이지 PDF 매뉴얼을 받으실 수 있어요.
                  </p>
                </div>
                <Button asChild variant="outline" data-testid="button-download-pdf-footer">
                  <a href="/knit_wholesale_manual.pdf" download>
                    <Download className="mr-2 h-4 w-4" />
                    PDF 다운로드
                  </a>
                </Button>
              </div>
            </Card>
          </article>
        </div>
      </div>
    </div>
  );
}
