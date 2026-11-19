import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import type { Consignment, DispatchSummary } from '../shared/roastery-dispatch';
import { hasValidShippingTracking } from './roastery-tracking';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

type Order = {
  order_id: number; roastery_id: number | null; items: string; customer_snapshot: string;
  order_status: string; legacy_tracking: string; state: string | null; tracking: string | null;
  carrier: string | null; order_fingerprint: string | null; shipment_version: number | null;
};
type StoredLeg = {
  id: number; order_id: number; method: Consignment['method']; carrier: string; tracking: string;
  created_at: number; complete: number; order_fingerprint: string;
};
type Actor = { orderId: number; actor: number; roasteryId?: number; linkId?: string };

const selectOrder = `SELECT o.id AS order_id,a.roastery_id,o.items,o.customer_snapshot,o.status AS order_status,
  o.tracking_no AS legacy_tracking,s.state,s.tracking,s.carrier,s.order_fingerprint,s.version AS shipment_version
  FROM orders o LEFT JOIN roastery_assignments a ON a.order_id=o.id
  LEFT JOIN roastery_shipments s ON s.order_id=o.id WHERE o.id=?`;
const selectLegs = 'SELECT id,order_id,method,carrier,tracking,created_at,complete,order_fingerprint FROM roastery_consignments';

// A price or tax correction alone does not change the physical shipment.
function orderFingerprint(items: string, snapshot: string, status: string, legacy: string) {
  let recipient: Record<string,unknown> = {};
  try { recipient = JSON.parse(snapshot) || {}; } catch { /* Invalid snapshots are distinct from valid recipients. */ }
  let contents: unknown = items;
  try {
    const parsed = JSON.parse(items);
    if (Array.isArray(parsed)) contents = parsed.map(i => [i?.productId ?? null,i?.name,i?.qty]);
  } catch { /* Retain the original legacy value in the revision. */ }
  return hash([contents,
    recipient.businessName, recipient.managerName, recipient.defaultAddress, recipient.phone, status, legacy]);
}

export const dispatchCompleteSql = `EXISTS (SELECT 1 FROM roastery_consignments rc WHERE rc.order_id=o.id AND rc.complete=1
  AND rc.order_fingerprint=roastery_dispatch_fingerprint(o.items,o.customer_snapshot,o.status,o.tracking_no))`;

export class DispatchError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function installRoasteryDispatch(db: Database.Database) {
  db.function('roastery_dispatch_fingerprint', {deterministic:true}, (items,snapshot,status,legacy) =>
    orderFingerprint(String(items),String(snapshot),String(status),String(legacy ?? '')));
  db.exec(`CREATE TABLE IF NOT EXISTS roastery_consignments (
    id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, method TEXT NOT NULL CHECK(method IN ('parcel','quick','direct')),
    carrier TEXT NOT NULL, tracking TEXT NOT NULL,
    complete INTEGER NOT NULL CHECK(complete IN (0,1)), order_fingerprint TEXT NOT NULL,
    requester TEXT NOT NULL, request_key TEXT NOT NULL, request_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
    CHECK ((method='parcel' AND carrier!='' AND tracking!='') OR (method!='parcel' AND carrier='' AND tracking='')),
    UNIQUE(requester, request_key)
  );
  CREATE INDEX IF NOT EXISTS roastery_consignments_order ON roastery_consignments(order_id,id);
  CREATE UNIQUE INDEX IF NOT EXISTS roastery_consignment_tracking ON roastery_consignments(carrier,tracking) WHERE method='parcel';
  CREATE UNIQUE INDEX IF NOT EXISTS roastery_consignment_final ON roastery_consignments(order_id) WHERE complete=1;`);
}

function summarize(row: Order, legs: StoredLeg[]): DispatchSummary {
  const fingerprint = orderFingerprint(row.items,row.customer_snapshot,row.order_status,row.legacy_tracking ?? '');
  const consignments: Consignment[] = legs.map(leg => ({
    id:leg.id, method:leg.method, carrier:leg.carrier, tracking:leg.tracking, createdAt:leg.created_at,
    completion:leg.complete ? 'complete' : 'partial'
  }));
  const changed = legs.some(leg => leg.order_fingerprint !== fingerprint);
  let status: DispatchSummary['status'] = 'open';
  if (row.order_status === 'cancelled' || changed) {
    status = 'review_required';
  } else if (legs.length) {
    status = legs.at(-1)!.complete ? 'complete' : 'partial';
  } else if (hasValidShippingTracking(row)) {
    status = 'complete';
  } else if (row.state && row.state !== 'rejected') {
    status = 'review_required';
  }
  const revision = hash([row.order_id,row.roastery_id,fingerprint,row.shipment_version,row.state,legs.at(-1)?.id ?? 0]);
  return {revision,status,consignments};
}

export function readDispatch(db: Database.Database, orderId: number): DispatchSummary {
  const order = db.prepare(selectOrder).get(orderId) as Order | undefined;
  if (!order) throw new DispatchError(404,'주문을 찾을 수 없습니다.');
  return summarize(order,db.prepare(selectLegs+' WHERE order_id=? ORDER BY id').all(orderId) as StoredLeg[]);
}

export function dispatchSummaries(db: Database.Database, rows: Order[]): Map<number,DispatchSummary> {
  const summaries = new Map<number,DispatchSummary>();
  if (!rows.length) return summaries;
  const grouped = new Map<number,StoredLeg[]>();
  const ids = JSON.stringify(rows.map(row => row.order_id));
  const legs = db.prepare(selectLegs+' WHERE order_id IN (SELECT value FROM json_each(?)) ORDER BY id').all(ids) as StoredLeg[];
  for (const leg of legs) {
    const list = grouped.get(leg.order_id);
    if (list) list.push(leg);
    else grouped.set(leg.order_id,[leg]);
  }
  for (const row of rows) summaries.set(row.order_id,summarize(row,grouped.get(row.order_id) ?? []));
  return summaries;
}

// The original whole-order flows (including XLSX) cannot overwrite a recorded dispatch or reuse one of its waybills.
export function conflictsWithDispatch(db: Database.Database, orderId: number | undefined, carrier: string, tracking: string) {
  return !!db.prepare(`SELECT 1 FROM roastery_consignments WHERE order_id=?
    UNION ALL SELECT 1 FROM roastery_consignments WHERE method='parcel' AND carrier=? AND tracking=? LIMIT 1`).get(orderId ?? -1,carrier,tracking);
}

const inputSchema = z.object({
  revision:z.string().regex(/^[a-f0-9]{64}$/), requestKey:z.string().uuid(),
  method:z.enum(['parcel','quick','direct']), carrier:z.string().max(12).optional(),
  tracking:z.string().trim().max(30).optional(),
  completion:z.enum(['partial','complete'])
}).strict();

export function saveDispatch(db: Database.Database, actor: Actor, input: unknown): { dispatch: DispatchSummary } {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new DispatchError(400,'배송 방법과 부분 출고·출고 완료 선택을 확인해 주세요.');
  const p = parsed.data;
  const carrier = p.carrier ?? '', tracking = p.tracking ?? '';
  if (p.method === 'parcel') {
    if (!['CJ','HANJIN','LOTTE','POST','LOGEN'].includes(carrier) || !/^\d{8,30}$/.test(tracking))
      throw new DispatchError(400,'택배사와 8~30자리 숫자 송장번호를 입력해 주세요.');
  } else if (carrier || tracking) throw new DispatchError(400,'퀵·직배는 택배사와 송장번호를 비워 주세요.');

  const save = () => {
    if (actor.linkId && !db.prepare('SELECT 1 FROM roastery_links WHERE id=? AND roastery_id=? AND revoked_at IS NULL AND expires_at>?')
      .get(actor.linkId,actor.roasteryId ?? -1,Date.now())) throw new DispatchError(401,'링크 사용 기간이나 접근 권한을 확인해 주세요.');
    const order = db.prepare(selectOrder).get(actor.orderId) as Order | undefined;
    if (!order?.roastery_id || (actor.roasteryId !== undefined && order.roastery_id !== actor.roasteryId))
      throw new DispatchError(404,'담당 주문을 찾을 수 없습니다.');
    const requester = actor.linkId ? 'link:'+actor.linkId : 'user:'+actor.actor;
    const signature = hash([actor.orderId,p.revision,p.method,carrier,tracking,p.completion]);
    const previous = db.prepare('SELECT request_hash FROM roastery_consignments WHERE requester=? AND request_key=?')
      .get(requester,p.requestKey) as {request_hash:string} | undefined;
    const current = readDispatch(db,actor.orderId);
    if (previous) {
      if (previous.request_hash !== signature) throw new DispatchError(409,'다른 출고에 사용된 요청입니다. 목록을 다시 확인해 주세요.');
      return {dispatch:current};
    }
    if (order.order_status !== 'done') throw new DispatchError(409,'니트커피에서 확인을 마친 주문만 출고할 수 있습니다.');
    if (p.revision !== current.revision) throw new DispatchError(409,'주문 또는 출고 내역이 바뀌었습니다. 새로고침한 뒤 출고 내역을 확인해 주세요.');
    if (current.status !== 'open' && current.status !== 'partial') throw new DispatchError(409,'추가로 출고할 수 없는 주문입니다. 기존 출고 내역을 확인해 주세요.');
    if (p.method === 'parcel') {
      const recipient = JSON.parse(order.customer_snapshot);
      if (!recipient?.phone?.trim() || !recipient?.defaultAddress?.trim()) throw new DispatchError(409,'배송지와 수취인 연락처를 확인해 주세요.');
      const used = db.prepare(`SELECT 1 FROM roastery_consignments WHERE method='parcel' AND carrier=? AND tracking=?
        UNION ALL SELECT 1 FROM roastery_shipments WHERE carrier=? AND tracking=? AND state!='rejected'
        UNION ALL SELECT 1 FROM orders WHERE trim(tracking_no)=? LIMIT 1`).get(carrier,tracking,carrier,tracking,tracking);
      if (used) throw new DispatchError(409,'이미 등록된 송장번호입니다. 송장번호를 다시 확인해 주세요.');
    }
    const complete = p.completion === 'complete';
    const now = Date.now();
    const leg = db.prepare(`INSERT INTO roastery_consignments
      (order_id,method,carrier,tracking,complete,order_fingerprint,requester,request_key,request_hash,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(actor.orderId,p.method,carrier,tracking,+complete,
      orderFingerprint(order.items,order.customer_snapshot,order.order_status,order.legacy_tracking ?? ''),requester,p.requestKey,signature,now);
    db.prepare('INSERT INTO roastery_audit(order_id,actor,action,details,created_at) VALUES(?,?,?,?,?)')
      .run(actor.orderId,actor.actor,complete?'dispatch_completed':'partial_dispatched',
        JSON.stringify({consignmentId:Number(leg.lastInsertRowid),method:p.method,...(actor.linkId?{linkId:actor.linkId,identity:'bearer_not_person'}:{})}),now);
    return {dispatch:readDispatch(db,actor.orderId)};
  };
  // Link access revalidates expiry and scope in an outer write transaction.
  return db.inTransaction || (db as Database.Database & {isTransaction?:boolean}).isTransaction ? save() : db.transaction(save).immediate();
}
