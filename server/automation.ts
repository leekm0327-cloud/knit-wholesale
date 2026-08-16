// 자동화 실행기 — 정해진 시각에 스스로 도는 작업들.
//
// 설계 원칙
//  1) 조용히 멈추지 않는다: 모든 실행은 automation_runs 에 기록되고, 실패하면 카카오로 알린다.
//  2) 재시작에 강하다: "하루에 한 번"을 KST 날짜로 판정하므로, 배포로 서버가 내려가 있어
//     예정 시각을 놓쳤더라도 다시 뜬 뒤 그날 안에 따라잡는다.
//  3) 예측 가능하다: 켜는 순간 갑자기 실행되지 않는다. 오늘 몫은 이미 돈 것으로 표시하고
//     내일부터 정시에 돈다. 지금 당장 돌리고 싶으면 화면에서 "지금 실행"을 누른다.
//  4) 앱 흐름을 방해하지 않는다: 자동화가 터져도 예외가 밖으로 새지 않는다.

import fs from "node:fs";
import path from "node:path";
import type { Express, Request, Response, NextFunction } from "express";
import { sqlite, DB_PATH, storage } from "./storage";
import { sendKakaoMemo, isKakaoConfigured } from "./kakao";

const KST = 9 * 60 * 60 * 1000;

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS automation_jobs (
    job_key TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    hour INTEGER NOT NULL DEFAULT 4,
    minute INTEGER NOT NULL DEFAULT 0,
    config TEXT NOT NULL DEFAULT '{}',
    last_run_date TEXT NOT NULL DEFAULT '',
    last_run_at INTEGER NOT NULL DEFAULT 0,
    last_status TEXT NOT NULL DEFAULT '',
    last_message TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS automation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_key TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    trigger TEXT NOT NULL DEFAULT 'schedule',
    message TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_automation_runs_job ON automation_runs (job_key, started_at DESC);
`);

// ===== 시간 도우미 (모든 판정은 한국 시간 기준) =====

function kstNow(): Date {
  return new Date(Date.now() + KST);
}
/** 오늘 날짜 (KST, YYYY-MM-DD) */
function kstToday(): string {
  return kstNow().toISOString().slice(0, 10);
}
/** 자정으로부터 지난 분 (KST) */
function kstMinutes(): number {
  const d = kstNow();
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
/** 파일 이름에 쓸 시각 도장 — YYYYMMDD-HHMM (KST) */
function stamp(): string {
  const d = kstNow();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

// ===== 작업 정의 =====

export type JobConfig = Record<string, unknown>;

type JobDef = {
  key: string;
  name: string;
  /** 화면에 그대로 노출되는 설명 */
  description: string;
  defaultHour: number;
  defaultMinute: number;
  /** 기본 설정값 */
  defaultConfig: JobConfig;
  /** 성공하면 사람이 읽을 결과 한 줄을 돌려준다. 실패하면 예외를 던진다. */
  run: (config: JobConfig) => Promise<string>;
};

// ===== 백업 =====

/** 백업 파일을 모아두는 폴더. DB 와 같은 볼륨 안에 둔다. */
export function backupDir(): string {
  const dir = path.join(path.dirname(DB_PATH), "backups");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * SQLite 온라인 백업.
 *
 * 이 DB 는 WAL 모드로 돌기 때문에 data.db 파일만 복사하면 최근 변경분이 통째로 빠진다.
 * (실제로 확인해 보면 테이블조차 없는 빈 파일이 나오는 경우가 있다.)
 * better-sqlite3 의 backup() 은 WAL 을 포함한 완전한 사본을 만들어 주므로 반드시 이 길로만 만든다.
 * 쓰다 만 파일이 목록에 잡히지 않도록 임시 이름으로 쓴 뒤 마지막에 이름을 바꾼다.
 */
export async function createBackupFile(destPath: string): Promise<number> {
  const tmp = `${destPath}.writing`;
  try {
    await sqlite.backup(tmp);
    fs.renameSync(tmp, destPath);
  } catch (e) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* 임시 파일 정리 실패는 무시 */
    }
    throw e;
  }
  return fs.statSync(destPath).size;
}

export type BackupFile = { name: string; size: number; createdAt: number };

export function listBackups(): BackupFile[] {
  const dir = backupDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".db"))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, size: st.size, createdAt: st.mtimeMs };
    })
    // 이름에 시각이 박혀 있으므로 이름 역순 = 최신 순. 파일을 옮겨 담아 수정시각이
    // 흐트러져도 순서가 흔들리지 않는다.
    .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

/** 최근 keep 개만 남기고 오래된 백업을 지운다. 지운 개수를 돌려준다. */
function pruneBackups(keep: number): number {
  const files = listBackups();
  let removed = 0;
  for (const f of files.slice(Math.max(1, keep))) {
    try {
      fs.unlinkSync(path.join(backupDir(), f.name));
      removed += 1;
    } catch {
      /* 개별 삭제 실패는 넘어간다 */
    }
  }
  return removed;
}

async function runBackupJob(config: JobConfig): Promise<string> {
  const keep = Math.min(60, Math.max(1, Number(config.keep) || 14));
  const name = `knit-backup-${stamp()}.db`;
  const size = await createBackupFile(path.join(backupDir(), name));
  if (size < 4096) throw new Error(`백업 파일이 비정상적으로 작습니다 (${size} bytes).`);
  const removed = pruneBackups(keep);
  const total = listBackups();
  const totalSize = total.reduce((s, f) => s + f.size, 0);
  return `${name} (${mb(size)}MB) 생성. 보관 ${total.length}개 · 합계 ${mb(totalSize)}MB${
    removed > 0 ? ` · 오래된 ${removed}개 정리` : ""
  }`;
}

const JOBS: JobDef[] = [
  {
    key: "backup",
    name: "자동 백업",
    description:
      "매일 정해진 시각에 데이터베이스 사본을 만들어 서버에 보관합니다. 정해진 개수를 넘으면 오래된 것부터 지웁니다.",
    defaultHour: 4,
    defaultMinute: 0,
    defaultConfig: { keep: 14, notify: "fail" },
    run: runBackupJob,
  },
];

function jobDef(key: string): JobDef | undefined {
  return JOBS.find((j) => j.key === key);
}

// ===== 설정 읽기·쓰기 =====

type JobRow = {
  job_key: string;
  enabled: number;
  hour: number;
  minute: number;
  config: string;
  last_run_date: string;
  last_run_at: number;
  last_status: string;
  last_message: string;
};

function ensureRows(): void {
  const ins = sqlite.prepare(
    `INSERT OR IGNORE INTO automation_jobs (job_key, enabled, hour, minute, config, updated_at)
     VALUES (?, 0, ?, ?, ?, ?)`,
  );
  for (const j of JOBS) {
    ins.run(j.key, j.defaultHour, j.defaultMinute, JSON.stringify(j.defaultConfig), Date.now());
  }
}

function getRow(key: string): JobRow | undefined {
  return sqlite.prepare("SELECT * FROM automation_jobs WHERE job_key = ?").get(key) as JobRow | undefined;
}

function parseConfig(def: JobDef, raw: string): JobConfig {
  try {
    return { ...def.defaultConfig, ...(JSON.parse(raw) as JobConfig) };
  } catch {
    return { ...def.defaultConfig };
  }
}

// ===== 실행 =====

/** 실행 기록은 최근 것만 남긴다. 무한히 쌓이면 그 자체가 짐이 된다. */
function trimRuns(): void {
  try {
    sqlite
      .prepare(
        `DELETE FROM automation_runs
          WHERE id NOT IN (SELECT id FROM automation_runs ORDER BY started_at DESC LIMIT 300)`,
      )
      .run();
  } catch {
    /* 정리 실패는 무시 */
  }
}

async function notify(def: JobDef, config: JobConfig, ok: boolean, message: string): Promise<void> {
  const mode = String(config.notify ?? "fail");
  if (mode === "off") return;
  if (ok && mode !== "always") return;
  const head = ok ? `[니트커피] ${def.name} 완료` : `[니트커피] ${def.name} 실패`;
  await sendKakaoMemo(`${head}\n${message}`.slice(0, 190));
}

export type RunResult = { ok: boolean; message: string };

/** 작업 하나를 실제로 돌린다. 예외를 밖으로 던지지 않는다. */
export async function runJob(key: string, trigger: "schedule" | "manual"): Promise<RunResult> {
  const def = jobDef(key);
  if (!def) return { ok: false, message: "알 수 없는 자동화입니다." };

  const row = getRow(key);
  const config = parseConfig(def, row?.config ?? "{}");
  const startedAt = Date.now();
  const runId = sqlite
    .prepare("INSERT INTO automation_runs (job_key, started_at, status, trigger) VALUES (?, ?, 'running', ?)")
    .run(key, startedAt, trigger).lastInsertRowid as number;

  let ok = true;
  let message = "";
  try {
    message = await def.run(config);
  } catch (e: any) {
    ok = false;
    message = String(e?.message ?? e).slice(0, 500);
  }

  try {
    sqlite
      .prepare("UPDATE automation_runs SET finished_at = ?, status = ?, message = ? WHERE id = ?")
      .run(Date.now(), ok ? "ok" : "fail", message, runId);
    sqlite
      .prepare(
        `UPDATE automation_jobs
            SET last_run_date = ?, last_run_at = ?, last_status = ?, last_message = ?, updated_at = ?
          WHERE job_key = ?`,
      )
      .run(kstToday(), Date.now(), ok ? "ok" : "fail", message, Date.now(), key);
    trimRuns();
  } catch (e) {
    console.error("[automation] 기록 실패", e);
  }

  try {
    await notify(def, config, ok, message);
  } catch {
    /* 알림 실패가 작업 실패로 번지지 않게 한다 */
  }

  try {
    await storage.logActivity({
      actorUserId: 0,
      actorEmail: "system",
      actorRole: "system",
      action: ok ? "automation.ok" : "automation.fail",
      targetType: "automation",
      targetId: key,
      summary: `${def.name} ${trigger === "manual" ? "수동" : "자동"} 실행: ${message}`.slice(0, 300),
    });
  } catch {
    /* 활동 로그 실패는 무시 */
  }

  console.log(`[automation] ${key} ${ok ? "ok" : "FAIL"} (${trigger}) ${message}`);
  return { ok, message };
}

// ===== 스케줄러 =====

let timer: NodeJS.Timeout | null = null;
let ticking = false;

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const today = kstToday();
    const nowMin = kstMinutes();
    for (const def of JOBS) {
      const row = getRow(def.key);
      if (!row || row.enabled !== 1) continue;
      if (row.last_run_date === today) continue; // 오늘 몫은 이미 돌았다
      if (nowMin < row.hour * 60 + row.minute) continue; // 아직 시간 전
      await runJob(def.key, "schedule");
    }
  } catch (e) {
    console.error("[automation] tick 실패", e);
  } finally {
    ticking = false;
  }
}

export function startAutomation(): void {
  if (timer) return;
  ensureRows();
  timer = setInterval(() => {
    void tick();
  }, 60_000);
  // 서버가 이 타이머 때문에 종료되지 않도록 한다
  if (typeof timer.unref === "function") timer.unref();
  // 부팅 직후 한 번 — 배포로 놓친 작업을 그날 안에 따라잡는 지점
  setTimeout(() => void tick(), 20_000).unref?.();
  const on = JOBS.filter((j) => getRow(j.key)?.enabled === 1).map((j) => j.key);
  console.log(`[automation] 실행기 시작. 켜진 작업: ${on.length ? on.join(", ") : "없음"}`);
}

// ===== 라우트 =====

function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId || req.session.role !== "admin")
    return res.status(403).json({ message: "관리자 권한이 필요합니다." });
  if (req.session.adminRole !== "owner") return res.status(403).json({ message: "Owner 권한이 필요합니다." });
  next();
}

/** 다음 실행 예정 시각 (ms). 꺼져 있으면 0. */
function nextRunAt(row: JobRow): number {
  if (row.enabled !== 1) return 0;
  const d = kstNow();
  d.setUTCHours(row.hour, row.minute, 0, 0);
  let at = d.getTime() - KST;
  // 오늘 몫이 끝났거나 이미 시각이 지났으면 내일
  if (row.last_run_date === kstToday() || kstMinutes() >= row.hour * 60 + row.minute) at += 86400000;
  return at;
}

/** 파일 이름에 경로가 섞여 들어오는 것을 막는다 */
function safeBackupName(raw: string): string | null {
  const name = path.basename(String(raw));
  if (!/^knit-backup-[0-9]{8}-[0-9]{4}\.db$/.test(name)) return null;
  return name;
}

export function registerAutomationRoutes(app: Express) {
  ensureRows();

  app.get("/api/admin/automation", requireOwner, (_req, res) => {
    const jobs = JOBS.map((def) => {
      const row = getRow(def.key)!;
      return {
        key: def.key,
        name: def.name,
        description: def.description,
        enabled: row.enabled === 1,
        hour: row.hour,
        minute: row.minute,
        config: parseConfig(def, row.config),
        lastRunAt: row.last_run_at,
        lastStatus: row.last_status,
        lastMessage: row.last_message,
        nextRunAt: nextRunAt(row),
      };
    });
    const runs = sqlite
      .prepare("SELECT * FROM automation_runs ORDER BY started_at DESC LIMIT 30")
      .all() as Record<string, unknown>[];
    const backups = listBackups();
    res.json({
      jobs,
      runs: runs.map((r) => ({
        id: r.id,
        jobKey: r.job_key,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        status: r.status,
        trigger: r.trigger,
        message: r.message,
      })),
      backups,
      backupDir: backupDir(),
      backupTotalSize: backups.reduce((s, f) => s + f.size, 0),
      kakaoReady: isKakaoConfigured(),
      serverTimeKst: kstNow().toISOString().slice(0, 16).replace("T", " "),
    });
  });

  app.patch("/api/admin/automation/:key", requireOwner, (req, res) => {
    const def = jobDef(String(req.params.key));
    if (!def) return res.status(404).json({ message: "알 수 없는 자동화입니다." });
    const row = getRow(def.key)!;

    const enabled = typeof req.body?.enabled === "boolean" ? (req.body.enabled ? 1 : 0) : row.enabled;
    const hour = req.body?.hour != null ? Math.min(23, Math.max(0, Number(req.body.hour) || 0)) : row.hour;
    const minute = req.body?.minute != null ? Math.min(59, Math.max(0, Number(req.body.minute) || 0)) : row.minute;
    const config =
      req.body?.config && typeof req.body.config === "object"
        ? JSON.stringify({ ...parseConfig(def, row.config), ...req.body.config })
        : row.config;

    // 방금 켰다면 오늘 몫은 이미 돈 것으로 둔다. 켜자마자 예고 없이 도는 일을 막는다.
    let lastRunDate = row.last_run_date;
    if (enabled === 1 && row.enabled === 0) lastRunDate = kstToday();

    sqlite
      .prepare(
        `UPDATE automation_jobs
            SET enabled = ?, hour = ?, minute = ?, config = ?, last_run_date = ?, updated_at = ?
          WHERE job_key = ?`,
      )
      .run(enabled, hour, minute, config, lastRunDate, Date.now(), def.key);

    res.json({ message: "저장했습니다." });
  });

  app.post("/api/admin/automation/:key/run", requireOwner, async (req, res) => {
    const def = jobDef(String(req.params.key));
    if (!def) return res.status(404).json({ message: "알 수 없는 자동화입니다." });
    const result = await runJob(def.key, "manual");
    res.status(result.ok ? 200 : 500).json(result);
  });

  app.get("/api/admin/automation/backups/:name", requireOwner, (req, res) => {
    const name = safeBackupName(String(req.params.name));
    if (!name) return res.status(400).json({ message: "잘못된 파일 이름입니다." });
    const full = path.join(backupDir(), name);
    if (!fs.existsSync(full)) return res.status(404).json({ message: "파일이 없습니다." });
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.setHeader("Content-Type", "application/octet-stream");
    res.sendFile(full);
  });

  app.delete("/api/admin/automation/backups/:name", requireOwner, (req, res) => {
    const name = safeBackupName(String(req.params.name));
    if (!name) return res.status(400).json({ message: "잘못된 파일 이름입니다." });
    const full = path.join(backupDir(), name);
    if (!fs.existsSync(full)) return res.status(404).json({ message: "파일이 없습니다." });
    fs.unlinkSync(full);
    res.json({ message: "삭제했습니다." });
  });
}
