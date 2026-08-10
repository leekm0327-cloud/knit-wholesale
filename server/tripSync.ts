// server/tripSync.ts — 여행 플래너 동기화 라우터
// knit-wholesale 프로젝트 규격에 맞춤: ESM + TypeScript
// 기존 코드는 건드리지 않고, 이 파일 추가 + routes.ts 에 2줄 등록만 하면 됩니다.

import { Router, json, type RequestHandler } from "express";

export type TripRow = {
  rev: number;
  data: string;          // JSON 문자열
  updated_at: string;    // ISO
  updated_by: string;
};

/** 어떤 DB를 쓰든 이 두 개만 구현하면 됩니다. (Postgres/Supabase/SQLite 무관) */
export interface TripStore {
  get(id: string): Promise<TripRow | null>;
  put(id: string, row: TripRow): Promise<void>;
}

const ID = "au2026";

export function createTripSyncRouter(opts: { store: TripStore; auth?: RequestHandler }) {
  const { store, auth } = opts;
  const router = Router();

  // 이 라우터 전용 JSON 파서. 앱 전역 파서가 기본값(100kb)이어도 여기서는 넉넉하게 받습니다.
  router.use(json({ limit: "2mb" }));

  // 접근 제어 — 기존 로그인 미들웨어를 넘기는 걸 권장.
  // 없으면 환경변수 TRIP_TOKEN 을 X-Trip-Token 헤더 또는 ?t= 로 검사합니다.
  const guard: RequestHandler =
    auth ??
    ((req, res, next) => {
      const need = process.env.TRIP_TOKEN;
      if (!need) return next();
      const got = req.get("X-Trip-Token") ?? (req.query.t as string | undefined);
      if (got === need) return next();
      res.status(401).json({ error: "unauthorized" });
    });
  router.use(guard);

  // 바뀌었는지만 확인 (5초마다 폴링, 응답 30바이트 내외)
  router.get("/trip/rev", async (_req, res, next) => {
    try {
      const row = await store.get(ID);
      res.json({
        rev: row?.rev ?? 0,
        updated_at: row?.updated_at ?? null,
        updated_by: row?.updated_by ?? null,
      });
    } catch (e) { next(e); }
  });

  // 전체 내려받기
  router.get("/trip", async (_req, res, next) => {
    try {
      const row = await store.get(ID);
      if (!row) return res.json({ rev: 0, data: null, updated_at: null, updated_by: null });
      res.json({
        rev: row.rev,
        data: JSON.parse(row.data),
        updated_at: row.updated_at,
        updated_by: row.updated_by,
      });
    } catch (e) { next(e); }
  });

  // 저장. body = { rev, data, by, force? }
  // rev 가 서버와 다르면 409 + 서버 최신본을 함께 돌려줍니다 (덮어쓰기 사고 방지).
  router.put("/trip", async (req, res, next) => {
    try {
      const { rev, data, by, force } = (req.body ?? {}) as {
        rev?: number; data?: unknown; by?: string; force?: boolean;
      };
      if (!data || typeof data !== "object") {
        return res.status(400).json({ error: "data required" });
      }
      const cur = await store.get(ID);
      const curRev = cur?.rev ?? 0;
      if (!force && typeof rev === "number" && rev !== curRev) {
        return res.status(409).json({
          error: "conflict",
          rev: curRev,
          data: cur ? JSON.parse(cur.data) : null,
          updated_at: cur?.updated_at ?? null,
          updated_by: cur?.updated_by ?? null,
        });
      }
      const next_: TripRow = {
        rev: curRev + 1,
        data: JSON.stringify(data),
        updated_at: new Date().toISOString(),
        updated_by: String(by ?? "unknown").slice(0, 40),
      };
      await store.put(ID, next_);
      res.json({ ok: true, rev: next_.rev, updated_at: next_.updated_at, updated_by: next_.updated_by });
    } catch (e) { next(e); }
  });

  return router;
}

/* ------------------------------------------------------------------ */
/* 저장소 어댑터 — 실제로 쓰는 DB에 맞는 것 하나만 고르세요            */
/* ------------------------------------------------------------------ */

/** (A) better-sqlite3 — 이미 의존성에 있습니다.
 *  ⚠️ SQLite 파일이 Railway 영구 볼륨 위에 있어야 합니다. 아니면 배포 때마다 초기화됩니다. */
export function sqliteTripStore(db: any): TripStore {
  db.exec(`CREATE TABLE IF NOT EXISTS trip_state (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    rev INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  )`);
  const sel = db.prepare("SELECT * FROM trip_state WHERE id = ?");
  const ups = db.prepare(`INSERT INTO trip_state (id,data,rev,updated_at,updated_by)
    VALUES (@id,@data,@rev,@updated_at,@updated_by)
    ON CONFLICT(id) DO UPDATE SET
      data=@data, rev=@rev, updated_at=@updated_at, updated_by=@updated_by`);
  return {
    async get(id) { return sel.get(id) ?? null; },
    async put(id, row) { ups.run({ id, ...row }); },
  };
}

/** (B) Supabase / Postgres — 실제 데이터가 여기 있다면 이쪽을 쓰세요.
 *  먼저 테이블을 한 번 만들어 두세요:
 *
 *    create table if not exists trip_state (
 *      id text primary key,
 *      data jsonb not null,
 *      rev integer not null default 0,
 *      updated_at timestamptz not null default now(),
 *      updated_by text
 *    );
 */
export function supabaseTripStore(supabase: any): TripStore {
  return {
    async get(id) {
      const { data, error } = await supabase
        .from("trip_state").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        rev: data.rev,
        data: typeof data.data === "string" ? data.data : JSON.stringify(data.data),
        updated_at: data.updated_at,
        updated_by: data.updated_by ?? "",
      };
    },
    async put(id, row) {
      const { error } = await supabase.from("trip_state").upsert({
        id,
        data: JSON.parse(row.data),
        rev: row.rev,
        updated_at: row.updated_at,
        updated_by: row.updated_by,
      });
      if (error) throw error;
    },
  };
}
