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
import { buildCustomerActivity } from "./customer-activity";
import { effectiveOrderYmd } from "@shared/orderDate";

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

// ===== ECOUNT 전송 점검 =====
//
// 세금계산서는 이카운트에 쌓인 판매전표를 근거로 월 단위로 일괄 발행한다.
// 그래서 "처리완료인데 전표가 안 넘어간 주문"이 월말까지 남아 있으면 그대로 세금계산서에서 빠진다.
// 매일 아침 그런 주문을 세어 0이 아니면 카카오와 알림센터로 알린다.

type EcountCheck = {
  unsentOrders: { orderNo: string; businessName: string; ymd: string; totalAmount: number; id: number }[];
  dupOrders: { orderNo: string; businessName: string; count: number; id: number }[];
  unsentPurchases: number;
  productsWithoutCode: string[];
};

async function inspectEcount(sinceYmd: string): Promise<EcountCheck> {
  const [orders, customers, purchases, products] = await Promise.all([
    storage.listOrders(),
    storage.listCustomers(),
    storage.listPurchases(),
    storage.listProducts(),
  ]);
  const custById = new Map(customers.map((c) => [c.id, c]));
  const storeIds = new Set(customers.filter((c) => (c as any).isStore).map((c) => c.id));
  const isStoreOrder = (o: any) =>
    typeof o.isStoreOrder === "number" && o.isStoreOrder >= 0 ? o.isStoreOrder === 1 : storeIds.has(o.customerId);

  const unsentOrders: EcountCheck["unsentOrders"] = [];
  const dupOrders: EcountCheck["dupOrders"] = [];
  for (const o of orders) {
    if (o.status !== "done") continue;
    if (o.isSample === 1 || o.totalAmount <= 0) continue; // 무료 샘플은 전표 대상이 아니다
    if (isStoreOrder(o)) continue; // 매장 내부 이동은 세금계산서 대상이 아니다
    const ymd = effectiveOrderYmd(o as any);
    if (ymd < sinceYmd) continue;
    const name = custById.get(o.customerId)?.businessName ?? "(삭제된 거래처)";
    if (!o.ecountSentAt) unsentOrders.push({ orderNo: o.orderNo, businessName: name, ymd, totalAmount: o.totalAmount, id: o.id });
    else if ((o.ecountSentCount ?? 0) >= 2) dupOrders.push({ orderNo: o.orderNo, businessName: name, count: o.ecountSentCount, id: o.id });
  }
  unsentOrders.sort((a, b) => (a.ymd < b.ymd ? -1 : 1));

  const unsentPurchases = purchases.filter((p) => !p.ecountSentAt && p.purchaseDate >= sinceYmd).length;
  const productsWithoutCode = products
    .filter((p) => p.available === 1 && !(p as any).ecountCode)
    .map((p) => p.name);
  return { unsentOrders, dupOrders, unsentPurchases, productsWithoutCode };
}

async function runEcountCheckJob(config: JobConfig): Promise<string> {
  const lookbackDays = Math.min(120, Math.max(7, Number(config.lookbackDays) || 45));
  const sinceYmd = new Date(Date.now() + KST - lookbackDays * 86_400_000).toISOString().slice(0, 10);
  const r = await inspectEcount(sinceYmd);

  const parts: string[] = [];
  if (r.unsentOrders.length) {
    const head = r.unsentOrders.slice(0, 5).map((o) => `${o.ymd.slice(5)} ${o.businessName} ${o.orderNo}`).join(", ");
    parts.push(`미전송 판매전표 ${r.unsentOrders.length}건 (${head}${r.unsentOrders.length > 5 ? " 외" : ""})`);
  }
  if (r.dupOrders.length) parts.push(`중복 전송 ${r.dupOrders.length}건 (${r.dupOrders.map((o) => o.orderNo).join(", ")})`);
  if (r.productsWithoutCode.length) parts.push(`이카운트 품목코드 없는 상품 ${r.productsWithoutCode.length}개 (${r.productsWithoutCode.slice(0, 3).join(", ")})`);
  if (r.unsentPurchases) parts.push(`미전송 구매전표(발주) ${r.unsentPurchases}건`);

  const problem = r.unsentOrders.length + r.dupOrders.length + r.productsWithoutCode.length > 0;
  if (!problem) {
    return `이상 없음 — 최근 ${lookbackDays}일 판매전표 모두 전송됨${r.unsentPurchases ? ` (발주 미전송 ${r.unsentPurchases}건은 수동 전송 대상)` : ""}`;
  }
  const message = parts.join(" · ");
  // 문제가 있을 때는 notify 설정과 무관하게 알린다. 이 작업의 존재 이유가 그것이다.
  storage
    .createNotification({
      type: "ecount_fail",
      title: "ECOUNT 전송 점검 — 확인 필요",
      body: message.slice(0, 200),
      link: "/admin/orders",
    })
    .catch(() => {});
  await sendKakaoMemo(`[니트커피] ECOUNT 점검\n${message}`.slice(0, 190), "https://wholesale.knitcoffee.co.kr/#/admin/orders").catch(() => {});
  return message;
}

// ===== 미주문 거래처 알림 =====
//
// 거래처별 평소 주문 주기(중앙값)를 계산해 주기를 훌쩍 넘긴 곳을 모아 알린다.
// 계산은 미주문 거래처 화면과 같은 함수를 쓴다. 화면에 들어가야만 보이던 것을 밀어주는 것뿐이다.

async function runInactiveCustomersJob(config: JobConfig): Promise<string> {
  const weekday = String(config.weekday ?? "1"); // 0=일 … 6=토, "*"=매일
  const today = kstNow().getUTCDay();
  if (weekday !== "*" && String(today) !== weekday) {
    const names = ["일", "월", "화", "수", "목", "금", "토"];
    return `오늘은 실행 요일이 아님 (${names[Number(weekday)] ?? weekday}요일에 실행)`;
  }
  const days = Math.min(90, Math.max(7, Number(config.days) || 14));
  const beanOnly = config.beanOnly !== false;
  const result = buildCustomerActivity(days, beanOnly);
  const overdue = result.rows.filter((r) => r.overdue);
  const silent = result.rows.filter((r) => !r.overdue && r.daysSince >= days);
  if (overdue.length === 0 && silent.length === 0) return `이상 없음 — ${days}일 넘게 주문 없는 거래처 없음`;

  const lines: string[] = [];
  for (const r of overdue.slice(0, 8)) lines.push(`${r.businessName} ${r.daysSince}일 (평소 ${r.cycleDays}일)`);
  const message =
    `주기 넘긴 거래처 ${overdue.length}곳` +
    (silent.length ? ` · ${days}일 이상 미주문 ${silent.length}곳` : "") +
    (lines.length ? `\n${lines.join("\n")}` : "");
  storage
    .createNotification({
      type: "inactive_customers",
      title: `미주문 거래처 ${overdue.length + silent.length}곳`,
      body: lines.slice(0, 3).join(" · ") || `${days}일 이상 미주문 ${silent.length}곳`,
      link: "/admin/customer-activity",
    })
    .catch(() => {});
  await sendKakaoMemo(`[니트커피] 미주문 거래처\n${message}`.slice(0, 190), "https://wholesale.knitcoffee.co.kr/#/admin/customer-activity").catch(() => {});
  return message.replace(/\n/g, " / ");
}

const JOBS: JobDef[] = [
  {
    key: "ecount_check",
    name: "ECOUNT 전송 점검",
    description:
      "매일 아침, 처리완료됐는데 이카운트 판매전표가 안 넘어간 주문·중복 전송된 주문·품목코드 없는 상품을 세어 하나라도 있으면 카카오와 알림센터로 알립니다. 세금계산서 일괄 발행 전에 빠진 전표를 잡기 위한 것입니다.",
    defaultHour: 8,
    defaultMinute: 30,
    defaultConfig: { lookbackDays: 45, notify: "fail" },
    run: runEcountCheckJob,
  },
  {
    key: "inactive_customers",
    name: "미주문 거래처 알림",
    description:
      "정한 요일에 거래처별 평소 주문 주기를 계산해, 주기를 훌쩍 넘긴 거래처와 오래 주문이 없는 거래처를 카카오와 알림센터로 알립니다. '미주문 거래처' 화면과 같은 계산입니다.",
    defaultHour: 9,
    defaultMinute: 0,
    defaultConfig: { weekday: "1", days: 14, beanOnly: true, notify: "fail" },
    run: runInactiveCustomersJob,
  },
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
