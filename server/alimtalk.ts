// 카카오 알림톡 (솔라피) — 거래처에게 나가는 정보성 알림.
//
// 설계 원칙
//  1) 주문 흐름을 절대 막지 않는다. 알림톡이 실패해도 주문은 정상 처리된다.
//  2) 모든 발송 시도를 남긴다. 성공·실패·건너뜀 이유까지 기록해야 나중에 추적이 된다.
//  3) 템플릿 ID를 코드에 박지 않는다. 카카오 정책상 승인된 템플릿은 수정이 불가능해
//     문구를 바꾸면 ID가 바뀌는데, 그때마다 배포하지 않도록 화면에서 고르게 한다.
//  4) 열려 있으면 위험한 것(미수금 안내)은 자동으로 보내지 않는다. 사람이 고르고 보낸다.
//
// 인증 정보는 환경변수로만 받는다. 코드나 DB 에 남기지 않는다.
//   SOLAPI_API_KEY / SOLAPI_API_SECRET

import crypto from "node:crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { sqlite, storage } from "./storage";

// 기본값은 솔라피 운영 주소. 로컬에서 가짜 서버로 검증할 때만 환경변수로 바꾼다.
const API_HOST = (process.env.SOLAPI_API_HOST || "https://api.solapi.com").replace(/\/$/, "");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS alimtalk_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    pf_id TEXT NOT NULL DEFAULT '',
    sender TEXT NOT NULL DEFAULT '',
    tpl_order TEXT NOT NULL DEFAULT '',
    tpl_balance TEXT NOT NULL DEFAULT '',
    disable_sms INTEGER NOT NULL DEFAULT 0,
    test_phone TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0
  );
  INSERT OR IGNORE INTO alimtalk_settings (id, updated_at) VALUES (1, 0);

  CREATE TABLE IF NOT EXISTS alimtalk_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    kind TEXT NOT NULL,
    customer_id INTEGER NOT NULL DEFAULT 0,
    business_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    template_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    message_id TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_alimtalk_logs_created ON alimtalk_logs (created_at DESC);

  CREATE TABLE IF NOT EXISTS alimtalk_optout (
    customer_id INTEGER PRIMARY KEY,
    off INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
`);

// 이미 있는 설치본에도 컬럼을 더한다 (있으면 그대로 지나간다)
try {
  sqlite.exec("ALTER TABLE alimtalk_logs ADD COLUMN ref TEXT NOT NULL DEFAULT ''");
} catch {
  /* 이미 있음 */
}

// ===== 설정 =====

export type AlimtalkSettings = {
  enabled: boolean;
  pfId: string;
  sender: string;
  tplOrder: string;
  tplBalance: string;
  disableSms: boolean;
  testPhone: string;
};

type SettingsRow = {
  enabled: number;
  pf_id: string;
  sender: string;
  tpl_order: string;
  tpl_balance: string;
  disable_sms: number;
  test_phone: string;
};

export function getSettings(): AlimtalkSettings {
  const r = sqlite.prepare("SELECT * FROM alimtalk_settings WHERE id = 1").get() as SettingsRow;
  return {
    enabled: r.enabled === 1,
    pfId: r.pf_id,
    sender: r.sender,
    tplOrder: r.tpl_order,
    tplBalance: r.tpl_balance,
    disableSms: r.disable_sms === 1,
    testPhone: r.test_phone,
  };
}

function apiKey(): string {
  return (process.env.SOLAPI_API_KEY || "").trim();
}
function apiSecret(): string {
  return (process.env.SOLAPI_API_SECRET || "").trim();
}
export function isAlimtalkConfigured(): boolean {
  return apiKey().length > 0 && apiSecret().length > 0;
}

/** 왜 못 보내는지 화면에서 바로 알 수 있게 하는 진단 */
export function alimtalkStatus(): { ready: boolean; reasons: string[] } {
  const s = getSettings();
  const reasons: string[] = [];
  if (!isAlimtalkConfigured()) reasons.push("SOLAPI_API_KEY / SOLAPI_API_SECRET 이 설정되어 있지 않습니다.");
  if (!s.pfId) reasons.push("발신프로필키(PFID)가 비어 있습니다.");
  if (!s.sender) reasons.push("발신번호가 비어 있습니다.");
  if (!s.tplOrder) reasons.push("주문 접수 템플릿이 선택되지 않았습니다.");
  if (!s.enabled) reasons.push("알림톡 사용이 꺼져 있습니다.");
  return { ready: reasons.length === 0, reasons };
}

// ===== 솔라피 호출 =====

/**
 * 솔라피 인증 헤더.
 * signature = HMAC-SHA256(apiSecret, date + salt) 의 hex.
 */
function authHeader(): string {
  const salt = crypto.randomBytes(32).toString("hex").slice(0, 32);
  const date = new Date().toISOString();
  const signature = crypto.createHmac("sha256", apiSecret()).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey()}, date=${date}, salt=${salt}, signature=${signature}`;
}

async function solapi(method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
  if (!isAlimtalkConfigured()) throw new Error("솔라피 API 키가 설정되어 있지 않습니다.");
  const res = await fetch(`${API_HOST}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.errorMessage || data?.message || `HTTP ${res.status}`;
    throw new Error(String(msg).slice(0, 300));
  }
  return data;
}

/** 연동된 카카오 채널(발신프로필) 목록 — PFID 를 화면에서 자동으로 채우기 위한 것 */
export async function listChannels(): Promise<{ pfId: string; searchId: string; name: string }[]> {
  const data = await solapi("GET", "/kakao/v2/channels");
  const rows: any[] = Array.isArray(data) ? data : (data.channelList ?? data.channels ?? []);
  return rows.map((c) => ({
    pfId: c.pfId ?? c.channelId ?? "",
    searchId: c.searchId ?? "",
    name: c.name ?? c.channelName ?? "",
  }));
}

/** 등록된 알림톡 템플릿 목록 — 승인된 것만 고를 수 있게 상태를 함께 준다 */
export async function listTemplates(): Promise<
  { templateId: string; name: string; status: string; inspectionStatus: string; content: string }[]
> {
  const data = await solapi("GET", "/kakao/v2/templates?limit=100");
  const rows: any[] = Array.isArray(data) ? data : (data.templateList ?? data.templates ?? []);
  return rows.map((t) => ({
    templateId: t.templateId ?? "",
    name: t.name ?? "",
    status: t.status ?? "",
    inspectionStatus: t.inspectionStatus ?? "",
    content: String(t.content ?? "").slice(0, 400),
  }));
}

// ===== 템플릿이 실제로 쓰는 변수 =====

/**
 * 승인된 템플릿에 없는 변수를 함께 보내면 발송이 거부될 수 있다.
 * 템플릿 원문을 한 번 받아 두고, 거기에 등장하는 #{이름} 만 골라 보낸다.
 * (본문뿐 아니라 버튼 링크·강조 영역까지 통째로 훑으므로 빠뜨릴 일이 없다.)
 * 승인된 템플릿은 수정이 불가능하므로 한참 캐시해 두어도 안전하다.
 */
const varCache = new Map<string, { at: number; names: Set<string> }>();
const VAR_CACHE_MS = 30 * 60 * 1000;

async function templateVariableNames(templateId: string): Promise<Set<string> | null> {
  const hit = varCache.get(templateId);
  if (hit && Date.now() - hit.at < VAR_CACHE_MS) return hit.names;
  try {
    const detail = await solapi("GET", `/kakao/v2/templates/${encodeURIComponent(templateId)}`);
    const found = JSON.stringify(detail ?? {}).match(/#\{[^}]+\}/g) ?? [];
    const names = new Set(found);
    if (names.size === 0) return null; // 이상하면 거르지 않는다
    varCache.set(templateId, { at: Date.now(), names });
    return names;
  } catch (e) {
    console.warn("[alimtalk] 템플릿 변수 조회 실패:", (e as any)?.message ?? e);
    return null; // 조회 실패 시에는 원래대로 전부 보낸다
  }
}

// ===== 발송 =====

/** 숫자만 남긴다. 솔라피는 하이픈 없는 번호를 받는다. */
function normalizePhone(raw: string): string {
  return String(raw ?? "").replace(/[^0-9]/g, "");
}

function isSendablePhone(p: string): boolean {
  // 휴대폰(010 등) 과 지역번호 모두 허용하되 길이만 최소한으로 본다
  return p.length >= 9 && p.length <= 12;
}

function logSend(row: {
  kind: string;
  customerId?: number;
  businessName?: string;
  phone?: string;
  templateId?: string;
  status: "ok" | "fail" | "skip";
  detail?: string;
  messageId?: string;
  ref?: string;
}): void {
  try {
    sqlite
      .prepare(
        `INSERT INTO alimtalk_logs (created_at, kind, customer_id, business_name, phone, template_id, status, detail, message_id, ref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        Date.now(),
        row.kind,
        row.customerId ?? 0,
        row.businessName ?? "",
        row.phone ?? "",
        row.templateId ?? "",
        row.status,
        String(row.detail ?? "").slice(0, 500),
        row.messageId ?? "",
        row.ref ?? "",
      );
    sqlite
      .prepare(
        `DELETE FROM alimtalk_logs
          WHERE id NOT IN (SELECT id FROM alimtalk_logs ORDER BY created_at DESC LIMIT 1000)`,
      )
      .run();
  } catch (e) {
    console.error("[alimtalk] 기록 실패", e);
  }
}

export function isOptedOut(customerId: number): boolean {
  const r = sqlite.prepare("SELECT off FROM alimtalk_optout WHERE customer_id = ?").get(customerId) as
    | { off: number }
    | undefined;
  return r?.off === 1;
}

type SendOne = {
  kind: string;
  customerId: number;
  businessName: string;
  phone: string;
  templateId: string;
  variables: Record<string, string>;
  /** 같은 건에 두 번 보내지 않기 위한 식별자 (주문 알림이면 주문번호) */
  ref?: string;
  /**
   * '알림톡 사용' 스위치를 무시하고 보낸다. 테스트 발송 전용.
   * 켜기 전에 실제로 어떻게 도착하는지 확인하는 게 순서상 맞다.
   */
  force?: boolean;
};

/** 변수 키를 #{이름} 형태로 맞춘다 */
function formatVariables(v: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    const key = /^#\{.+\}$/.test(k) ? k : `#{${k}}`;
    out[key] = String(val ?? "");
  }
  return out;
}

/**
 * 실제 발송. 예외를 던지지 않고 결과만 돌려준다.
 * 호출하는 쪽(주문 생성 등)이 이 함수 때문에 실패하는 일은 없어야 한다.
 */
export async function sendAlimtalk(msg: SendOne): Promise<{ ok: boolean; detail: string }> {
  const s = getSettings();
  try {
    if (!s.enabled && !msg.force) {
      logSend({ ...msg, status: "skip", detail: "알림톡 사용 꺼짐" });
      return { ok: false, detail: "알림톡 사용 꺼짐" };
    }
    if (!isAlimtalkConfigured()) {
      logSend({ ...msg, status: "skip", detail: "API 키 미설정" });
      return { ok: false, detail: "API 키 미설정" };
    }
    if (!s.pfId || !s.sender || !msg.templateId) {
      logSend({ ...msg, status: "skip", detail: "발신프로필·발신번호·템플릿 중 빠진 값이 있습니다." });
      return { ok: false, detail: "설정 미완료" };
    }
    if (msg.customerId && isOptedOut(msg.customerId)) {
      logSend({ ...msg, status: "skip", detail: "거래처가 수신을 꺼둔 상태" });
      return { ok: false, detail: "수신 거부" };
    }
    const phone = normalizePhone(msg.phone);
    if (!isSendablePhone(phone)) {
      logSend({ ...msg, phone, status: "skip", detail: "연락처가 없거나 형식이 올바르지 않습니다." });
      return { ok: false, detail: "연락처 오류" };
    }

    // 템플릿에 없는 변수는 빼고 보낸다.
    let variables = formatVariables(msg.variables);
    const allowed = await templateVariableNames(msg.templateId);
    if (allowed) {
      variables = Object.fromEntries(Object.entries(variables).filter(([k]) => allowed.has(k)));
    }

    const body = {
      messages: [
        {
          to: phone,
          from: normalizePhone(s.sender),
          kakaoOptions: {
            pfId: s.pfId,
            templateId: msg.templateId,
            variables,
            disableSms: s.disableSms,
          },
        },
      ],
    };

    const data = await solapi("POST", "/messages/v4/send-many/detail", body);
    const failed: any[] = data?.failedMessageList ?? [];
    if (failed.length > 0) {
      const reason = failed[0]?.statusMessage || failed[0]?.statusCode || "발송 실패";
      logSend({ ...msg, phone, status: "fail", detail: String(reason).slice(0, 300) });
      return { ok: false, detail: String(reason) };
    }
    const messageId = data?.messageList ? Object.keys(data.messageList)[0] ?? "" : "";
    logSend({ ...msg, phone, status: "ok", detail: "발송 접수됨", messageId });
    return { ok: true, detail: "발송 접수됨" };
  } catch (e: any) {
    const detail = String(e?.message ?? e).slice(0, 300);
    logSend({ ...msg, status: "fail", detail });
    return { ok: false, detail };
  }
}

/** 같은 건으로 이미 성공 발송한 적이 있는지 (재전송 방지) */
export function alreadySent(kind: string, ref: string): boolean {
  if (!ref) return false;
  const r = sqlite
    .prepare("SELECT COUNT(*) AS c FROM alimtalk_logs WHERE kind = ? AND ref = ? AND status = 'ok'")
    .get(kind, ref) as { c: number };
  return r.c > 0;
}

const won = (n: number) => Number(n || 0).toLocaleString("ko-KR");

/**
 * 주문 접수 확인 — 관리자가 주문을 '처리완료'로 바꿀 때 거래처에게 나간다.
 * 주문이 들어온 순간이 아니라 확인이 끝난 시점에 보내야, 같은 날 추가 주문이
 * 기존 건에 합쳐지는 경우에도 최종 내용으로 한 번만 안내된다.
 * 응답을 막지 않도록 호출하는 쪽에서 await 하지 않는다.
 */
export async function sendOrderReceived(args: {
  customerId: number;
  businessName: string;
  phone: string;
  orderNo: string;
  totalAmount: number;
  orderId: number;
}): Promise<void> {
  const s = getSettings();

  // 상태를 오갔다가 다시 처리완료로 돌려도 두 번 가지 않게 한다.
  if (alreadySent("order", args.orderNo)) {
    console.log(`[alimtalk] ${args.orderNo} 는 이미 발송함 — 건너뜀`);
    return;
  }

  // 잔액은 '이번 주문을 포함한' 현재 미수금이다. 주문이 저장된 뒤에 계산하므로 방금 주문이 반영된다.
  // 조회에 실패하더라도 알림 자체는 나가야 하므로 기본값을 둔다.
  let balanceText = "0";
  try {
    const ledger = await storage.getCustomerLedger(args.customerId);
    balanceText = won(Math.max(0, ledger.balance?.balance ?? 0));
  } catch (e) {
    console.warn("[alimtalk] 잔액 조회 실패:", (e as any)?.message ?? e);
  }

  await sendAlimtalk({
    kind: "order",
    customerId: args.customerId,
    businessName: args.businessName,
    phone: args.phone,
    templateId: s.tplOrder,
    ref: args.orderNo,
    variables: {
      상호명: args.businessName,
      주문번호: args.orderNo,
      주문금액: won(args.totalAmount),
      미수금액: balanceText,
      // 버튼 링크에서 쓸 수 있도록 함께 넘긴다 (템플릿이 쓰지 않으면 무시된다)
      주문ID: String(args.orderId),
    },
  });
}

// ===== 라우트 =====

function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId || req.session.role !== "admin")
    return res.status(403).json({ message: "관리자 권한이 필요합니다." });
  if (req.session.adminRole !== "owner") return res.status(403).json({ message: "Owner 권한이 필요합니다." });
  next();
}

function safe(fn: (req: Request, res: Response) => Promise<unknown> | unknown) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  };
}

export function registerAlimtalkRoutes(app: Express) {
  app.get(
    "/api/admin/alimtalk",
    requireOwner,
    safe(async (_req, res) => {
      const logs = sqlite
        .prepare("SELECT * FROM alimtalk_logs ORDER BY created_at DESC LIMIT 50")
        .all() as Record<string, any>[];
      const optouts = sqlite.prepare("SELECT customer_id FROM alimtalk_optout WHERE off = 1").all() as {
        customer_id: number;
      }[];
      res.json({
        settings: getSettings(),
        status: alimtalkStatus(),
        keyConfigured: isAlimtalkConfigured(),
        optOutIds: optouts.map((o) => o.customer_id),
        logs: logs.map((l) => ({
          id: l.id,
          createdAt: l.created_at,
          kind: l.kind,
          businessName: l.business_name,
          phone: l.phone,
          status: l.status,
          detail: l.detail,
        })),
      });
    }),
  );

  app.patch(
    "/api/admin/alimtalk",
    requireOwner,
    safe((req, res) => {
      const cur = getSettings();
      const b = req.body ?? {};
      const next = {
        enabled: typeof b.enabled === "boolean" ? (b.enabled ? 1 : 0) : cur.enabled ? 1 : 0,
        pfId: typeof b.pfId === "string" ? b.pfId.trim() : cur.pfId,
        sender: typeof b.sender === "string" ? b.sender.trim() : cur.sender,
        tplOrder: typeof b.tplOrder === "string" ? b.tplOrder.trim() : cur.tplOrder,
        tplBalance: typeof b.tplBalance === "string" ? b.tplBalance.trim() : cur.tplBalance,
        disableSms: typeof b.disableSms === "boolean" ? (b.disableSms ? 1 : 0) : cur.disableSms ? 1 : 0,
        testPhone: typeof b.testPhone === "string" ? b.testPhone.trim() : cur.testPhone,
      };
      sqlite
        .prepare(
          `UPDATE alimtalk_settings
              SET enabled = ?, pf_id = ?, sender = ?, tpl_order = ?, tpl_balance = ?,
                  disable_sms = ?, test_phone = ?, updated_at = ?
            WHERE id = 1`,
        )
        .run(
          next.enabled,
          next.pfId,
          next.sender,
          next.tplOrder,
          next.tplBalance,
          next.disableSms,
          next.testPhone,
          Date.now(),
        );
      res.json({ message: "저장했습니다.", settings: getSettings(), status: alimtalkStatus() });
    }),
  );

  /** 연동된 채널 목록 — PFID 자동 채우기 */
  app.get(
    "/api/admin/alimtalk/channels",
    requireOwner,
    safe(async (_req, res) => {
      try {
        res.json({ channels: await listChannels() });
      } catch (e: any) {
        res.status(502).json({ message: e?.message ?? "채널 목록을 불러오지 못했습니다." });
      }
    }),
  );

  /** 등록된 템플릿 목록 — 승인 후 화면에서 골라 쓰기 */
  app.get(
    "/api/admin/alimtalk/templates",
    requireOwner,
    safe(async (_req, res) => {
      try {
        res.json({ templates: await listTemplates() });
      } catch (e: any) {
        res.status(502).json({ message: e?.message ?? "템플릿 목록을 불러오지 못했습니다." });
      }
    }),
  );

  /** 테스트 발송 — 실제 거래처가 아니라 지정한 번호로만 나간다 */
  app.post(
    "/api/admin/alimtalk/test",
    requireOwner,
    safe(async (req, res) => {
      const s = getSettings();
      const to = String(req.body?.phone ?? s.testPhone ?? "");
      if (!isSendablePhone(normalizePhone(to)))
        return res.status(400).json({ message: "테스트로 받을 번호를 입력해 주세요." });
      const which = String(req.body?.which ?? "order");
      const templateId = which === "balance" ? s.tplBalance : s.tplOrder;
      if (!templateId) return res.status(400).json({ message: "해당 템플릿이 선택되어 있지 않습니다." });

      const variables: Record<string, string> =
        which === "balance"
          ? { 상호명: "테스트 거래처", 기준일: new Date().toISOString().slice(0, 10), 미수금액: "1,240,000", 최근거래일: new Date().toISOString().slice(0, 10) }
          : {
              상호명: "테스트 거래처",
              주문번호: "KC-TEST-0001",
              주문금액: "253,000",
              미수금액: "253,000",
              주문ID: "0",
            };

      const r = await sendAlimtalk({
        kind: `test:${which}`,
        customerId: 0,
        businessName: "테스트",
        phone: to,
        templateId,
        variables,
        force: true, // 켜기 전에 확인해 보는 것이 테스트의 목적이다
      });
      res.status(r.ok ? 200 : 502).json({ message: r.detail, ok: r.ok });
    }),
  );

  /** 미수금 안내 — 자동 발송하지 않는다. 고른 거래처에만 사람이 눌러서 보낸다. */
  app.get(
    "/api/admin/alimtalk/balance-targets",
    requireOwner,
    safe(async (_req, res) => {
      const balances = await storage.getCustomerBalances();
      const rows = balances
        .filter((b) => b.balance > 0)
        .sort((a, b) => b.balance - a.balance)
        .map((b) => ({
          customerId: b.customerId,
          businessName: b.businessName,
          managerName: b.managerName,
          phone: b.phone,
          balance: b.balance,
          lastOrderAt: b.lastOrderAt,
          optedOut: isOptedOut(b.customerId),
        }));
      res.json({ rows });
    }),
  );

  app.post(
    "/api/admin/alimtalk/balance-notice",
    requireOwner,
    safe(async (req, res) => {
      const s = getSettings();
      if (!s.tplBalance) return res.status(400).json({ message: "미수금 안내 템플릿이 선택되어 있지 않습니다." });
      const ids: number[] = Array.isArray(req.body?.customerIds) ? req.body.customerIds.map(Number) : [];
      if (ids.length === 0) return res.status(400).json({ message: "보낼 거래처를 선택해 주세요." });
      if (ids.length > 50) return res.status(400).json({ message: "한 번에 50곳까지만 보낼 수 있습니다." });

      const balances = await storage.getCustomerBalances();
      const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      const results: { businessName: string; ok: boolean; detail: string }[] = [];

      for (const id of ids) {
        const b = balances.find((x) => x.customerId === id);
        if (!b) {
          results.push({ businessName: `#${id}`, ok: false, detail: "거래처를 찾을 수 없습니다." });
          continue;
        }
        const r = await sendAlimtalk({
          kind: "balance",
          customerId: b.customerId,
          businessName: b.businessName,
          phone: b.phone,
          templateId: s.tplBalance,
          variables: {
            상호명: b.businessName,
            기준일: today,
            미수금액: won(b.balance),
            최근거래일: b.lastOrderAt ? new Date(b.lastOrderAt).toISOString().slice(0, 10) : "-",
          },
        });
        results.push({ businessName: b.businessName, ok: r.ok, detail: r.detail });
      }

      const okCount = results.filter((r) => r.ok).length;
      try {
        const actor = await storage.getCustomer(req.session.userId!);
        await storage.logActivity({
          actorUserId: req.session.userId ?? 0,
          actorEmail: actor?.email ?? "",
          actorRole: req.session.adminRole ?? "owner",
          action: "alimtalk_balance_notice",
          targetType: "customer",
          summary: `미수금 안내 알림톡 발송: ${okCount}/${results.length}곳`,
        });
      } catch {
        /* 활동 로그 실패는 무시 */
      }

      res.json({ message: `${results.length}곳 중 ${okCount}곳 발송했습니다.`, results });
    }),
  );

  /** 거래처별 수신 끄기·켜기 */
  app.patch(
    "/api/admin/alimtalk/optout/:customerId",
    requireOwner,
    safe((req, res) => {
      const id = Number(req.params.customerId);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
      const off = req.body?.off === true ? 1 : 0;
      sqlite
        .prepare(
          `INSERT INTO alimtalk_optout (customer_id, off, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(customer_id) DO UPDATE SET off = excluded.off, updated_at = excluded.updated_at`,
        )
        .run(id, off, Date.now());
      res.json({ message: off ? "이 거래처에는 보내지 않습니다." : "다시 보냅니다." });
    }),
  );
}
