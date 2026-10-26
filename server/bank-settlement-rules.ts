import { registerSettlementBulk } from './bank-settlement-bulk';
import { createHash } from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';

// Preserve internal spaces, punctuation, digits and case: no fuzzy sender matching.
export const settlementRemark = (value: string) => value.normalize('NFC').trim();
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identity = (r: any) => hash([r.environment,r.account,r.ref,r.at,r.deposit,r.withdraw,r.remark,r.currency]);
const snapshot = (r: any) => JSON.stringify([r.state,r.target_id,r.memo,r.updated_by,r.updated_at]);
const bankTime = (now: number) => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(now)).replace(/\D/g,'');
const safeRemark = (value:string) => !!settlementRemark(value) && !/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/.test(value);
const validBankTime = (value:string) => {
  if(!/^\d{8}([01]\d|2[0-3])[0-5]\d[0-5]\d$/.test(value))return false;
  const date=value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8);
  return !isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date;
};
const positiveDeposit = (r: any) => r.currency==='KRW' && Number.isSafeInteger(r.deposit) && r.deposit>0 && r.withdraw===0;
const mask = (account: string) => '****'+account.slice(-4);

export function registerSettlementRules(app: Express, db: Database.Database, owner: RequestHandler, environment: 'test'|'production', prefix: string) {
  db.exec(`CREATE TABLE IF NOT EXISTS bank_settlement_rules (
    id INTEGER PRIMARY KEY, environment TEXT NOT NULL, account TEXT NOT NULL, remark TEXT NOT NULL,
    enabled INTEGER NOT NULL, version INTEGER NOT NULL, effective_at TEXT NOT NULL,
    created_by INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(environment,account,remark));
    CREATE TABLE IF NOT EXISTS bank_settlement_rule_audit (
    id INTEGER PRIMARY KEY, rule_id INTEGER NOT NULL, version INTEGER NOT NULL, action TEXT NOT NULL, actor INTEGER NOT NULL, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS bank_settlement_applications (
    id INTEGER PRIMARY KEY, bank_id INTEGER NOT NULL UNIQUE, rule_id INTEGER NOT NULL, rule_version INTEGER NOT NULL,
    fingerprint TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL,
    actor INTEGER NOT NULL, applied_at INTEGER NOT NULL, ended_at INTEGER, ended_by INTEGER, end_reason TEXT);
    CREATE TABLE IF NOT EXISTS bank_settlement_suppressions (
    bank_id INTEGER PRIMARY KEY, actor INTEGER NOT NULL, at INTEGER NOT NULL, reason TEXT NOT NULL);`);
  const posting = environment==='production'?'bank_live_postings':'bank_test_postings';
  const linked = (id: number) => !!db.prepare(`SELECT id FROM ${posting} WHERE bank_id=?`).get(id)
    || !!db.prepare('SELECT bank_id FROM bank_online_settlements WHERE bank_id=?').get(id);
  const rows = () => db.prepare('SELECT * FROM bank_review WHERE environment=?').all(environment) as any[];
  const rules = () => db.prepare('SELECT * FROM bank_settlement_rules WHERE environment=?').all(environment) as any[];
  function group(account: string, remark: string, all = rows()) {
    return all.filter(r=>r.account===account && settlementRemark(r.remark)===remark);
  }
  function conflict(history: any[]) {
    return history.some(r=>r.state!=='pending' && (r.state!=='settlement'||!positiveDeposit(r)||r.target_id!==null||linked(r.id)));
  }
  function candidate(seed: any, all = rows()) {
    if(!seed || seed.state!=='settlement'||!positiveDeposit(seed)||seed.target_id!==null||linked(seed.id)||!safeRemark(seed.remark)) throw new Error('수동 분류한 매장 정산 입금을 선택해 주세요.');
    if(db.prepare('SELECT id FROM bank_settlement_applications WHERE bank_id=?').get(seed.id)) throw new Error('자동 분류 내역은 규칙 후보로 사용하지 않습니다.');
    const history=group(seed.account,settlementRemark(seed.remark),all);
    if(conflict(history)) throw new Error('같은 계좌·적요에 다른 분류가 있어 수동 검토가 필요합니다.');
    return hash(history.filter(r=>r.state!=='pending').map(r=>[r.id,identity(r),snapshot(r)]).sort((a,b)=>Number(a[0])-Number(b[0])));
  }
  const actor = (req: any) => z.number().int().positive().parse(req.session.userId);
  const safe = (fn: (req:any,res:any)=>void): RequestHandler => (req,res) => {
    try { fn(req,res); } catch(e:any) { res.status(e instanceof z.ZodError?400:409).json({message:e instanceof z.ZodError?'입력값을 확인해 주세요.':e.message}); }
  };
  const audit = (rule:any,action:string,user:number,now:number) => db.prepare('INSERT INTO bank_settlement_rule_audit(rule_id,version,action,actor,at) VALUES(?,?,?,?,?)').run(rule.id,rule.version,action,user,now);
  app.get(prefix+'/settlement-rules',owner,safe((_req,res)=>{
    const all=rows(), current=rules(), seen=new Set<string>(), candidates:any[]=[];
    for(const r of all) {
      const key=JSON.stringify([r.account,settlementRemark(r.remark)]);
      if(seen.has(key)||current.some(x=>x.account===r.account&&x.remark===settlementRemark(r.remark)))continue;
      try { const token=candidate(r,all);seen.add(key);candidates.push({bankId:r.id,account:mask(r.account),remark:settlementRemark(r.remark),token}); } catch { /* Conflicting / non-settlement history stays manual. */ }
    }
    res.json({candidates,rules:current.map(r=>({id:r.id,account:mask(r.account),remark:r.remark,enabled:!!r.enabled,version:r.version,effectiveAt:r.effective_at,blocked:conflict(group(r.account,r.remark,all))})),
      history:db.prepare(`SELECT a.id,a.bank_id AS bankId,a.rule_id AS ruleId,a.rule_version AS version,b.remark,a.applied_at AS at,a.ended_at AS endedAt,a.end_reason AS reason FROM bank_settlement_applications a JOIN bank_review b ON b.id=a.bank_id WHERE b.environment=? ORDER BY a.id DESC LIMIT 100`).all(environment),
      changes:db.prepare(`SELECT a.id,a.rule_id AS ruleId,a.version,a.action,a.at FROM bank_settlement_rule_audit a JOIN bank_settlement_rules r ON r.id=a.rule_id WHERE r.environment=? ORDER BY a.id DESC LIMIT 100`).all(environment)});
  }));
  app.post(prefix+'/settlement-rules',owner,safe((req,res)=>{
    const p=z.object({bankId:z.number().int().positive(),token:z.string().length(64),confirmCardSettlement:z.literal(true)}).parse(req.body), user=actor(req),now=Date.now();
    const id=db.transaction(()=>{
      const seed=db.prepare('SELECT * FROM bank_review WHERE id=? AND environment=?').get(p.bankId,environment) as any;
      if(candidate(seed)!==p.token)throw new Error('후보가 변경되었습니다. 새로 확인해 주세요.');
      if(db.prepare('SELECT id FROM bank_settlement_rules WHERE environment=? AND account=? AND remark=?').get(environment,seed.account,settlementRemark(seed.remark)))throw new Error('이미 등록한 규칙입니다. 목록을 새로 확인해 주세요.');
      const result=db.prepare('INSERT INTO bank_settlement_rules(environment,account,remark,enabled,version,effective_at,created_by,updated_at) VALUES(?,?,?,1,1,?,?,?)').run(environment,seed.account,settlementRemark(seed.remark),bankTime(now+1000),user,now);
      const id=Number(result.lastInsertRowid);audit({id,version:1},'enable',user,now);return id;
    })();res.json({id});
  }));
  app.patch(prefix+'/settlement-rules/:id',owner,safe((req,res)=>{
    const id=z.coerce.number().int().positive().parse(req.params.id),p=z.object({version:z.number().int().positive(),enabled:z.boolean(),confirmCardSettlement:z.literal(true).optional()}).parse(req.body),user=actor(req),now=Date.now();
    db.transaction(()=>{
      const r=db.prepare('SELECT * FROM bank_settlement_rules WHERE id=? AND environment=?').get(id,environment) as any;
      if(!r||r.version!==p.version)throw new Error('규칙이 변경되었습니다. 새로 확인해 주세요.');
      if(!!r.enabled===p.enabled)return;
      if(p.enabled && (!p.confirmCardSettlement||conflict(group(r.account,r.remark))))throw new Error('카드 정산 확인 또는 충돌 내역 검토가 필요합니다.');
      db.prepare('UPDATE bank_settlement_rules SET enabled=?,version=version+1,effective_at=?,updated_at=? WHERE id=? AND version=?').run(+p.enabled,p.enabled?bankTime(now+1000):r.effective_at,now,id,p.version);
      audit({id,version:r.version+1},p.enabled?'enable':'pause',user,now);
    })();res.json({ok:true});
  }));
  app.post(prefix+'/settlement-rules/history/:id/undo',owner,safe((req,res)=>{
    const id=z.coerce.number().int().positive().parse(req.params.id), {reason}=z.object({reason:z.string().trim().min(1).max(200)}).parse(req.body),user=actor(req),now=Date.now();
    db.transaction(()=>{
      const a=db.prepare('SELECT a.* FROM bank_settlement_applications a JOIN bank_review b ON b.id=a.bank_id WHERE a.id=? AND b.environment=?').get(id,environment) as any;
      if(!a)throw new Error('분류 이력이 없습니다.');if(a.ended_at!==null)return;
      const r=db.prepare('SELECT * FROM bank_review WHERE id=?').get(a.bank_id) as any;
      if(identity(r)!==a.fingerprint||snapshot(r)!==a.after_json||linked(r.id))throw new Error('이후 변경·연결된 내역입니다. 수동 검토해 주세요.');
      const [state,target,memo]=JSON.parse(a.before_json);
      db.prepare('UPDATE bank_review SET state=?,target_id=?,memo=?,updated_by=?,updated_at=? WHERE id=?').run(state,target,memo,user,now,r.id);
      end(r.id,user,now,'undo: '+reason);
    })();res.json({ok:true});
  }));
  function end(id:number,user:number,now:number,reason:string) {
    db.prepare('INSERT OR IGNORE INTO bank_settlement_suppressions(bank_id,actor,at,reason) VALUES(?,?,?,?)').run(id,user,now,reason);
    db.prepare('UPDATE bank_settlement_applications SET ended_at=?,ended_by=?,end_reason=? WHERE bank_id=? AND ended_at IS NULL').run(now,user,reason,id);
  }
  registerSettlementBulk(app,db,owner,environment,prefix,{rows,rules,candidate,linked,conflict,remark:settlementRemark,validTime:validBankTime,positive:positiveDeposit,identity,snapshot,bankTime,audit});
  return {
    manualChange(id:number,user:number) {
      // Any manual correction is authoritative, including resetting a row to pending.
      end(id,user,Date.now(),'manual');
    },
    applyNew(ids:number[],user:number,now=Date.now()) {
      // Called INSIDE the import write transaction. Existing rows are never passed in.
      let classified=0;const active=rules().filter(r=>r.enabled);if(!active.length||!ids.length)return {classified:0,manual:ids.length};const all=rows();
      for(const id of Array.from(new Set(ids))) {
        const r=db.prepare('SELECT * FROM bank_review WHERE id=? AND environment=?').get(id,environment) as any;
        if(!r||r.state!=='pending'||r.target_id!==null||!positiveDeposit(r)||!safeRemark(r.remark)||!validBankTime(r.at)||linked(id)||db.prepare('SELECT bank_id FROM bank_settlement_suppressions WHERE bank_id=?').get(id)||db.prepare('SELECT id FROM bank_settlement_applications WHERE bank_id=?').get(id))continue;
        const matches=active.filter(rule=>rule.account===r.account&&rule.remark===settlementRemark(r.remark));
        if(matches.length!==1)continue;const rule=matches[0];
        if(r.at<rule.effective_at||r.at>bankTime(now)||conflict(group(r.account,rule.remark,all)))continue;
        const before=snapshot(r);
        const result=db.prepare("UPDATE bank_review SET state='settlement',updated_by=?,updated_at=? WHERE id=? AND state='pending' AND target_id IS NULL").run(user,now,id);
        if(!result.changes)continue;
        const after=db.prepare('SELECT * FROM bank_review WHERE id=?').get(id);
        db.prepare('INSERT INTO bank_settlement_applications(bank_id,rule_id,rule_version,fingerprint,before_json,after_json,actor,applied_at) VALUES(?,?,?,?,?,?,?,?)').run(id,rule.id,rule.version,identity(r),before,snapshot(after),user,now);classified++;
      }
      return {classified,manual:ids.length-classified};
    }
  };
}
