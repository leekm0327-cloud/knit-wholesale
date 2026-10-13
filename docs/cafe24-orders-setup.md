# 카페24 자사몰 주문 조회 연결

## 구현 범위
- 관리자 → 영업 · 거래처 → 자사몰 주문 (`/#/admin/cafe24-orders`).
- 관리자(Owner/Manager)만 주문·배송정보 조회. 카페24 연결 승인은 Owner 전용.
- 주문일/주문번호/상품상태 조회, 50건 페이지, 주문상품/옵션/수량/결제 여부/결제금액.
- 배송지·연락처·배송 요청, 여러 수령인과 나눔 배송, 기존 송장번호/배송 상태.
- 주문/배송 조회만 구현. 주문 상태 수정·송장 입력·매출 장부 반영은 없음.
- 조회 결과는 필요할 때 카페24에서 읽고 DB에 주문·고객정보를 복제하지 않음.
- 접속 토큰만 DB의 `cafe24_connection` 테이블에 AES-256-GCM 암호화 저장.

## 현재 상태
2026-10-13 원격 master `200d033c3501f21fbf9be0338455ba44c4282fb9` 기준 별도 체크아웃에 구현.
운영 사이트 미배포. 카페24 앱 미등록/미연결. 실제 주문 조회는 아직 검증하지 못함.
별도 미리보기와 테스트는 가상 데이터/메모리 DB이며 운영 정보 없음.
이전 디자인 테스트 폴더 및 기존 작업 저장소에는 변경 없음.

## 연결 준비
1. https://developers.cafe24.com 에서 니트커피 쇼핑몰용 앱 등록.
2. 주문 읽기 권한 `mall.read_order`만 요청. 주문 쓰기 권한은 필요 없음.
3. Redirect URI를 정확히 등록:
   `https://wholesale.knitcoffee.co.kr/api/admin/cafe24/callback`
4. 앱에서 발급한 값은 Railway 서버 환경변수에 직접 입력. 채팅/소스/공개 GitHub에 붙여넣지 않음.

| 서버 환경변수 | 값 |
| --- | --- |
| CAFE24_MALL_ID | knitcoffee00 |
| CAFE24_SHOP_NO | 1 |
| CAFE24_CLIENT_ID | 개발자센터에서 발급 |
| CAFE24_CLIENT_SECRET | 개발자센터에서 발급한 비밀키 |
| CAFE24_REDIRECT_URI | 위 Redirect URI |
| CAFE24_TOKEN_KEY | 무작위 32바이트를 base64로 인코딩한 전용 암호화 키 |

CAFE24_TOKEN_KEY는 서버에서 생성하고 안전하게 보관. 키를 바꾸면 저장된 연결 토큰을 읽을 수 없으므로 재연결 필요.
환경변수 미설정 또는 오류 시 기존 도매 기능은 계속 작동하고 자사몰 주문 화면에 준비 안내를 표시.
배포 후 Owner 로그인 → 자사몰 주문 → 카페24 연결 승인. 권한 동의 화면은 운영자가 확인.
OAuth 코드는 1회만 사용하며 세션에 묶인 10분짜리 state를 확인한다.
API 버전은 2026-06-01로 고정. 공식 문서 기준 구현이며 설치 후 쇼핑몰 응답으로 최종 검증 필요.

## 운영 및 검증
- 서버 한 인스턴스 기준으로 동시 토큰 갱신을 합침. 여러 프로세스/replica로 늘리기 전 분산 잠금 필요.
- Access token은 만료 전에 조회 시 갱신. Refresh token이 만료될 정도로 장기간 조회하지 않으면 재승인 안내.
- 배포 후 주문 1건을 카페24 관리자와 비교: 주문번호, 상품, 결제금액, 배송지, 송장.
- 조회 결과 실패를 0건으로 표시하지 않음. 주문정보가 가림/삭제된 경우 빈 정보 그대로 표시.
- 택배사 명칭을 별도 추정하지 않고 제공된 택배사 코드를 표시.
- API 조회 결과는 no-store; 상세 조회 실패 시 전체 성공으로 표시하지 않음.
- 테스트 미리보기 파일(`script/cafe24-preview.ts`, `client/cafe24-preview.html`, `client/src/cafe24-preview.tsx`)은 운영 배포 묶음에서 제외.

## 검증 명령
- `node --import tsx script/tests/cafe24-orders.test.ts` (가짜 API + 메모리 SQLite; 로컬 HTTP 테스트)
- `node --import tsx script/build.ts`
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`
기존 코드의 TS 오류 35건과 비교해 신규 오류 없음. 기존 경고/오류를 통과했다고 표시하지 않음.

## 공식 근거
- 주문 목록: https://apidocs.cafe24.com/en/docs/2026-06-01/admin/get-orders
- 주문 상세: https://apidocs.cafe24.com/en/docs/2026-06-01/admin/get-orders-by-order-id
- 수령인: https://apidocs.cafe24.com/en/docs/2026-06-01/admin/get-orders-by-order-id-receivers
- 배송: https://apidocs.cafe24.com/en/docs/2026-06-01/admin/get-orders-by-order-id-shipments
- OAuth: https://apidocs.cafe24.com/en/docs/guide/oauth2-authentication
