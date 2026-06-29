# Knit Coffee 도매 발주 시스템

니트커피 거래처 도매 주문 관리 시스템

## 환경변수 (Railway에 설정 필요)

| 변수명 | 설명 |
|---|---|
| `SESSION_SECRET` | 세션 암호화 키 |
| `CRON_TOKEN` | 크론 호출 인증 토큰 |
| `SMTP_USER` | 알림 메일 발송 계정 |
| `SMTP_PASS` | 메일 앱 비밀번호 |
| `NOTIFY_TO` | 관리자 알림 받을 이메일 |
| `ECOUNT_SECRET` | ECOUNT 연동 시크릿 |
| `BUILD_API_BASE` | `/` (또는 빈값) — Railway 환경 |
| `PORT` | Railway가 자동 주입 |

## 빌드 / 실행

```bash
npm ci
npm run build
node dist/index.cjs
```
