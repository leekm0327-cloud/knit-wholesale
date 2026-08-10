# 여행 플래너 동기화 — knit-wholesale 적용

실제 `server/routes.ts` (3,236줄)를 보고 정확한 위치를 확인했습니다.

---

## 1. 파일 2개 (이미 올리셨다면 **다시** 올려주세요 — 아래 수정 있음)

| 파일 | 위치 |
|---|---|
| `tripSync.ts` | `server/tripSync.ts` |
| `trip.html` | `client/public/trip.html` |

**수정 내용 2가지**
- 라우터 전용 JSON 파서 추가 — 앱 전역 파서가 기본 100kb라 큰 일정이 413으로 막히는 걸 방지
- 서버로 보내는 데이터를 "일정에 쓰인 장소 + 직접 추가한 장소"만으로 축소 (**64KB → 1KB**)

---

## 2. `server/routes.ts` 수정 — 딱 2줄

### ① 맨 위 import 묶음에 한 줄 추가 (8번째 줄 근처)

기존 7~10줄이 이렇게 생겼습니다.

```ts
import { storage, seed, ..., db, DB_PATH } from "./storage";
import { registerBoardRoutes } from "./board-routes";
import { registerStaffRoutes } from "./staff-routes";
import { registerPopupNoticeRoutes } from "./popup-notice";
```

그 아래에 붙이세요.

```ts
import { createTripSyncRouter, sqliteTripStore } from "./tripSync";
```

### ② 파일 맨 끝, `return httpServer;` 바로 위 (3234번째 줄)

기존 3230~3236줄:

```ts
  // ===== Board (게시판) =====
  registerBoardRoutes(app, storage);
  registerStaffRoutes(app, storage);
  registerPopupNoticeRoutes(app);

  return httpServer;          // ← 이 줄 위에 넣습니다
}
```

넣을 줄:

```ts
  // ===== 여행 플래너 동기화 =====
  app.use("/api", createTripSyncRouter({ store: sqliteTripStore(db), auth: requireAuth }));
```

**왜 여기인가**
- `db` 는 이미 위에서 `./storage` 에서 import 되어 있습니다 — 추가 작업 없음
- `requireAuth` 는 177번째 줄에 같은 함수 안에서 정의돼 있어 여기서 바로 씁니다
- `registerRoutes` 안이라 SPA 폴백보다 먼저 등록됩니다 — 순서 문제 없음

---

## 3. 확인

1. 푸시 → Railway 배포 완료 대기
2. **도매 앱부터 확인** — 로그인, 주문, 카탈로그 정상인지
3. `wholesale.knitcoffee.com/trip.html` 접속 → 우측 상단 **초록 `동기화됨 HH:MM`**
4. 일정 하나 추가 → `저장 중…` → `동기화됨`
5. 폰에서 같은 주소 → 이미 들어와 있음

문제가 생기면 Railway 대시보드에서 이전 배포로 롤백.

---

## 4. 기존 일정 옮기기

Netlify 사이트(`mellow-centaur-d9c95a.netlify.app`)에 21개가 있습니다.

1. 거기서 **💾 저장** → JSON 파일
2. `/trip.html` 에서 **📂 불러오기** → 그 파일
3. 자동으로 서버에 올라갑니다

---

## 참고

- **볼륨**: `storage.ts` 가 `db`, `DB_PATH` 를 내보내고 주문 데이터가 그 SQLite에 있습니다.
  주문이 배포 후에도 남아 있다면 볼륨은 이미 붙어 있는 것이니 그대로 쓰시면 됩니다.
- **페이지 자체는 로그인 없이 열립니다.** 일정 데이터(API)는 `requireAuth` 로 막히지만,
  HTML 안에 숙소 주소가 들어 있습니다. 페이지도 막고 싶으면 정적 서빙 대신
  `app.get("/trip.html", requireAuth, (req,res)=>res.sendFile(...))` 로 바꾸세요.
- **한계**: 5초 폴링이라 반영에 몇 초 걸립니다. 둘이 동시에 고치면 덮어쓰지 않고 선택 창이 뜹니다.

## 검증

Express + better-sqlite3 + 전역 `express.json()`(기본 100kb) 환경을 만들어
맥·아이폰 두 브라우저로 확인했습니다. 맥→폰 전달, 폰→맥 자동 반영, 직접 추가한 장소 전달,
전송 크기 1,050 bytes, rev 충돌 409 + 선택 창, 오프라인 후 복구 재전송, TRIP_TOKEN 401 차단.
