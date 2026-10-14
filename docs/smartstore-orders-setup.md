# 스마트스토어 주문 조회 연동

## 현재 범위

- 관리자 `영업 · 거래처 > 스마트스토어 주문` (`/#/admin/smartstore-orders`).
- 결제일 기준 하루, 한국 시간, 상품주문 50건씩 조회. 상품주문번호 직접 상세 조회.
- 최초/잔여 수량과 결제금액, 수령인/연락처/배송지, 배송 메모, 택배사 코드/송장 표시.
- 조회 전용. 발주 확인·발송·취소·환불 API와 자동 폴링은 구현하지 않음.
- 데이터베이스 저장 없음. 인증 토큰은 서버 메모리에만 만료 시각과 함께 저장.
- API 앱이 없어도 메뉴는 동작하며, 미연결을 주문 0건으로 표시하지 않음.

## 2026-10-14 확인된 외부 준비 항목

1. 로그인된 네이버 커머스API센터에는 개발업체 계정이 없음. 가입 화면 계정명 `니트커피` 입력까지 준비. 이용약관/개인정보보호 서약서 필수 동의와 가입은 미제출.
2. Railway 워크스페이스는 Hobby. 공식 문서에 따르면 고정 발신 IPv4는 Pro에서 지원. 확인 화면 Pro 최소 월 $20(사용량 크레딧 포함). 업그레이드와 추가 비용은 승인 전 실행하지 않음.
3. Pro를 선택하면 서비스 Settings > Networking > Enable Static IPs에서 실제 할당 IP 전체를 확인하고 재배포. 네이버에는 웹사이트 DNS/IP가 아니라 이 발신 IP들을 등록.
4. 네이버 내 스토어 애플리케이션을 만들고 니트커피 스토어에 연결. 주문 조회에 필요한 권한 범위를 실제 화면에서 확인 후 승인. 앱 ID/시크릿은 소스·채팅에 저장하지 않음.
5. 아래 환경변수를 Railway web 서비스에 저장하고 배포. 두 값 모두 네이버에서 발급받은 값을 사용. 명령문이나 임의 생성 문자열을 입력하지 않음.

```
NAVER_COMMERCE_CLIENT_ID=<네이버 애플리케이션 ID>
NAVER_COMMERCE_CLIENT_SECRET=<네이버 애플리케이션 시크릿>
```

## 실연결 검증

- 소유자 및 허용 관리자 계정으로 주문 메뉴 열기.
- 실제 결제일을 선택해 목록 조회. 준비됨/연결됨/조회 오류/주문 없음 상태 구분.
- 상품주문번호, 금액/수량, 배송지 및 송장을 스마트스토어센터와 대조.
- 재배포 후 인증 재발급과 조회 확인. IP 변경이 있다면 네이버 허용 목록을 먼저 갱신.
- 고객 주문을 생성하거나 발송 처리하지 않고 기존 주문으로 읽기 검증.
- 실응답에 대한 검증은 아직 하지 못했음. 현재 테스트는 공식 명세와 가상 응답을 사용.

## 검증

- `script/tests/smartstore-orders.test.ts`: 공식 bcrypt 서명 예제, 토큰 동시 발급 방지/만료 갱신, GW.AUTHN 401 재발급 및 재시도 상한, IP/호출량 오류 비밀값 차단, KST 날짜, 상품주문번호 정밀도, 부분취소 잔여 값, 배송 상세, 관리자 권한, 상태변경 API 미호출.
- 기존 `script/tests/cafe24-orders.test.ts` 통과.
- 빌드 통과. 전체 타입 검사는 기존 35개 오류가 동일하며 신규 파일 관련 오류 없음.
- 가상 브라우저 검증: 목록/상태 필터/상품주문번호 검색/상세/미연결/오류, 모바일 390px에서 가로 넘침 없음.
- preview entrypoints 및 cache/node_modules는 배포에 포함하지 않음.

## 공식 문서

- https://apicenter.commerce.naver.com/docs/auth
- https://apicenter.commerce.naver.com/llms/post-v1-oauth2-token.md
- https://apicenter.commerce.naver.com/llms/get-v1-pay-order-seller-product-orders.md
- https://apicenter.commerce.naver.com/llms/post-v1-pay-order-seller-product-orders-query.md
- https://docs.railway.com/networking/static-outbound-ips
- https://github.com/commerce-api-naver/commerce-api/discussions/2252
