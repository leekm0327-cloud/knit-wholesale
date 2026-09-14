import type Database from 'better-sqlite3';
import type { Express, RequestHandler } from 'express';
import { z } from 'zod';
import { alertConfigSchema, alertDay, alertKinds, alertLabels, alertTime, dayPlus, defaultAlertConfig, effectiveHours, kstDay, kstStamp, mobilePhone, templateNames, type AlertConfig, type AlertKind } from '../shared/staff-alerts';

type DB = Database.Database;
type Template = { templateId: string; name: string; status?: string; inspectionStatus?: string; content?: string; [key: string]: any };
type Mapping = { id: string; name: string; content: string; variables: string[]; links: string[]; checkedAt: number };
type State = { config: AlertConfig; templates: Partial<Record<AlertKind, Mapping>>; version: number; activeAt: number; scheduleFrom: string };
type Delivery = { key: string; kind: AlertKind; staffId: number; day: string; due: number; variables: Record<string, string>; orderId?: number };
export type AlertDependencies = {
  ready: () => string[];
  templates: () => Promise<Template[]>;
  template: (id: string) => Promise<Template>;
  send: (p: { kind: string; customerId: number; businessName: string; phone: string; templateId: string; variables: Record<string, string>; ref: string; disableSms: boolean }) => Promise<{ ok: boolean; detail: string }>;
  notify: (p: { type: string; title: string; body: string; link: string }) => Promise<unknown>;
};

export function initStaffAlerts(db: DB) {
  db.exec(`CREATE TABLE IF NOT EXISTS staff_alert_settings(id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL, templates TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 0, active_at INTEGER NOT NULL DEFAULT 0, schedule_from TEXT NOT NULL DEFAULT '');
  CREATE TABLE IF NOT EXISTS staff_alert_outbox(event_key TEXT PRIMARY KEY,kind TEXT NOT NULL,staff_id INTEGER NOT NULL,work_date TEXT NOT NULL,order_id INTEGER,due_at INTEGER NOT NULL,variables TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',detail TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,attempted_at INTEGER,finished_at INTEGER);
  CREATE INDEX IF NOT EXISTS staff_alert_pending ON staff_alert_outbox(status,due_at);
  CREATE TABLE IF NOT EXISTS staff_alert_snoozes(staff_id INTEGER NOT NULL,work_date TEXT NOT NULL,until_at INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(staff_id,work_date));
  CREATE TABLE IF NOT EXISTS staff_daily_submissions(work_date TEXT NOT NULL,kind TEXT NOT NULL,staff_id INTEGER NOT NULL,submitted_at INTEGER NOT NULL,PRIMARY KEY(work_date,kind));
  CREATE TABLE IF NOT EXISTS staff_attendance_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,staff_id INTEGER NOT NULL,attendance_id INTEGER NOT NULL,work_date TEXT NOT NULL,clock_in_before INTEGER NOT NULL,clock_out_before INTEGER,requested_out INTEGER NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL,decided_at INTEGER,decided_by INTEGER,decision_memo TEXT NOT NULL DEFAULT '');
  CREATE UNIQUE INDEX IF NOT EXISTS staff_attendance_request_pending ON staff_attendance_requests(attendance_id) WHERE status='pending';
  CREATE TABLE IF NOT EXISTS staff_alert_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id INTEGER NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL,created_at INTEGER NOT NULL);`);
  db.prepare('INSERT OR IGNORE INTO staff_alert_settings(id,config) VALUES(1,?)').run(JSON.stringify(defaultAlertConfig));
}
export function readAlertState(db: DB): State {
  const r = db.prepare('SELECT * FROM staff_alert_settings WHERE id=1').get() as any;
  return { config: alertConfigSchema.parse(JSON.parse(r.config)), templates: JSON.parse(r.templates), version: r.version, activeAt: r.active_at, scheduleFrom: r.schedule_from };
}
const audit = (db: DB, actor: number, action: string, detail: unknown, now = Date.now()) => db.prepare('INSERT INTO staff_alert_audit(actor_id,action,detail,created_at) VALUES(?,?,?,?)').run(actor, action, JSON.stringify(detail), now);
const people = (db: DB) => db.prepare('SELECT id,name,phone FROM staff WHERE active=1 ORDER BY id').all() as { id: number; name: string; phone: string }[];
const attendance = (db: DB, staffId: number, day: string) => db.prepare('SELECT * FROM attendance WHERE staff_id=? AND work_date=?').get(staffId, day) as any;
const pendingRequest = (db: DB, staffId: number, day: string) => db.prepare("SELECT id FROM staff_attendance_requests WHERE staff_id=? AND work_date=? AND status='pending'").get(staffId, day);
function insertDelivery(db: DB, d: Delivery, now: number) {
  db.prepare('INSERT OR IGNORE INTO staff_alert_outbox(event_key,kind,staff_id,work_date,order_id,due_at,variables,created_at) VALUES(?,?,?,?,?,?,?,?)').run(d.key, d.kind, d.staffId, d.day, d.orderId ?? null, d.due, JSON.stringify(d.variables), now);
}

export function dayShifts(db: DB, day: string, config = readAlertState(db).config) {
  const rows = db.prepare(`SELECT sh.id,sh.staff_id AS staffId,sh.work_date AS workDate,sh.position,sh.start_time AS startTime,sh.end_time AS endTime,p.name,p.phone FROM shifts sh JOIN staff p ON p.id=sh.staff_id AND p.active=1 WHERE sh.work_date=? AND NOT EXISTS(SELECT 1 FROM leave_requests l WHERE l.staff_id=sh.staff_id AND l.status='approved' AND l.half_day=0 AND l.start_date<=sh.work_date AND l.end_date>=sh.work_date) ORDER BY sh.id`).all(day) as any[];
  return rows.map(row => ({ ...row, hours: effectiveHours(config, row) }));
}
function recorded(db: DB, day: string, kind: AlertKind) {
  if (kind === 'recipe') return !!db.prepare('SELECT id FROM espresso_logs WHERE log_date=? LIMIT 1').get(day);
  const side = kind === 'production' ? 'produced_at' : 'discarded_at';
  return !!db.prepare('SELECT 1 FROM staff_daily_submissions WHERE work_date=? AND kind=?').get(day, kind === 'production' ? 'produce' : 'discard') || !!db.prepare(`SELECT id FROM dessert_logs WHERE prod_date=? AND ${side} IS NOT NULL LIMIT 1`).get(day);
}
export function scheduledDeliveries(db: DB, now: number, state = readAlertState(db)): Delivery[] {
  if (!state.config.enabled) return [];
  const c = state.config, result: Delivery[] = [];
  // Yesterday is needed for a bounded post-shift reminder or midnight snooze only.
  for (const day of [dayPlus(kstDay(now), -1), kstDay(now)]) {
    if (day < state.scheduleFrom || !c.holidayYears.includes(Number(day.slice(0, 4)))) continue;
    const shifts = dayShifts(db, day, c).filter(s => s.hours);
    const grouped = new Map<number, any[]>();
    for (const sh of shifts) grouped.set(sh.staffId, [...(grouped.get(sh.staffId) ?? []), sh]);
    for (const [staffId, team] of Array.from(grouped.entries())) {
      const first = team.reduce((a, b) => a.hours.startAt < b.hours.startAt ? a : b);
      const last = team.reduce((a, b) => a.hours.endAt > b.hours.endAt ? a : b);
      const att = attendance(db, staffId, day);
      const vars = { 이름: first.name, 근무일: day, 날짜: day, 출근시간: first.hours.start, 퇴근시간: last.hours.end, 조: team.map(s => s.position).join(' / ') };
      const add = (kind: AlertKind, due: number, expires: number, missing: boolean, suffix = '0') => {
        if (c.events[kind] && missing && now >= due && now <= expires) result.push({ key: `${day}:${staffId}:${kind}:${suffix}`, kind, staffId, day, due, variables: vars });
      };
      add('clock_in', first.hours.startAt + c.clockInAfter * 60000, last.hours.endAt, !att?.clock_in_at && !att?.clock_out_at);
      const snooze = db.prepare('SELECT * FROM staff_alert_snoozes WHERE staff_id=? AND work_date=?').get(staffId, day) as any;
      const outDue = Math.max(last.hours.endAt + c.clockOutAfter * 60000, snooze?.until_at ?? 0);
      add('clock_out', outDue, last.hours.endAt + 4 * 3600000, !!att?.clock_in_at && !att?.clock_out_at && !pendingRequest(db, staffId, day), String(snooze?.count ?? 0));
      if (team.some(s => s.position === 'Open')) add('recipe', first.hours.startAt + c.recipeAfter * 60000, last.hours.endAt, !recorded(db, day, 'recipe'));
      if (team.some(s => s.position === 'Close' || s.position === 'Close2')) add('waste', last.hours.endAt - c.wasteBefore * 60000, last.hours.endAt + 30 * 60000, !recorded(db, day, 'waste'));
      if (team.some(s => s.position === 'Baker')) add('production', last.hours.endAt - c.productionBefore * 60000, last.hours.endAt + 30 * 60000, !recorded(db, day, 'production'));
    }
  }
  return result;
}

/** Called inside the supply write transaction; only future business events are queued. */
export function queueSupplyAlert(db: DB, orderId: number, kind: 'supply_order' | 'supply_received', actorName: string, now = Date.now()) {
  const s = readAlertState(db);
  if (!s.config.enabled || !s.config.events[kind] || now < s.activeAt) return;
  const order = db.prepare('SELECT o.*,m.expected_date,m.received_at FROM supply_orders o LEFT JOIN supply_order_meta m ON m.order_id=o.id WHERE o.id=?').get(orderId) as any;
  if (!order) return;
  const vars = { 등록자: actorName, 입고처리자: actorName, 처리자: actorName, 거래처: order.vendor || '구입처 미기재', 발주내용: String(order.body).slice(0, 500), 입고내용: String(order.body).slice(0, 500), 입고예정일: order.expected_date || '미정', 발주일: order.order_date, 입고일: kstDay(now), 날짜: kstDay(now) };
  const uniquePhones = new Set<string>();
  for (const p of people(db).filter(p => s.config.recipients.includes(p.id))) {
    const phone = p.phone.replace(/\D/g, '');
    if (uniquePhones.has(phone)) continue;
    uniquePhones.add(phone);
    insertDelivery(db, { key: `supply:${orderId}:${kind}:${p.id}`, kind, staffId: p.id, day: kstDay(now), orderId, due: now, variables: vars }, now);
  }
}

export function noteDailySubmission(db: DB, day: string, kind: 'produce' | 'discard', staffId: number) {
  db.prepare('INSERT INTO staff_daily_submissions(work_date,kind,staff_id,submitted_at) VALUES(?,?,?,?) ON CONFLICT(work_date,kind) DO UPDATE SET staff_id=excluded.staff_id,submitted_at=excluded.submitted_at').run(day, kind, staffId, Date.now());
}
export function snoozeClockOut(db: DB, staffId: number, day: string, now = Date.now()) {
  return db.transaction(() => {
    const c = readAlertState(db).config, att = attendance(db, staffId, day);
    const sh = dayShifts(db, day, c).filter(s => s.staffId === staffId && s.hours);
    const end = Math.max(...sh.map(s => s.hours!.endAt));
    if (!att?.clock_in_at || att.clock_out_at || pendingRequest(db, staffId, day) || !sh.length || now < end || now > end + 4 * 3600000) throw Error('현재 확인할 미퇴근 근무가 없습니다.');
    const old = db.prepare('SELECT * FROM staff_alert_snoozes WHERE staff_id=? AND work_date=?').get(staffId, day) as any;
    if (old?.until_at > now) return { until: old.until_at, count: old.count };
    if ((old?.count ?? 0) >= c.maxSnoozes) throw Error('오늘 재알림 횟수를 모두 사용했습니다. 퇴근할 때 기록해 주세요.');
    const count = (old?.count ?? 0) + 1, until = now + c.snoozeMinutes * 60000;
    db.prepare('INSERT INTO staff_alert_snoozes VALUES(?,?,?,?) ON CONFLICT(staff_id,work_date) DO UPDATE SET until_at=excluded.until_at,count=excluded.count').run(staffId, day, until, count);
    audit(db, staffId, 'still_working', { day, until, count }, now);
    return { until, count };
  })();
}
export function requestClockOut(db: DB, staffId: number, day: string, requestedOut: number, reason: string, now = Date.now()) {
  return db.transaction(() => {
    const att = attendance(db, staffId, day);
    if (!att?.clock_in_at || att.clock_out_at) throw Error('퇴근이 누락된 본인 출근 기록만 신청할 수 있습니다.');
    if (requestedOut <= att.clock_in_at || requestedOut > now || requestedOut > att.clock_in_at + 24 * 3600000) throw Error('실제 퇴근 시간은 출근 이후부터 현재까지, 24시간 이내로 입력해 주세요.');
    if (pendingRequest(db, staffId, day)) throw Error('이미 승인 대기 중입니다.');
    return Number(db.prepare('INSERT INTO staff_attendance_requests(staff_id,attendance_id,work_date,clock_in_before,clock_out_before,requested_out,reason,created_at) VALUES(?,?,?,?,?,?,?,?)').run(staffId, att.id, day, att.clock_in_at, att.clock_out_at, requestedOut, reason, now).lastInsertRowid);
  })();
}
export function decideClockOut(db: DB, id: number, approved: boolean, actorId: number, memo: string, now = Date.now()) {
  db.transaction(() => {
    const r = db.prepare('SELECT * FROM staff_attendance_requests WHERE id=?').get(id) as any;
    if (!r || r.status !== 'pending') throw Error('이미 처리됐거나 없는 신청입니다.');
    if (approved) {
      const changed = db.prepare('UPDATE attendance SET clock_out_at=?,edited_by_admin=1 WHERE id=? AND staff_id=? AND work_date=? AND clock_in_at=? AND clock_out_at IS ?').run(r.requested_out, r.attendance_id, r.staff_id, r.work_date, r.clock_in_before, r.clock_out_before);
      if (!changed.changes) throw Error('신청 이후 근태가 바뀌었습니다. 현재 기록을 확인하고 반려해 주세요.');
    }
    db.prepare('UPDATE staff_attendance_requests SET status=?,decided_at=?,decided_by=?,decision_memo=? WHERE id=?').run(approved ? 'approved' : 'rejected', now, actorId, memo, id);
    audit(db, actorId, 'attendance_decision', { id, approved, memo }, now);
  })();
}

const allowedVariables: Record<AlertKind, string[]> = {
  supply_order: ['등록자', '거래처', '발주내용', '입고예정일', '발주일', '날짜'],
  supply_received: ['등록자', '입고처리자', '처리자', '거래처', '발주내용', '입고내용', '입고예정일', '발주일', '입고일', '날짜'],
  clock_in: ['이름', '근무일', '날짜', '출근시간', '퇴근시간', '조'],
  clock_out: ['이름', '근무일', '날짜', '출근시간', '퇴근시간', '조'],
  recipe: ['이름', '근무일', '날짜', '출근시간', '퇴근시간', '조'],
  waste: ['이름', '근무일', '날짜', '출근시간', '퇴근시간', '조'],
  production: ['이름', '근무일', '날짜', '출근시간', '퇴근시간', '조'],
};
export function validateAlertTemplate(kind: AlertKind, t: Template, now = Date.now()): Mapping {
  if (!(t.inspectionStatus === 'APR' || t.inspectionStatus === 'APPROVED' || t.status === 'APPROVED') || t.isDeleted || t.isHidden || ['BLOCKED','DELETED','SUSPENDED'].includes(String(t.status))) throw Error(`${alertLabels[kind]}: 사용 가능한 승인 템플릿이 아닙니다.`);
  const serial = JSON.stringify({ content: t.content, buttons: t.buttons, quickReplies: t.quickReplies, highlight: t.highlight, item: t.item, emphasizeTitle: t.emphasizeTitle, emphasizeSubtitle: t.emphasizeSubtitle, header: t.header });
  const variables = Array.from(new Set((serial.match(/#\{[^}]+\}/g) ?? []).map(v => v.slice(2, -1))));
  const unknown = variables.filter(v => !allowedVariables[kind].includes(v));
  if (unknown.length) throw Error(`${alertLabels[kind]}: 연결되지 않은 변수 ${unknown.join(', ')}`);
  const links = [...(t.buttons ?? []), ...(t.quickReplies ?? [])].flatMap((b: any) => [b.linkMo, b.linkPc].filter(Boolean)) as string[];
  const paths: Record<AlertKind, string[]> = { supply_order: ['/staff/supply','/admin/staff/supply'], supply_received: ['/staff/supply','/admin/staff/supply'], clock_in: ['/staff','/staff/attendance'], clock_out: ['/staff','/staff/attendance'], recipe: ['/staff/espresso'], waste: ['/staff/dessert'], production: ['/staff/dessert'] };
  if (!links.length || !links.every(link => {
    try { const u = new URL(link); return u.protocol === 'https:' && u.host === 'wholesale.knitcoffee.co.kr' && paths[kind].includes((u.hash.replace(/^#/, '') || u.pathname).split('?')[0].replace(/\/$/, '')); } catch { return false; }
  })) throw Error(`${alertLabels[kind]}: 버튼 주소를 확인해 주세요. 직원 화면으로 연결돼야 합니다.`);
  return { id: t.templateId, name: t.name, content: t.content ?? '', variables, links, checkedAt: now };
}

export function createStaffAlertService(db: DB, deps: AlertDependencies, clock = Date.now) {
  initStaffAlerts(db);
  let running = false;
  const readiness = (s = readAlertState(db)) => {
    const issues = [...deps.ready()];
    for (const k of alertKinds) if (s.config.events[k] && !s.templates[k]) issues.push(`${alertLabels[k]} 템플릿을 연결해 주세요.`);
    if (s.config.events.supply_order || s.config.events.supply_received) {
      if (!s.config.recipients.length) issues.push('발주·입고 알림을 받을 직원을 선택해 주세요.');
      for (const id of s.config.recipients) if (!people(db).some(p => p.id === id && mobilePhone(p.phone))) issues.push(`발주·입고 수신자 #${id}의 휴대전화번호를 확인해 주세요.`);
    }
    if (!s.config.holidayYears.includes(Number(kstDay(clock()).slice(0,4)))) issues.push('올해 공휴일 목록을 확인해 주세요.');
    return issues;
  };
  const snapshot = () => {
    const s = readAlertState(db);
    return { ...s, issues: readiness(s), staff: people(db).map(p => ({ ...p, phoneReady: mobilePhone(p.phone) })), today: dayShifts(db, kstDay(clock()), s.config).map(p => ({ id: p.id, staffId: p.staffId, name: p.name, workDate: p.workDate, position: p.position, startTime: p.startTime, endTime: p.endTime, hours: p.hours })), logs: db.prepare('SELECT event_key,kind,staff_id,work_date,status,detail,created_at,attempted_at FROM staff_alert_outbox ORDER BY created_at DESC LIMIT 80').all() };
  };
  async function connect(version: number, actor: number) {
    const s = readAlertState(db);
    if (s.version !== version) throw Error('설정이 바뀌었습니다. 새로고침해 주세요.');
    const rows = await deps.templates(), mappings: State['templates'] = {};
    for (const kind of alertKinds) {
      const candidates = rows.filter(t => templateNames[kind].includes(t.name) && (t.inspectionStatus === 'APR' || t.status === 'APPROVED' || t.inspectionStatus === 'APPROVED'));
      if (candidates.length !== 1) throw Error(`${alertLabels[kind]}: 승인된 템플릿을 하나로 확인할 수 없습니다.`);
      mappings[kind] = validateAlertTemplate(kind, await deps.template(candidates[0].templateId), clock());
    }
    db.transaction(() => {
      if (readAlertState(db).version !== version) throw Error('설정이 바뀌었습니다. 다시 연결해 주세요.');
      const p = people(db), suggested = ['이강민', '박대건'].flatMap(name => { const found = p.filter(v => v.name === name); return found.length === 1 ? [found[0].id] : []; });
      const c = { ...s.config, recipients: s.config.recipients.length ? s.config.recipients : suggested };
      db.prepare('UPDATE staff_alert_settings SET templates=?,config=?,version=version+1 WHERE id=1').run(JSON.stringify(mappings), JSON.stringify(c));
      audit(db, actor, 'templates_connected', Object.fromEntries(alertKinds.map(k => [k, mappings[k]!.id])));
    })();
    return snapshot();
  }
  async function save(config: AlertConfig, version: number, actor: number) {
    const current = readAlertState(db), c = alertConfigSchema.parse(config);
    if (current.version !== version) throw Error('다른 화면에서 설정을 변경했습니다. 새로고침해 주세요.');
    if (c.enabled) {
      const issues = readiness({ ...current, config: c });
      if (issues.length) throw Error(issues.join(' '));
      for (const k of alertKinds) if (c.events[k]) validateAlertTemplate(k, await deps.template(current.templates[k]!.id), clock());
    }
    db.transaction(() => {
      if (readAlertState(db).version !== version) throw Error('설정이 바뀌었습니다. 다시 저장해 주세요.');
      const newlyOn = c.enabled && !current.config.enabled;
      db.prepare('UPDATE staff_alert_settings SET config=?,version=version+1,active_at=?,schedule_from=? WHERE id=1').run(JSON.stringify(c), newlyOn ? clock() : current.activeAt, newlyOn ? dayPlus(kstDay(clock()), 1) : current.scheduleFrom);
      if (!c.enabled) db.prepare("UPDATE staff_alert_outbox SET status='cancelled',detail='자동 알림 중지',finished_at=? WHERE status='pending'").run(clock());
      audit(db, actor, 'settings_saved', c);
    })();
    return snapshot();
  }
  async function tick() {
    if (running) return;
    running = true;
    try {
      const now = clock(), s = readAlertState(db);
      // A crash/timeout must never cause an automatic retry of a paid, non-idempotent send.
      db.prepare("UPDATE staff_alert_outbox SET status='unknown',detail='발송 중 연결이 끊겨 솔라피 발송 내역 확인 필요' WHERE status='sending' AND attempted_at<?").run(now - 5 * 60000);
      if (!s.config.enabled) return;
      for (const d of scheduledDeliveries(db, now, s)) insertDelivery(db, d, now);
      const queue = db.prepare("SELECT * FROM staff_alert_outbox WHERE status='pending' AND due_at<=? ORDER BY due_at LIMIT 50").all(now) as any[];
      for (const row of queue) {
        const current = readAlertState(db), kind = row.kind as AlertKind, p = people(db).find(p => p.id === row.staff_id);
        let variables = JSON.parse(row.variables), skip = '';
        if (!current.config.enabled || !current.config.events[kind]) skip = '알림 중지';
        if (!p || !mobilePhone(p.phone)) skip = '직원 휴대전화번호 확인 필요';
        if (row.order_id) {
          const order = db.prepare('SELECT m.status FROM supply_orders o LEFT JOIN supply_order_meta m ON m.order_id=o.id WHERE o.id=?').get(row.order_id) as any;
          if (!current.config.recipients.includes(row.staff_id) || !order || ['needed','cancelled','refunded','refund_pending'].includes(order.status) || now - row.created_at > 24 * 3600000) skip = '현재 발주 상태 또는 수신 대상 변경';
        } else {
          const due = scheduledDeliveries(db, clock(), current).find(d => d.key === row.event_key);
          if (!due) { db.prepare('DELETE FROM staff_alert_outbox WHERE event_key=? AND status=\'pending\'').run(row.event_key); continue; }
          variables = due.variables;
        }
        const mapping = current.templates[kind];
        if (!mapping || deps.ready().length) skip = '알림 연결 설정 확인 필요';
        if (skip) { db.prepare("UPDATE staff_alert_outbox SET status='skipped',detail=?,finished_at=? WHERE event_key=? AND status='pending'").run(skip, clock(), row.event_key); continue; }
        const missing = mapping!.variables.filter(v => !Object.prototype.hasOwnProperty.call(variables, v));
        if (missing.length) { db.prepare("UPDATE staff_alert_outbox SET status='skipped',detail=?,finished_at=? WHERE event_key=?").run('알림 변수 확인 필요: ' + missing.join(', '), clock(), row.event_key); continue; }
        const claimed = db.prepare("UPDATE staff_alert_outbox SET status='sending',attempted_at=? WHERE event_key=? AND status='pending'").run(clock(), row.event_key);
        if (!claimed.changes) continue;
        try {
          const selectedVariables = Object.fromEntries(mapping!.variables.map(v => [v, String(variables[v])]));
          const result = await deps.send({ kind: alertLabels[kind], customerId: 0, businessName: p!.name, phone: p!.phone, templateId: mapping!.id, variables: selectedVariables, ref: row.event_key, disableSms: true });
          db.prepare('UPDATE staff_alert_outbox SET status=?,detail=?,finished_at=? WHERE event_key=?').run(result.ok ? 'accepted' : 'unknown', result.detail.slice(0, 300), clock(), row.event_key);
        } catch {
          db.prepare("UPDATE staff_alert_outbox SET status='unknown',detail='발송 결과 확인 필요',finished_at=? WHERE event_key=?").run(clock(), row.event_key);
        }
      }
    } finally { running = false; }
  }
  return { snapshot, connect, save, tick };
}

export function registerStaffAlerts(app: Express, db: DB, auth: { owner: RequestHandler; staff: RequestHandler; admin: RequestHandler }, deps: AlertDependencies, startTimer = true) {
  const service = createStaffAlertService(db, deps);
  const wrap = (fn: (req: any, res: any) => unknown): RequestHandler => async (req, res) => {
    try { await fn(req, res); } catch (e) { res.status(400).json({ message: e instanceof z.ZodError ? e.errors[0].message : (e as Error).message }); }
  };
  const activeStaff: RequestHandler = (req, res, next) => { if (!people(db).some(p => p.id === req.session.staffId)) { res.status(401).json({message:'활성 직원 계정으로 로그인해 주세요.'}); return; } next(); };
  const base = '/api/admin/staff/alerts';
  app.get(base, auth.owner, wrap((_req, res) => res.json(service.snapshot())));
  app.post(base + '/connect', auth.owner, wrap(async (req, res) => res.json(await service.connect(z.number().int().parse(req.body.version), req.session.userId))));
  app.put(base, auth.owner, wrap(async (req, res) => res.json(await service.save(alertConfigSchema.parse(req.body.config), z.number().int().parse(req.body.version), req.session.userId))));
  app.get('/api/admin/staff/shift-hours', auth.admin, wrap((_req, res) => { const c = readAlertState(db).config; res.json({ weekday: c.weekday, weekend: c.weekend, holidays: c.holidays, holidayYears: c.holidayYears }); }));
  app.put('/api/admin/staff/shift-hours/:id', auth.owner, wrap((req, res) => {
    const p = z.object({ start: z.union([alertTime,z.literal('')]), end: z.union([alertTime,z.literal('')]) }).refine(v => (!v.start && !v.end) || (!!v.start && !!v.end && v.start < v.end), '시작·종료 시간을 확인해 주세요.').parse(req.body);
    const row = db.prepare('SELECT * FROM shifts WHERE id=?').get(z.coerce.number().int().positive().parse(req.params.id)) as any;
    if (!row || row.work_date < kstDay()) throw Error('오늘 이후의 근무를 선택해 주세요.');
    db.prepare('UPDATE shifts SET start_time=?,end_time=? WHERE id=?').run(p.start, p.end, row.id);
    audit(db, req.session.userId, 'shift_hours', { id: row.id, before: [row.start_time,row.end_time], after: p });
    res.json({ok:true});
  }));
  app.get('/api/staff/work-status', auth.staff, activeStaff, wrap((req, res) => {
    const id = req.session.staffId, now = Date.now(), c = readAlertState(db).config;
    const open = db.prepare('SELECT id,work_date,clock_in_at FROM attendance WHERE staff_id=? AND clock_in_at IS NOT NULL AND clock_out_at IS NULL ORDER BY work_date DESC LIMIT 30').all(id) as any[];
    res.json({ snoozeMinutes: c.snoozeMinutes, maxSnoozes: c.maxSnoozes, open: open.map(a => {
      const sh = dayShifts(db,a.work_date,c).filter(s=>s.staffId===id && s.hours), end = Math.max(...sh.map(s=>s.hours!.endAt));
      return {...a,pending:!!pendingRequest(db,id,a.work_date),canSnooze:sh.length>0&&now>=end&&now<=end+4*3600000,snooze:db.prepare('SELECT until_at,count FROM staff_alert_snoozes WHERE staff_id=? AND work_date=?').get(id,a.work_date)??null};
    }), requests: db.prepare('SELECT id,work_date,requested_out,status,decision_memo FROM staff_attendance_requests WHERE staff_id=? ORDER BY id DESC LIMIT 10').all(id) });
  }));
  app.post('/api/staff/work-status/snooze', auth.staff, activeStaff, wrap((req, res) => res.json(snoozeClockOut(db, req.session.staffId, alertDay.parse(req.body.day)))));
  app.post('/api/staff/work-status/request', auth.staff, activeStaff, wrap(async (req, res) => {
    const p = z.object({ day: alertDay, actualDay: alertDay, time: alertTime, reason: z.string().trim().min(1).max(1000) }).parse(req.body);
    const id = requestClockOut(db, req.session.staffId, p.day, kstStamp(p.actualDay, p.time), p.reason);
    const me = people(db).find(p=>p.id===req.session.staffId)!;
    await deps.notify({ type:'staff_leave',title:`퇴근 기록 수정 요청 · ${me.name}`,body:`${p.day} 근무 · 실제 퇴근 ${p.actualDay} ${p.time}`,link:'/admin/staff/attendance' }).catch(()=>{});
    res.json({id});
  }));
  app.get('/api/admin/staff/attendance-requests', auth.owner, wrap((_req, res) => res.json({
    requests: db.prepare('SELECT r.*,p.name FROM staff_attendance_requests r JOIN staff p ON p.id=r.staff_id ORDER BY r.id DESC LIMIT 100').all(),
    missing: db.prepare('SELECT a.id,a.staff_id,a.work_date,a.clock_in_at,p.name FROM attendance a JOIN staff p ON p.id=a.staff_id WHERE a.clock_in_at IS NOT NULL AND a.clock_out_at IS NULL AND a.work_date<? ORDER BY a.work_date DESC LIMIT 100').all(kstDay()),
  })));
  app.post('/api/admin/staff/attendance-requests/:id', auth.owner, wrap((req, res) => {
    const p=z.object({approved:z.boolean(),memo:z.string().trim().max(1000).default('')}).parse(req.body);
    decideClockOut(db,z.coerce.number().int().positive().parse(req.params.id),p.approved,req.session.userId,p.memo);
    res.json({ok:true});
  }));
  if (startTimer) { const timer=setInterval(()=>{void service.tick().catch(e=>console.error('[staff-alerts]',e instanceof Error?e.message:'worker failed'));},60000); timer.unref(); }
  return service;
}
