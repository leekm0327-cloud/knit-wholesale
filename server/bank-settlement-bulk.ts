import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
const digest = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
const selection = z.object({ from: date, to: date, candidates: z.array(z.object({ bankId: z.number().int().positive(), token: z.string().length(64) })).min(1).max(100) }).refine(p => p.from <= p.to && new Set(p.candidates.map(c => c.bankId)).size === p.candidates.length, '기간 또는 선택을 확인해 주세요.');
type Helpers = {
    rows: () => any[];
    rules: () => any[];
    candidate: (r: any, all: any[]) => string;
    linked: (id: number) => boolean;
    remark: (s: string) => string;
    validTime: (s: string) => boolean;
    positive: (r: any) => boolean;
    identity: (r: any) => string;
    snapshot: (r: any) => string;
    bankTime: (n: number) => string;
    audit: (r: any, a: string, u: number, n: number) => unknown;
};
export function registerSettlementBulk(app: Express, db: Database.Database, owner: RequestHandler, environment: string, prefix: string, h: Helpers) {
    db.exec(`CREATE TABLE IF NOT EXISTS bank_settlement_previews(id TEXT PRIMARY KEY,environment TEXT NOT NULL,actor INTEGER NOT NULL,payload TEXT NOT NULL,fingerprint TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS bank_settlement_batches(request_key TEXT PRIMARY KEY,preview_id TEXT NOT NULL,environment TEXT NOT NULL,actor INTEGER NOT NULL,result TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS bank_settlement_batch_items(request_key TEXT NOT NULL,application_id INTEGER NOT NULL,PRIMARY KEY(request_key,application_id));`);
    const safe = (fn: (req: any, res: any) => void): RequestHandler => (req, res) => { try {
        fn(req, res);
    }
    catch (e: any) {
        res.status(e instanceof z.ZodError ? 400 : 409).json({ message: e instanceof z.ZodError ? '기간과 규칙 선택을 확인해 주세요.' : e.message });
    } };
    const actor = (req: any) => z.number().int().positive().parse(req.session.userId);
    const transaction = <T,>(fn: () => T): T => { const tx = db.transaction(fn); return typeof tx.immediate === 'function' ? tx.immediate() : tx(); };
    function inspect(p: z.infer<typeof selection>, now: number) {
        const all = h.rows(), current = h.rules(), keys = new Set<string>();
        const chosen = p.candidates.slice().sort((a, b) => a.bankId - b.bankId).map(c => { const row = all.find(r => r.id === c.bankId); if (!row || h.candidate(row, all) !== c.token)
            throw new Error('규칙 후보가 변경되었습니다. 목록을 새로 확인해 주세요.'); const key = JSON.stringify([row.account, h.remark(row.remark)]); if (keys.has(key) || current.some(r => r.account === row.account && r.remark === h.remark(row.remark)))
            throw new Error('중복 또는 이미 변경된 규칙입니다. 목록을 새로 확인해 주세요.'); keys.add(key); return { seed: row, token: c.token }; });
        const start = p.from.replaceAll('-', '') + '000000', end = p.to.replaceAll('-', '') + '235959';
        const relevant = all.filter(r => r.at >= start && r.at <= end && chosen.some(c => h.remark(c.seed.remark) === h.remark(r.remark))).sort((a, b) => a.id - b.id);
        if (relevant.length > 5000)
            throw new Error('검토 대상이 5,000건을 넘습니다. 기간을 좁혀 주세요.');
        const excluded: Record<string, number> = {}, ready: {
            row: any;
            seedId: number;
        }[] = [], observed: any[] = [];
        for (const row of relevant) {
            const linked = h.linked(row.id), suppressed = !!db.prepare('SELECT bank_id FROM bank_settlement_suppressions WHERE bank_id=?').get(row.id), applied = !!db.prepare('SELECT id FROM bank_settlement_applications WHERE bank_id=?').get(row.id), matches = chosen.filter(c => c.seed.account === row.account && h.remark(c.seed.remark) === h.remark(row.remark));
            let reason = '';
            if (row.state !== 'pending' || row.target_id !== null || linked)
                reason = '이미 처리·연결됨';
            else if (suppressed || applied)
                reason = '취소·재적용 차단';
            else if (!h.positive(row))
                reason = '입출금 방향·통화 불일치';
            else if (!matches.length)
                reason = '계좌 불일치';
            else if (matches.length !== 1)
                reason = '규칙 충돌';
            else if (!h.validTime(row.at) || row.at > h.bankTime(now))
                reason = '거래 일시 확인 필요';
            if (reason)
                excluded[reason] = (excluded[reason] || 0) + 1;
            else
                ready.push({ row, seedId: matches[0].seed.id });
            observed.push([row.id, h.identity(row), h.snapshot(row), linked, suppressed, applied, reason]);
        }
        return { chosen, ready, excluded, fingerprint: digest([p.from, p.to, chosen.map(c => [c.seed.id, c.token]), observed]) };
    }
    app.post(prefix + '/settlement-bulk/preview', owner, safe((req, res) => { const p = selection.parse(req.body), user = actor(req), now = Date.now(); const result = transaction(() => { const v = inspect(p, now), id = randomUUID(); db.prepare('INSERT INTO bank_settlement_previews VALUES(?,?,?,?,?,?)').run(id, environment, user, JSON.stringify(p), v.fingerprint, now); return { previewId: id, from: p.from, to: p.to, expiresAt: now + 10 * 60000, total: v.ready.length, excluded: v.excluded, rules: v.chosen.map(c => ({ bankId: c.seed.id, remark: h.remark(c.seed.remark), account: '****' + c.seed.account.slice(-4), count: v.ready.filter(r => r.seedId === c.seed.id).length })) }; }); res.json(result); }));
    app.get(prefix + '/settlement-bulk/result/:key', owner, safe((req, res) => { const key = z.string().uuid().parse(req.params.key), user = actor(req); const b = db.prepare('SELECT result FROM bank_settlement_batches WHERE request_key=? AND environment=? AND actor=?').get(key, environment, user) as any; res.json(b ? { status: 'completed', result: JSON.parse(b.result) } : { status: 'not_found' }); }));
    app.post(prefix + '/settlement-bulk/apply', owner, safe((req, res) => {
        const p = z.object({ previewId: z.string().uuid(), requestKey: z.string().uuid(), confirmCardSettlement: z.literal(true) }).parse(req.body), user = actor(req), now = Date.now();
        const result = transaction(() => {
            const existing = db.prepare('SELECT * FROM bank_settlement_batches WHERE request_key=?').get(p.requestKey) as any;
            if (existing) {
                if (existing.environment !== environment || existing.actor !== user || existing.preview_id !== p.previewId)
                    throw new Error('다른 요청에 사용한 확인 키입니다.');
                return JSON.parse(existing.result);
            }
            const preview = db.prepare('SELECT * FROM bank_settlement_previews WHERE id=? AND environment=? AND actor=?').get(p.previewId, environment, user) as any;
            if (!preview || now - preview.created_at > 10 * 60000)
                throw new Error('미리보기가 만료되었습니다. 다시 확인해 주세요.');
            const input = selection.parse(JSON.parse(preview.payload)), v = inspect(input, now);
            if (v.fingerprint !== preview.fingerprint)
                throw new Error('검토 후 내역이 변경되었습니다. 적용하지 않았습니다. 다시 미리보기해 주세요.');
            const ruleIds = new Map<number, number>();
            for (const c of v.chosen) {
                const result = db.prepare('INSERT INTO bank_settlement_rules(environment,account,remark,enabled,version,effective_at,created_by,updated_at) VALUES(?,?,?,1,1,?,?,?)').run(environment, c.seed.account, h.remark(c.seed.remark), h.bankTime(now + 1000), user, now);
                const id = Number(result.lastInsertRowid);
                ruleIds.set(c.seed.id, id);
                h.audit({ id, version: 1 }, 'enable', user, now);
            }
            const ids: number[] = [];
            for (const item of v.ready) {
                const r = item.row;
                const changed = db.prepare("UPDATE bank_review SET state='settlement',updated_by=?,updated_at=? WHERE id=? AND state='pending' AND target_id IS NULL").run(user, now, r.id);
                if (changed.changes !== 1)
                    throw new Error('내역 변경으로 전체 적용을 취소했습니다.');
                const after = db.prepare('SELECT * FROM bank_review WHERE id=?').get(r.id);
                const a = db.prepare('INSERT INTO bank_settlement_applications(bank_id,rule_id,rule_version,fingerprint,before_json,after_json,actor,applied_at) VALUES(?,?,1,?,?,?,?,?)').run(r.id, ruleIds.get(item.seedId), h.identity(r), h.snapshot(r), h.snapshot(after), user, now);
                const id = Number(a.lastInsertRowid);
                ids.push(id);
                db.prepare('INSERT INTO bank_settlement_batch_items VALUES(?,?)').run(p.requestKey, id);
            }
            const result = { requestKey: p.requestKey, activated: ruleIds.size, classified: ids.length, applicationIds: ids, from: input.from, to: input.to, excluded: v.excluded };
            db.prepare('INSERT INTO bank_settlement_batches VALUES(?,?,?,?,?,?)').run(p.requestKey, p.previewId, environment, user, JSON.stringify(result), now);
            return result;
        });
        res.json(result);
    }));
}
