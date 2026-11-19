import type Database from 'better-sqlite3';
import type { sendAlimtalk } from './alimtalk';
import { carrierNames } from '../shared/shipping';

type DB = Database.Database;
type Send = typeof sendAlimtalk;
type Message = Parameters<Send>[0];
type Reservation = { order_id: number; consignment_id: number; customer_id: number; template_id: string };

export function installPartialDispatchNotices(db: DB) {
  db.exec(`CREATE TABLE IF NOT EXISTS partial_dispatch_notices (
    order_id INTEGER PRIMARY KEY, consignment_id INTEGER NOT NULL UNIQUE, customer_id INTEGER NOT NULL,
    template_id TEXT NOT NULL, state TEXT NOT NULL CHECK (state IN ('reserved','claimed','accepted','rejected','unknown','skipped')),
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS partial_dispatch_reserved ON partial_dispatch_notices(order_id) WHERE state='reserved';`);
}

function parcelSummary(carrier: string, trackings: string[]): string {
  const name = carrierNames[carrier] || '택배';
  if (trackings.length === 1) return name + ' ' + trackings[0];
  const shown = trackings.slice(0, 5);
  const lines = [name + ' · 총 ' + trackings.length + '상자', ...shown.map((tracking, index) => (index + 1) + '번 상자  ' + tracking)];
  if (shown.length < trackings.length) lines.push('외 ' + (trackings.length - shown.length) + '상자 · 전체 송장은 주문 내역에서 확인해 주세요.');
  return lines.join('\n');
}

function verifiedMobile(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9 ()-]+$/.test(value)) return '';
  const digits = value.replace(/\D/g,'');
  return /^010\d{8}$/.test(digits) && !/^010(?:0{8}|1{8}|12345678)$/.test(digits) ? digits : '';
}

function customerMessage(db: DB, orderId: number, legId: number): Message | undefined {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='alimtalk_settings'").get()) return;
  const settings = db.prepare('SELECT * FROM alimtalk_settings WHERE id=1 AND enabled=1').get() as
    { tpl_partial_dispatch?:string; tpl_multi_box_dispatch?:string } | undefined;
  if (!settings?.tpl_partial_dispatch && !settings?.tpl_multi_box_dispatch) return;
  const row = db.prepare(`SELECT o.order_no, o.customer_snapshot, c.id AS customer_id, c.business_name, c.phone,
      leg.method, leg.carrier, leg.tracking, leg.complete
    FROM roastery_consignments leg JOIN orders o ON o.id=leg.order_id JOIN customers c ON c.id=o.customer_id
    WHERE leg.id=? AND leg.order_id=? AND NOT EXISTS (
      SELECT 1 FROM roastery_consignments previous WHERE previous.order_id=leg.order_id AND previous.id<leg.id
    ) AND o.status='done' AND o.is_sample=0 AND o.is_store_order=0
    AND leg.order_fingerprint=roastery_dispatch_fingerprint(o.items,o.customer_snapshot,o.status,o.tracking_no)
    AND c.role='customer' AND c.is_store=0 AND c.biz_verified=1
    AND NOT EXISTS (SELECT 1 FROM alimtalk_optout WHERE customer_id=c.id AND off=1)`).get(legId,orderId) as {
      customer_id:number; order_no:string; customer_snapshot:string; business_name:string; phone:string;
      method:'parcel'|'quick'|'direct'; carrier:string; tracking:string; complete:number;
    } | undefined;
  if (!row || /^(?:test(?:\b|[0-9_])|테스트|샘플)/i.test(row.business_name.trim())) return;
  const phone = verifiedMobile(row.phone);
  if (!phone) return;
  let snapshot: {phone?:unknown} | null;
  try { snapshot = JSON.parse(row.customer_snapshot); } catch { return; }
  if (phone !== verifiedMobile(snapshot?.phone)) return;
  const kind = row.complete ? 'multi_box_dispatch' : 'partial_dispatch';
  const templateId = (row.complete ? settings.tpl_multi_box_dispatch : settings.tpl_partial_dispatch)?.trim();
  if (!templateId) return;
  let shipping: string;
  if (row.method === 'parcel') {
    const boxes = db.prepare('SELECT tracking FROM roastery_consignment_boxes WHERE consignment_id=? ORDER BY position').all(legId) as {tracking:string}[];
    if (row.complete && !boxes.length) return;
    shipping = parcelSummary(row.carrier,[row.tracking,...boxes.map(box => box.tracking)]);
  } else {
    if (row.complete) return;
    shipping = row.method === 'quick' ? '퀵' : '직접배송';
  }
  const variable = row.complete ? '상자별송장' : '배송정보';
  return {
    kind, ref: String(orderId), customerId: row.customer_id, businessName: row.business_name,
    phone, templateId, variables: { 주문번호: row.order_no, [variable]: shipping }, disableSms: true, receiptMode: 'strict-kakao',
  };
}

// Called inside the transaction that inserts the first leg. There is no historical scan.
export function reservePartialDispatchNotice(db: DB, orderId: number, legId: number): boolean {
  const msg = customerMessage(db,orderId,legId);
  if (!msg) return false;
  const now = Date.now();
  return db.prepare(`INSERT INTO partial_dispatch_notices
    (order_id,consignment_id,customer_id,template_id,state,created_at,updated_at) VALUES(?,?,?,?,'reserved',?,?)
    ON CONFLICT(order_id) DO NOTHING`).run(orderId,legId,msg.customerId,msg.templateId,now,now).changes === 1;
}

const sendWithSolapi: Send = async message => (await import('./alimtalk')).sendAlimtalk(message);

export async function drainPartialDispatchNotices(db: DB, send: Send = sendWithSolapi) {
  const pending = db.prepare(`SELECT order_id,consignment_id,customer_id,template_id FROM partial_dispatch_notices
    WHERE state='reserved' ORDER BY order_id LIMIT 25`).all() as Reservation[];
  for (const row of pending) {
    const message = customerMessage(db,row.order_id,row.consignment_id);
    // Claim before network I/O. On a lost response or a process crash, never send this order again.
    if (!db.prepare("UPDATE partial_dispatch_notices SET state='claimed',updated_at=? WHERE order_id=? AND state='reserved'")
      .run(Date.now(),row.order_id).changes) continue;
    let state = 'skipped';
    if (message && message.templateId === row.template_id && message.customerId === row.customer_id) {
      try {
        const result = await send(message);
        state = result.receipt || 'skipped';
      } catch { state = 'unknown'; }
    }
    db.prepare("UPDATE partial_dispatch_notices SET state=?,updated_at=? WHERE order_id=? AND state='claimed'").run(state,Date.now(),row.order_id);
  }
}

export function startPartialDispatchNotices(db: DB) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await drainPartialDispatchNotices(db); }
    catch { console.error('[partial-dispatch] 알림 대기열 처리 실패'); }
    finally { running = false; }
  }, 2000);
  timer.unref();
}
