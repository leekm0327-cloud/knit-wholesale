// Owner-reviewed notice broadcasts. Preparing/saving a notice never sends a message.
import crypto from "node:crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { sqlite } from "./storage";
import { getSettings, isAlimtalkConfigured, solapi, SolapiHttpError } from "./alimtalk";
import { popupImageSchema } from "@shared/popup-image";
import {
  prepareNoticeMessageSchema, normalizeNoticePhone, NOTICE_MESSAGE_URL, NOTICE_MESSAGE_BUTTON,
  type NoticeMessageBatch, type NoticeRecipient, type NoticeMessageStatus,
} from "@shared/notice-message";

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS notice_message_batches (
    id TEXT PRIMARY KEY, notice_id INTEGER NOT NULL, owner_id INTEGER NOT NULL,
    title TEXT NOT NULL, text TEXT NOT NULL, image_url TEXT NOT NULL,
    notice_version INTEGER NOT NULL, pf_id TEXT NOT NULL, channel_name TEXT NOT NULL,
    mode TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
    unit_price REAL NOT NULL, total REAL NOT NULL, exclusions TEXT NOT NULL DEFAULT '[]',
    group_id TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS notice_message_batches_notice ON notice_message_batches(notice_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS notice_message_recipients (
    batch_id TEXT NOT NULL, customer_id INTEGER NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued', detail TEXT NOT NULL DEFAULT '', message_id TEXT NOT NULL DEFAULT '',
    PRIMARY KEY(batch_id, phone)
  );
  -- A reservation survives worker crashes and ambiguous provider responses.
  -- Only an explicit, confirmed failure releases it; test sends never claim live recipients.
  CREATE TABLE IF NOT EXISTS notice_message_claims (
    notice_id INTEGER NOT NULL, phone TEXT NOT NULL, batch_id TEXT NOT NULL,
    PRIMARY KEY(notice_id, phone)
  );
`);

type BatchRow = {
  id: string; notice_id: number; owner_id: number; title: string; text: string; image_url: string;
  notice_version: number; pf_id: string; channel_name: string; mode: "test" | "live"; status: string;
  unit_price: number; total: number; exclusions: string; group_id: string;
  created_at: number; expires_at: number; updated_at: number;
};
type RecipientRow = {
  customer_id: number; name: string; phone: string; status: NoticeMessageStatus; detail: string; message_id: string;
};
type NoticeRow = { id: number; title: string; image_url: string; updated_at: number };
class NoticeError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
function fail(message: string, status = 400): never { throw new NoticeError(message, status); }
function getNotice(id: number) {
  const n = sqlite.prepare("SELECT id, title, image_url, updated_at FROM popup_notices WHERE id = ?").get(id) as NoticeRow | undefined;
  return n || fail("공지를 찾을 수 없습니다.", 404);
}
function getBatch(id: string) {
  const b = sqlite.prepare("SELECT * FROM notice_message_batches WHERE id = ?").get(id) as BatchRow | undefined;
  return b || fail("발송 기록을 찾을 수 없습니다.", 404);
}
function markStalled(b: BatchRow, now: number) {
  if (!["preparing", "sending"].includes(b.status) || now - b.updated_at <= 120000) return b;
  sqlite.transaction(() => {
    for (const r of recipientRows(b.id)) if (r.status === "queued")
      updateRecipient(b, r, "unknown", "발송 처리 결과가 확인되지 않았습니다. 중복 전송을 차단했으니 솔라피 발송 내역을 확인해 주세요.");
    finishStatus(b, now);
  })();
  return getBatch(b.id);
}
function recipientRows(id: string) {
  return sqlite.prepare("SELECT * FROM notice_message_recipients WHERE batch_id = ? ORDER BY name, phone").all(id) as RecipientRow[];
}
function viewBatch(b: BatchRow): NoticeMessageBatch {
  return {
    id: b.id, noticeId: b.notice_id, title: b.title, mode: b.mode, text: b.text, imageUrl: b.image_url,
    buttonUrl: NOTICE_MESSAGE_URL, channelName: b.channel_name, status: b.status,
    createdAt: b.created_at, expiresAt: b.expires_at, unitPrice: b.unit_price, total: b.total,
    exclusions: JSON.parse(b.exclusions),
    recipients: recipientRows(b.id).map(r => ({ customerId: r.customer_id, name: r.name, phone: r.phone, status: r.status, detail: r.detail })),
  };
}

function connectionReasons() {
  const s = getSettings();
  return [
    !isAlimtalkConfigured() && "솔라피 연결 키가 없습니다. 알림톡 설정을 확인해 주세요.",
    !s.enabled && "알림톡 사용이 꺼져 있습니다. 알림톡 설정에서 켜 주세요.",
    !s.pfId && "보낼 카카오 채널이 선택되지 않았습니다.",
  ].filter(Boolean) as string[];
}
function assertConnection() {
  const reasons = connectionReasons();
  if (reasons.length) fail(reasons.join(" "));
  return getSettings();
}
export function isNoticeSendTime(now: number) {
  const kst = new Date(now + 9 * 3600000);
  const minute = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return minute >= 480 && minute < 1250; // 08:00–20:50 KST
}
function assertSendTime(now: number) {
  if (!isNoticeSendTime(now)) fail("카카오 공지는 오전 8시부터 오후 8시 50분 전까지 보낼 수 있습니다.");
}

function blockedPhones() {
  const rows = sqlite.prepare(`SELECT c.phone FROM customers c JOIN alimtalk_optout o
    ON o.customer_id = c.id WHERE o.off = 1`).all() as { phone: string }[];
  return new Set(rows.map(r => normalizeNoticePhone(r.phone)).filter(Boolean));
}
function customers(noticeId: number, now: number, ignoreBatch = ""): NoticeRecipient[] {
  const rows = sqlite.prepare(`SELECT c.id, c.business_name AS name, c.phone,
    EXISTS(SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.status != 'cancelled'
      AND o.is_sample = 0 AND o.is_store_order != 1 AND o.created_at >= ?) AS recent,
    COALESCE(x.off, 0) AS opted_out
    FROM customers c LEFT JOIN alimtalk_optout x ON x.customer_id = c.id
    WHERE c.role = 'customer' AND c.is_store = 0 ORDER BY c.business_name, c.id`).all(now - 90 * 86400000) as any[];
  const blocked = blockedPhones();
  const claims = sqlite.prepare("SELECT phone FROM notice_message_claims WHERE notice_id = ? AND batch_id != ?").all(noticeId, ignoreBatch) as { phone: string }[];
  const claimed = new Set(claims.map(r => r.phone));
  return rows.map(r => {
    const phone = normalizeNoticePhone(r.phone);
    return { id: r.id, name: r.name, phone: phone || r.phone, recent: !!r.recent,
      reason: !phone ? "휴대전화번호 확인 필요" : r.opted_out || blocked.has(phone) ? "수신거부" : claimed.has(phone) ? "이미 발송했거나 결과 확인 중" : "" };
  });
}
function resolveRecipients(ids: number[], noticeId: number, now: number) {
  const all = new Map(customers(noticeId, now).map(c => [c.id, c]));
  const seen = new Set<string>();
  const chosen: NoticeRecipient[] = [];
  const exclusions: { name: string; reason: string }[] = [];
  for (const id of Array.from(new Set(ids))) {
    const c = all.get(id);
    if (!c) fail("거래처 목록이 변경되었습니다. 새로고침한 뒤 다시 선택해 주세요.", 409);
    const reason = c.reason || (seen.has(c.phone) ? "같은 전화번호로 한 번만 발송" : "");
    if (reason) exclusions.push({ name: c.name, reason });
    else { chosen.push(c); seen.add(c.phone); }
  }
  return { chosen, exclusions };
}

// SOLAPI BMS accepts only JPEG/PNG, <=5MB, 3:4 through 2:1. No remote image fetching.
export function validateNoticeMessageImage(value: string) {
  if (!value) fail("첨부된 공지 이미지가 없습니다.");
  if (!popupImageSchema.safeParse(value).success) fail("공지 이미지를 다시 첨부해 주세요.");
  const match = /^data:image\/(png|jpeg);base64,(.+)$/.exec(value);
  if (!match) fail("카카오 이미지는 JPG 또는 PNG를 사용해 주세요. 이미지 없이 보낼 수도 있습니다.");
  const buffer = Buffer.from(match[2], "base64");
  let width = 0, height = 0;
  if (match[1] === "png" && buffer.length >= 33 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && buffer.toString("ascii", 12, 16) === "IHDR") {
    width = buffer.readUInt32BE(16); height = buffer.readUInt32BE(20);
  } else if (match[1] === "jpeg" && buffer[0] === 255 && buffer[1] === 216) {
    for (let p = 2; p + 8 < buffer.length;) {
      if (buffer[p++] !== 255) break;
      while (buffer[p] === 255) p++;
      const marker = buffer[p++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (p + 2 > buffer.length) break;
      const length = buffer.readUInt16BE(p);
      if (length < 2 || p + length > buffer.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 7) {
        height = buffer.readUInt16BE(p + 3); width = buffer.readUInt16BE(p + 5); break;
      }
      p += length;
    }
  }
  if (!width || !height) fail("이미지 파일을 읽을 수 없습니다. JPG 또는 PNG를 다시 첨부해 주세요.");
  if (width / height < .75 || width / height > 2) fail("카카오 이미지는 가로:세로 비율 3:4부터 2:1까지 가능합니다. 공지 이미지를 조정하거나 이미지 없이 보내 주세요.");
  return { file: match[2], name: `notice.${match[1] === "jpeg" ? "jpg" : "png"}` };
}

async function priceAndBalance() {
  const results = await Promise.allSettled([
    solapi("GET", "/pricing/v1/messaging/countries?countryId=82"), solapi("GET", "/cash/v1/balance"),
  ]);
  // Both reads must complete before returning; an unavailable price never means zero cost.
  const rejected = results.find(r => r.status === "rejected");
  if (rejected?.status === "rejected") throw rejected.reason;
  const prices = (results[0] as PromiseFulfilledResult<any>).value;
  const balance = (results[1] as PromiseFulfilledResult<any>).value;
  const rate = Array.isArray(prices) ? prices.find(p => p.countryId === "82" && (!p.serviceMethod || p.serviceMethod === "MT"))?.bms_free : undefined;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0)
    fail("솔라피에서 브랜드 메시지 자유형 단가를 확인하지 못했습니다. 솔라피에서 이용 가능 여부와 단가를 확인해 주세요.");
  if (typeof balance.balance !== "number" || typeof balance.point !== "number" || !Number.isFinite(balance.balance + balance.point))
    fail("솔라피 잔액을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return { unitPrice: rate, available: balance.balance + balance.point };
}
async function channelName(pfId: string) {
  const data = await solapi("GET", `/kakao/v2/channels/${encodeURIComponent(pfId)}`);
  if ((data.pfId || data.channelId) !== pfId) fail("솔라피 카카오 채널을 확인하지 못했습니다.");
  return String(data.name || data.channelName || data.searchId || "연결된 카카오 채널");
}
const money = (n: number) => Math.ceil(n * 100) / 100;

function assertUnchanged(b: BatchRow, now: number) {
  const s = assertConnection();
  if (s.pfId !== b.pf_id) fail("발신 채널이 바뀌었습니다. 다시 발송 준비해 주세요.", 409);
  const n = getNotice(b.notice_id);
  if (n.updated_at !== b.notice_version) fail("공지 내용이 바뀌었습니다. 다시 발송 준비해 주세요.", 409);
  const recipients = recipientRows(b.id);
  if (b.mode === "test") {
    if (recipients.length !== 1 || normalizeNoticePhone(s.testPhone) !== recipients[0].phone)
      fail("테스트 번호가 바뀌었습니다. 다시 발송 준비해 주세요.", 409);
  } else {
    const all = new Map(customers(b.notice_id, now, b.id).map(c => [c.id, c]));
    for (const r of recipients) {
      const c = all.get(r.customer_id);
      if (!c || c.reason || c.phone !== r.phone || c.name !== r.name)
        fail("거래처 정보 또는 발송 이력이 바뀌었습니다. 다시 발송 준비해 주세요.", 409);
    }
  }
  return recipients;
}
function releaseFailed(b: BatchRow, r: RecipientRow) {
  if (b.mode === "live") sqlite.prepare("DELETE FROM notice_message_claims WHERE notice_id = ? AND phone = ? AND batch_id = ?").run(b.notice_id, r.phone, b.id);
}
function updateRecipient(b: BatchRow, r: RecipientRow, status: NoticeMessageStatus, detail: string, messageId = "") {
  sqlite.prepare("UPDATE notice_message_recipients SET status = ?, detail = ?, message_id = ? WHERE batch_id = ? AND phone = ?")
    .run(status, detail.slice(0, 300), messageId, b.id, r.phone);
  if (status === "failed") releaseFailed(b, r);
}
function finishStatus(b: BatchRow, now: number) {
  const rows = recipientRows(b.id);
  const status = rows.some(r => r.status === "unknown") ? "unknown" : rows.some(r => r.status === "accepted" || r.status === "queued") ? "submitted" : "complete";
  sqlite.prepare("UPDATE notice_message_batches SET status = ?, updated_at = ? WHERE id = ?").run(status, now, b.id);
}
function providerEntries(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.entries(value).map(([id, r]) => ({ messageId: id, ...(r as object) }));
  return [];
}
function statusOf(code: unknown): NoticeMessageStatus {
  const n = Number(code);
  if (n === 4000) return "delivered";
  if (n === 2000 || n === 3000) return "accepted";
  if (n >= 1000 && n <= 9999) return "failed";
  return "unknown";
}
function applyResults(b: BatchRow, data: any, now: number, refresh = false) {
  const list = providerEntries(data.messageList);
  const failed = providerEntries(data.failedMessageList);
  sqlite.transaction(() => {
    for (const r of recipientRows(b.id)) {
      if (r.status === "delivered" || r.status === "failed") continue;
      const matches = (row: any) => normalizeNoticePhone(String(row.to || "")) === r.phone &&
        (!row.customFields?.noticeBatch || row.customFields.noticeBatch === b.id) &&
        (!refresh || row.messageId === r.message_id || row.customFields?.noticeBatch === b.id);
      const bad = failed.filter(matches);
      const ok = list.filter(matches);
      const result = bad.length === 1 ? bad[0] : ok.length === 1 ? ok[0] : undefined;
      if (result) {
        const status = bad.length === 1 ? "failed" : statusOf(result.statusCode);
        updateRecipient(b, r, status, String(result.statusMessage || (status === "accepted" ? "솔라피 접수 · 전달 결과 확인 대기" : "결과 확인 필요")), String(result.messageId || r.message_id));
      } else if (!refresh) updateRecipient(b, r, "unknown", "접수 결과가 확인되지 않았습니다. 중복 발송을 막고 결과를 확인합니다.");
    }
    const group = data.groupInfo?.groupId || data.groupInfo?._id;
    if (typeof group === "string") sqlite.prepare("UPDATE notice_message_batches SET group_id = ? WHERE id = ?").run(group, b.id);
    finishStatus(b, now);
  })();
}

function owner(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId || req.session.role !== "admin" || req.session.adminRole !== "owner")
    return res.status(403).json({ message: "소유자만 공지 메시지를 보낼 수 있습니다." });
  next();
}
function endpoint(fn: (req: Request, res: Response) => unknown | Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve().then(() => fn(req, res)).catch(error => {
      if (error instanceof NoticeError) return res.status(error.status).json({ message: error.message });
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0].message });
      // Provider response bodies can contain phone numbers. Keep them out of global server logs.
      if (error instanceof SolapiHttpError) return res.status(502).json({ message: `솔라피 연결을 확인해 주세요. (${error.status})` });
      if (error?.name === "TimeoutError" || error instanceof TypeError) return res.status(502).json({ message: "솔라피 응답을 확인하지 못했습니다. 잠시 후 다시 조회해 주세요." });
      next(error);
    });
  };
}

export function registerNoticeMessageRoutes(app: Express, options: { now?: () => number; timeoutMs?: number } = {}) {
  const now = options.now || Date.now;
  const timeoutMs = options.timeoutMs || 20000;
  const base = "/api/admin/notice-messages";
  app.get(base, owner, endpoint((req, res) => {
    const noticeId = z.coerce.number().int().positive().parse(req.query.noticeId);
    getNotice(noticeId);
    const reasons = connectionReasons();
    const history = (sqlite.prepare("SELECT * FROM notice_message_batches WHERE notice_id = ? AND status != 'draft' ORDER BY created_at DESC LIMIT 30").all(noticeId) as BatchRow[])
      .map(b => { const { text, imageUrl, ...rest } = viewBatch(markStalled(b, now())); return rest; });
    res.json({ ready: !reasons.length, reasons, channelName: "알림톡 설정에 연결된 카카오 채널",
      testPhone: normalizeNoticePhone(getSettings().testPhone), recipients: customers(noticeId, now()), history });
  }));

  app.post(`${base}/prepare`, owner, endpoint(async (req, res) => {
    const input = prepareNoticeMessageSchema.parse(req.body);
    const s = assertConnection();
    const notice = getNotice(input.noticeId);
    const imageUrl = input.includeImage ? notice.image_url : "";
    if (input.includeImage) validateNoticeMessageImage(imageUrl);
    const { chosen, exclusions } = input.mode === "live" ? resolveRecipients(input.customerIds, notice.id, now()) : {
      chosen: [{ id: 0, name: "설정된 테스트 번호", phone: normalizeNoticePhone(s.testPhone), recent: false, reason: "" }], exclusions: [],
    };
    if (!chosen.length) fail("보낼 수 있는 거래처가 없습니다. 제외 사유와 기존 발송 이력을 확인해 주세요.");
    if (!chosen[0].phone) fail("알림톡 설정에 테스트 휴대전화번호를 먼저 저장해 주세요.");
    const channel = await channelName(s.pfId);
    const pricing = await priceAndBalance();
    const total = money(pricing.unitPrice * chosen.length);
    if (pricing.available < total) fail(`솔라피 잔액이 부족합니다. 예상 차감액 ${total.toLocaleString("ko-KR")}원을 확인하고 충전해 주세요.`);
    const id = crypto.randomUUID();
    const created = now();
    sqlite.transaction(() => {
      sqlite.prepare(`INSERT INTO notice_message_batches
        (id, notice_id, owner_id, title, text, image_url, notice_version, pf_id, channel_name, mode, unit_price, total, exclusions, created_at, expires_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          id, notice.id, req.session.userId!, notice.title, input.text, imageUrl, notice.updated_at, s.pfId, channel, input.mode,
          pricing.unitPrice, total, JSON.stringify(exclusions), created, created + 10 * 60000, created);
      const insert = sqlite.prepare("INSERT INTO notice_message_recipients(batch_id, customer_id, name, phone) VALUES (?, ?, ?, ?)");
      for (const c of chosen) insert.run(id, c.id, c.name, c.phone);
    })();
    res.json(viewBatch(getBatch(id)));
  }));

  app.get(`${base}/:id`, owner, endpoint((req, res) => res.json(viewBatch(markStalled(getBatch(String(req.params.id)), now())))));

  app.post(`${base}/:id/send`, owner, endpoint(async (req, res) => {
    z.object({ confirmed: z.literal(true) }).strict().parse(req.body);
    const b = getBatch(String(req.params.id));
    if (b.owner_id !== req.session.userId) fail("발송 준비한 소유자가 최종 발송해 주세요.", 403);
    // Repeated clicks/HTTP retries only read the existing attempt, never submit again.
    if (b.status !== "draft") return res.json(viewBatch(b));
    assertSendTime(now());
    if (now() > b.expires_at) fail("발송 확인 시간이 지났습니다. 문구·대상·비용을 다시 확인해 주세요.", 409);
    assertUnchanged(b, now());
    const pricing = await priceAndBalance();
    if (pricing.unitPrice > b.unit_price) fail("단가가 변경되었습니다. 예상 비용을 다시 확인해 주세요.", 409);
    if (pricing.available < b.total) fail("솔라피 잔액이 부족합니다. 충전 후 다시 발송 준비해 주세요.");

    const reserved = sqlite.transaction(() => {
      if (getBatch(b.id).status !== "draft") return false;
      const recipients = assertUnchanged(b, now());
      if (b.mode === "live") {
        const claim = sqlite.prepare("INSERT INTO notice_message_claims(notice_id, phone, batch_id) VALUES (?, ?, ?)");
        for (const r of recipients) claim.run(b.notice_id, r.phone, b.id);
      }
      sqlite.prepare("UPDATE notice_message_batches SET status = 'preparing', updated_at = ? WHERE id = ?").run(now(), b.id);
      return true;
    })();
    if (!reserved) return res.json(viewBatch(getBatch(b.id)));
    let imageId = "";
    try {
      if (b.image_url) {
        const image = validateNoticeMessageImage(b.image_url);
        const uploaded = await solapi("POST", "/storage/v1/files", { ...image, type: "BMS", link: NOTICE_MESSAGE_URL }, timeoutMs);
        if (typeof uploaded.fileId !== "string" || !uploaded.fileId) fail("카카오 이미지 업로드를 확인하지 못했습니다.");
        imageId = uploaded.fileId;
      }
      assertSendTime(now());
      assertUnchanged(b, now());
    } catch {
      // No message endpoint has been called yet: it is safe to release these reservations.
      sqlite.transaction(() => {
        for (const r of recipientRows(b.id)) updateRecipient(b, r, "failed", "발송 준비 중 중단됨 · 공지/연결/이미지를 확인하고 다시 준비해 주세요.");
        finishStatus(b, now());
      })();
      return res.json(viewBatch(getBatch(b.id)));
    }

    sqlite.prepare("UPDATE notice_message_batches SET status = 'sending', updated_at = ? WHERE id = ?").run(now(), b.id);
    const recipients = recipientRows(b.id);
    try {
      const response = await solapi("POST", "/messages/v4/send-many/detail", {
        messages: recipients.map(r => ({
          to: r.phone, country: "82", type: "BMS_FREE", text: b.text,
          customFields: { noticeBatch: b.id },
          kakaoOptions: { pfId: b.pf_id, disableSms: true, bms: {
            targeting: "I", chatBubbleType: imageId ? "IMAGE" : "TEXT", ...(imageId ? { imageId } : {}),
            buttons: [{ name: NOTICE_MESSAGE_BUTTON, linkType: "WL", linkMobile: NOTICE_MESSAGE_URL, linkPc: NOTICE_MESSAGE_URL }],
          } },
        })), allowDuplicates: false, showMessageList: true,
      }, timeoutMs);
      applyResults(b, response, now());
    } catch (error) {
      const rejected = error instanceof SolapiHttpError && error.status >= 400 && error.status < 500 && error.status !== 408;
      sqlite.transaction(() => {
        for (const r of recipientRows(b.id)) {
          // Never overwrite results already recorded if a later persistence operation failed.
          if (r.status !== "queued") continue;
          updateRecipient(b, r, rejected ? "failed" : "unknown", rejected
            ? `솔라피 요청 거절 (${(error as SolapiHttpError).status}) · ${(error as SolapiHttpError).message}`
            : "응답 확인 실패 · 실제 발송됐을 수 있어 재발송을 차단했습니다. 솔라피 발송 내역을 확인해 주세요.");
        }
        finishStatus(b, now());
      })();
    }
    res.json(viewBatch(getBatch(b.id)));
  }));

  app.post(`${base}/:id/refresh`, owner, endpoint(async (req, res) => {
    const b = markStalled(getBatch(String(req.params.id)), now());
    if (b.status === "draft") return res.json(viewBatch(b));
    const ids = recipientRows(b.id).filter(r => r.status !== "failed" && r.status !== "delivered").map(r => r.message_id).filter(Boolean);
    if (b.group_id || ids.length) {
      const query = new URLSearchParams({ limit: "500", ...(b.group_id ? { groupId: b.group_id } : { messageIds: JSON.stringify(ids) }) });
      const data = await solapi("GET", `/messages/v4/list?${query}`);
      applyResults(b, data, now(), true);
    }
    res.json(viewBatch(getBatch(b.id)));
  }));
}
