import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
export function registerBankOnline(app:Express,db:Database.Database,owner:RequestHandler,environment:string,prefix:string){
 db.exec(`CREATE TABLE IF NOT EXISTS bank_online_settlements(bank_id INTEGER PRIMARY KEY,channel TEXT NOT NULL,fees INTEGER NOT NULL,sales TEXT NOT NULL,actor INTEGER NOT NULL,updated_at INTEGER NOT NULL);`);
 db.exec(`CREATE TABLE IF NOT EXISTS bank_online_audit(id INTEGER PRIMARY KEY,bank_id INTEGER,environment TEXT,action TEXT,detail TEXT,actor INTEGER,at INTEGER);`);
 const audit=(id:number,action:string,detail:any,actor:number)=>db.prepare('INSERT INTO bank_online_audit(bank_id,environment,action,detail,actor,at) VALUES(?,?,?,?,?,?)').run(id,environment,action,JSON.stringify(detail),actor,Date.now());
 const table=environment==='test'?'bank_test_postings':'bank_live_postings';
 const get=(id:number)=>{const r=db.prepare('SELECT * FROM bank_review WHERE id=? AND environment=?').get(id,environment) as any;if(!r)throw Error('입금 내역이 없습니다.');return r;};
 const safe=(fn:any):RequestHandler=>(req,res)=>{try{fn(req,res);}catch(e){res.status(409).json({message:e instanceof z.ZodError?'입력값을 확인해 주세요.':(e as Error).message});}};
 app.get(prefix+'/:id/online',owner,safe((req:any,res:any)=>{const id=z.coerce.number().int().positive().parse(req.params.id);get(id);res.json({saved:db.prepare('SELECT * FROM bank_online_settlements WHERE bank_id=?').get(id)||null,sales:db.prepare("SELECT id,sale_date AS date,amount,memo FROM store_sales WHERE sector='online' ORDER BY sale_date DESC").all()});}));
 app.post(prefix+'/:id/online',owner,safe((req:any,res:any)=>{
 const id=z.coerce.number().int().positive().parse(req.params.id),p=z.object({channel:z.string().trim().min(1).max(80),fees:z.number().int().nonnegative().safe(),saleIds:z.array(z.number().int().positive()).min(1).max(100)}).parse(req.body);
 db.transaction(()=>{const r=get(id);if(!r.deposit||r.withdraw||!['pending','online'].includes(r.state))throw Error('미확인 또는 온라인 정산 입금만 연결할 수 있습니다.');
 if(db.prepare(`SELECT id FROM ${table} WHERE bank_id=? AND cancelled_at IS NULL`).get(id))throw Error('기존 장부 반영을 먼저 취소해 주세요.');
 if(new Set(p.saleIds).size!==p.saleIds.length)throw Error('매출이 중복 선택되었습니다.');
 const others=db.prepare('SELECT s.sales FROM bank_online_settlements s JOIN bank_review b ON b.id=s.bank_id WHERE b.environment=? AND s.bank_id<>?').all(environment,id) as any[];
 let gross=0;for(const sid of p.saleIds){if(others.some(x=>JSON.parse(x.sales).includes(sid)))throw Error('이미 다른 입금에 연결된 매출입니다.');const sale=db.prepare("SELECT amount FROM store_sales WHERE id=? AND sector='online'").get(sid) as any;if(!sale)throw Error('온라인 매출을 다시 확인해 주세요.');gross+=sale.amount;}
 if(!Number.isSafeInteger(gross)||gross-p.fees!==r.deposit)throw Error('선택한 매출 합계에서 수수료를 뺀 금액이 입금액과 일치해야 합니다. 부분 정산·환불·기타 차감은 별도로 확인해 주세요.');
 db.prepare('INSERT INTO bank_online_settlements VALUES(?,?,?,?,?,?) ON CONFLICT(bank_id) DO UPDATE SET channel=excluded.channel,fees=excluded.fees,sales=excluded.sales,actor=excluded.actor,updated_at=excluded.updated_at').run(id,p.channel,p.fees,JSON.stringify(p.saleIds),req.session.userId,Date.now());
 db.prepare("UPDATE bank_review SET state='online',target_id=NULL,updated_by=?,updated_at=? WHERE id=?").run(req.session.userId,Date.now(),id);
 audit(id,'link',p,req.session.userId);
 })();res.json({ok:true});
 }));
 app.delete(prefix+'/:id/online',owner,safe((req:any,res:any)=>{const id=z.coerce.number().int().positive().parse(req.params.id);get(id);audit(id,'unlink',db.prepare('SELECT * FROM bank_online_settlements WHERE bank_id=?').get(id)||{},req.session.userId);db.prepare('DELETE FROM bank_online_settlements WHERE bank_id=?').run(id);res.json({ok:true});}));
}
