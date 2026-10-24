# 주문 최종 확인 v4 — 로컬 구현·검증

기준: `3e0748970e5770b3e31fb9bbedfc20940dfe2c5e`.
작업 브랜치: `codex/order-confirmation-v4`. 아래 내용은 배포 전 검증 기록이며, 검증 완료 후 사용자가 이번 변경의 운영 배포를 명시적으로 승인했다.
별도 빈 작업 공간에 복제했으며 기존 사용자 체크아웃을 수정하지 않음.
AGENTS.md는 없었고 CLAUDE.md의 작업/운영/격리 테스트 지침을 읽고 적용함.

## 구현

- 장바구니 → 서버 검증 → 주문 최종 확인 → CONFIRM ORDER.
- 상품명 18px, 수량 21px, `3 EA` 형식. 정상 가격·재고 배지와 최종 동의 체크박스 없음.
- 배송지·연락처·요청사항·퀵 요청·수량·공급가·VAT·최종 금액 표시.
- 고객 신규 주문의 희망 배송일 입력 및 제출 제거. DB 컬럼, 관리자 기능, 기존 주문의 희망 배송일 보존.
- `/api/orders/preview`는 최신 거래처별 단가/기본가, 판매 가능 여부, 상품 최소수량 및 당일 기존 주문을 합한 원두 5kg 정책을 검증. 쓰기·발송 없음.
- 서버 확인 revision은 최신 품목/금액, 배송정보, 요청사항, 합칠 기존 주문 전체 상태를 포함. 최종 POST에서 다시 계산하여 불일치하면 409로 거절.
- SQLite IMMEDIATE 트랜잭션 안에서 최신 확인과 주문 저장을 동기적으로 수행. 저장 후 기존 알림 코드가 실행되는 구조 유지. 새 결제/발송 연동 없음.
- 당일 pending 합치기 유지. 샘플·음수 주문·다른 날짜는 제외. 기존 할인과 VAT 반올림, 메모 이어붙이기, 퀵 OR 병합, 기존 희망 배송일 유지.
- 기존 주문과 새 단가가 다르면 기존 수량/단가는 유지하고 새 수량을 별도 가격 행으로 같은 주문에 추가. 기존 코드의 ‘새 수량까지 과거 단가로 저장’ 문제를 제거. 확인 요약은 합쳐진 최종 청구액이며 기존 행도 보여줌.
- 합쳐지는 pending 주문의 배송/연락처 스냅샷은 이번에 확인한 정보와 일치하도록 저장. 완료 주문은 건드리지 않음.
- 기존 고객 POST의 거래처별 단가/기본가 정책을 그대로 보존. 매장 계정 가격 정책의 별도 불일치는 이 범위에서 재설계하지 않음.

## 변경 파일

운영 코드 4개:
- `client/src/pages/Cart.tsx`
- `client/src/components/OrderConfirmation.tsx` (신규)
- `server/routes.ts`
- `server/order-confirmation.ts` (신규)

검증/설명:
- `script/tests/order-confirmation.test.ts`
- `script/tests/order-confirmation.browser.ts`
- `docs/order-confirmation-v4.md`

## 검증 결과

- 프로덕션 클라이언트/서버 빌드 통과 (`node --import tsx script/build.ts`, npm build와 동일한 build script). 기존 PostCSS/chunk-size 경고 있음.
- TypeScript 기준 커밋 36개 → 변경 후 35개, 신규 오류 0개. CLAUDE.md의 31개 기준선은 실제 현재 기준 커밋과 다름. 전체 typecheck는 기존 오류 때문에 실패하므로 ‘전체 통과’로 표현하지 않음.
- 격리 SQLite 서비스 테스트: 14개 시나리오 그룹 통과 (최초 12개 + 검토 후 2개 추가). preview 무쓰기, 오래된 클라이언트 차단, 최소수량, 거래처 단가/재변경, 품절/삭제, 주소 누락, 연락처/메모 변경, 정확한 금액 저장, 합치기/할인/VAT/기록 보존, 합칠 주문 변경/재제출 거절, 샘플/음수/과거 제외, 중복 상품 검증, 비정상 수량/금액 범위, 완료·취소 후 확인값 재사용 차단.
- 실제 Chrome + 빌드된 React + 가상 Express API + 격리 SQLite: 데스크톱 1440×1050, 모바일 390×844 통과. 정상 화면, 가격 재변경 차단/장바구니 보존, 변경 가격 재확인 전 버튼 차단, 재확인 후 저장, 주소 누락/기존 계정 수정 경로, 문구/정렬/가로 넘침 검증. JS pageerror 없음.
- `git diff --check` 통과.
- DB는 테스트마다 OS 임시 디렉터리에 새로 생성. 전체 운영 서버/seed/자동화/알림 모듈은 실행하지 않음. 브라우저는 localhost 이외 요청을 차단. 운영 DB·실제 주문·문자·메일·알림톡·결제·공급처 API 호출 없음. 비밀값/.env 내용 열람 없음.

## 재현

Node 22와 잠금 파일 의존성 필요. 테스트용 SQLite 네이티브 모듈이 준비되어 있어야 함.

```sh
node --import tsx script/tests/order-confirmation.test.ts
node --import tsx script/build.ts
PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs CHROME_PATH='/path/to/chrome' node --import tsx script/tests/order-confirmation.browser.ts
node node_modules/typescript/bin/tsc --noEmit
```

브라우저 테스트의 API 어댑터는 실제 주문 서비스 함수를 사용하지만 운영 알림·세션 미들웨어를 로드하지 않는다. 실제 알림/로그인/배포 환경 통합 검증은 이번 결과에 포함되지 않는다. 테스트 fixture 금액은 테스트 코드에만 있으며 운영 UI에는 예시 금액 하드코딩이 없다.

## 스크린샷

`artifacts/order-confirmation/comparison.html`에서 전후 비교. 모든 이름/연락처/주소/가격은 테스트 fixture.
`desktop-before.png`, `mobile-before.png`는 기준 커밋의 실제 장바구니.
`desktop-confirmation.png`, `mobile-confirmation.png`는 변경 후 실제 확인 화면.
모바일 비교용 전체 화면은 촬영 중에만 고정 하단 탭을 숨겨 본문 가림을 제거. 실제 상단/요청사항/주문요약 뷰포트는 탭을 그대로 표시하여 별도 제공.
가격 변경·배송지 누락 상태도 별도 PNG로 제공.

## 제한 및 배포 전 확인

- 승인된 v4의 텍스트 조건을 구현했으며 원본 v4 이미지 파일은 전달받지 못해 픽셀 단위 비교는 못 함. 실화면 시각 확인 필요.
- 새 revision 없는 예전 클라이언트의 주문은 안전하게 409 차단됨. 향후 배포 시 클라이언트와 서버를 함께 반영하고 오래 열린 화면은 새로고침 필요.
- 외부 폰트 요청도 테스트에서 차단됨. 실제 서비스의 폰트 렌더와 차이가 날 수 있음.
- 실제 로그인·알림·결제·공급처/운영 DB 연결 테스트는 하지 않았음. 보안/키/세션 재설계는 범위 밖.
- 새 서버는 응답 유실 후 같은 revision 재전송을 막지만, 사용자가 새 preview를 받은 후 의도적으로 다시 주문하면 추가 주문으로 처리됨. 별도 영구 idempotency 설계는 포함하지 않음.

## 되돌리기

DB 마이그레이션 없음. 운영 반영 시 코드만 이전 배포로 되돌릴 수 있음.
로컬에서는 운영 코드 4개만 기준 커밋 상태로 복원(기존 2개 복원, 신규 2개 제거)하면 됨. 사용자 추가 변경이 생겼다면 무조건 reset/삭제하지 말고 해당 패치만 되돌릴 것.
향후 승인 배포 후에는 이전 배포 SHA로 되돌릴 수 있음. 이미 접수된 정상 주문 기록은 삭제하지 않음.


## 구현 후 별도 검토 패스 (2026-10-24)

범위: 확인 후 가격 재변경, 구 클라이언트, 중복 요청, 당일 병합, 입력 숫자 범위, 공백 주소, 테스트 외부 부작용.
별도 구현 후 재검토이며 다른 사람/에이전트가 수행한 검토로 주장하지 않음.

발견 및 수정:
1. 수량의 유한성만 확인하던 부분을 양의 안전한 정수로 강화. 소수/0/음수/NaN/Infinity/안전 정수 초과 및 금액 곱셈·합계의 안전 범위 초과를 거절. 고객 EA 주문에 한정하며 관리자 주문 수정 규칙은 그대로 유지.
2. 최초 주문 생성 후 해당 주문이 done/cancelled로 바뀌면 원래 확인값과 같은 상태가 재현될 가능성을 제거. 확인 revision에 거래처 주문 ID 목록을 포함하여 생성 이후 상태 변화에도 예전 확인값 재사용 거절.
3. 브라우저의 실제 HTTP 동시 2회 제출 테스트 추가: [200,409], DB 주문 1건. 모바일/데스크톱 모두 통과.
4. 빈 문자열, 스페이스/줄바꿈/탭, 전각 공백 배송지 모두 차단 검증.

기존 12개 테스트 이름 및 범위:
1. preview is read-only; latest amounts and VAT — 쓰기 없이 서버 금액/VAT 계산.
2. missing revision blocks old clients without creating orders — 구 클라이언트 409, 생성 없음; 업데이트/새로고침 필요.
3. bean minimum and product minimum — 합산 원두 5kg와 개별 상품 최소수량.
4. customer price change detected; re-change blocks commit — 거래처 단가 변화 표시, 확인 이후 재변경 차단, VAT 반올림.
5. sold out and deleted product fail closed — 판매 중지와 존재하지 않는 상품.
6. missing address can preview but cannot commit — 공백 주소 확인화면 표시 및 저장 차단.
7. delivery and notes changes invalidate confirmation — 연락처/메모 변화 시 이전 확인 무효화.
8. fresh quote stores exactly reviewed total — 확인된 총액/퀵/신규 배송일 저장값 일치.
9. same-day merge keeps previous price, discount, date, note and quick — 기존 가격 유지와 최신 가격 행 추가, 할인·VAT·배송일·메모·퀵 보존.
10. merge target changes and replay are rejected — 병합 대상 변화 및 같은 확인값 재전송 거절.
11. sample, negative-line and non-today orders are excluded from merge — 샘플/차감/과거 주문 제외 및 최소수량 적용.
12. duplicate product cannot bypass minimum — 동일 상품 중복 행 거절.

추가 테스트:
13. invalid quantities and unsafe amounts cannot create orders.
14. original confirmation cannot replay after order completion or cancellation.

빌드 재통과, 서비스 14개 재통과, 실제 브라우저 두 화면 재통과. TypeScript 36→35 유지. 진단 문자열의 객체 속성 순서가 변한 부분은 파일/TS 코드 및 원인으로 대조했으며 새 오류 없음.
외부 발송은 테스트에 생산 routes/index/automation/notification 모듈을 로드하지 않는 구조로 차단하며, 브라우저의 localhost 이외 URL도 차단. 실제 운영 알림 전송 테스트를 수행했다는 의미는 아님.

Library 업로드 5건 성공. 정확한 식별자는 `artifacts/order-confirmation/library-deliverables.json`에 기록.


## 승인 버튼 형태 수정 및 모바일 캡처 확인

- CONFIRM ORDER 버튼 하나에만 `rounded-none` 적용. 글로벌 버튼·헤더·하단 탭 수정 없음.
- 실제 computed style 검증: borderRadius 0px, justifyContent center, alignItems center (모바일·데스크톱).
- 전체 페이지 캡처의 중간 탭은 viewport에 고정된 요소가 full-page 이미지에도 그 좌표로 찍히는 캡처 특성. 실제 뷰포트에서 요청사항을 스크롤해 표시할 수 있으며 확정 버튼도 탭 위에 온전히 나타남을 bounding box와 elementFromPoint로 검증.
- 비교용 모바일 full-page 촬영에만 Playwright screenshot style로 하단 탭 visibility:hidden 적용. 앱 CSS/DOM의 지속 변경 없음. 실제 뷰포트 스크린샷은 스타일 변경 없이 촬영.
- 빌드 및 격리 DB 14개 시나리오, 모바일·데스크톱 브라우저 흐름 재통과. 생산 서비스 미접속, 배포/push/merge 없음.
- 기존 Library 이미지 5개를 버전 1로 교체하고, 실제 모바일 상단·요청사항 뷰포트 2개를 추가. 현재 첨부 식별자는 library-deliverables.json 참조.
