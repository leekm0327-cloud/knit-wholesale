import type { BankEnvironment } from "./bank-connection";
import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';

const request=z.object({kind:z.enum(['expense','payment']),customerId:z.number().int().positive().optional(),category:z.string().trim().min(1).max(100).optional(),sector:z.enum(['store','wholesale','online','atelier','consulting','popup','common']).optional(),memo:z.string().trim().max(500),duplicateChecked:z.literal(true),confirmProduction:z.boolean().optional()});
const idSchema=z.coerce.number().int().positive();
export function registerBankPosting(app:Express,db:Database.Database,owner:RequestHandler,environment:BankEnvironment='test',prefix='/api/admin/bank-review'){
 const table=environment==='test'?'bank_test_postings':'bank_live_postings',audit=environment==='test'?'bank_test_audit':'bank_live_audit';
 db.exec(`CREATE TABLE IF NOT EXISTS ${table}(id INTEGER PRIMARY KEY,bank_id INTEGER NOT NULL,kind TEXT NOT NULL,amount INTEGER NOT NULL,posted_date TEXT NOT NULL,customer_id INTEGER,category TEXT,sector TEXT,memo TEXT NOT NULL,created_by INTEGER NOT NULL,created_at INTEGER NOT NULL,cancelled_by INTEGER,cancelled_at INTEGER,cancel_reason TEXT,ledger_id INTEGER);
 CREATE UNIQUE INDEX IF NOT EXISTS ${table}_active ON ${table}(bank_id) WHERE cancelled_at IS NULL;
 CREATE TABLE IF NOT EXISTS ${audit}(id INTEGER PRIMARY KEY,bank_id INTEGER NOT NULL,action TEXT NOT NULL,actor INTEGER NOT NULL,at INTEGER NOT NULL,detail TEXT NOT NULL);`);
 const cols=db.prepare(`PRAGMA table_info(${table})`).all() as any[];
 if(!cols.some(c=>c.name==='ledger_id'))db.exec(`ALTER TABLE ${table} ADD COLUMN ledger_id INTEGER`);
 if(environment==='production')for(const [ledger,kind] of [['expenses','expense'],['payments','payment']])for(const action of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS bank_protect_${ledger}_${action} BEFORE ${action} ON ${ledger} WHEN EXISTS(SELECT 1 FROM bank_live_postings WHERE kind='${kind}' AND ledger_id=OLD.id AND cancelled_at IS NULL) BEGIN SELECT RAISE(ABORT,'통장 내역에서 반영을 먼저 취소해 주세요.'); END;`);
 const safe=(fn:(req:any,res:any)=>any):RequestHandler=>(req,res)=>{try{fn(req,res);}catch(e){res.status(e instanceof z.ZodError?400:409).json({message:e instanceof z.ZodError?'입력값과 중복 확인 여부를 확인해 주세요.':e instanceof Error?e.message:'처리하지 못했습니다.'});}};
 const get=(id:number)=>{const row=db.prepare(`SELECT * FROM bank_review WHERE id=? AND environment='${environment}'`).get(id) as any;if(!row)throw new Error('테스트 통장 내역을 찾을 수 없습니다.');return row;};
 const day=(r:any)=>`${r.at.slice(0,4)}-${r.at.slice(4,6)}-${r.at.slice(6,8)}`;
 app.get(prefix+'/:id/posting',owner,safe((req,res)=>{
  const id=idSchema.parse(req.params.id);get(id);
  res.json({environment,history:db.prepare(`SELECT * FROM ${table} WHERE bank_id=? ORDER BY id DESC`).all(id),categories:db.prepare("SELECT name,sector FROM fixed_cost_items WHERE active=1 AND cost_type IN ('cogs','sga') ORDER BY sort_order,id").all()});
 }));
 app.post(prefix+'/:id/posting',owner,safe((req,res)=>{
  const id=idSchema.parse(req.params.id),p=request.parse(req.body);let postingId:number|bigint=0;
  db.transaction(()=>{
   const row=get(id);
   if(environment==='production'&&!p.confirmProduction)throw new Error('운영 장부 반영 확인이 필요합니다.');
   const existing=db.prepare(`SELECT * FROM ${table} WHERE bank_id=? AND cancelled_at IS NULL`).get(id) as any;
   if(existing){
    if(existing.kind===p.kind&&existing.customer_id===(p.customerId??null)&&existing.category===(p.category??null)&&existing.sector===(p.sector??null)&&existing.memo===p.memo){postingId=existing.id;return;}
    throw new Error('이미 반영한 내역입니다. 취소 후 다시 처리해 주세요.');
   }
   if(['expense','payment','card','transfer','loan','settlement','other'].includes(row.state))throw new Error('이미 연결했거나 비용·수금으로 바로 등록할 수 없는 분류입니다.');
   if(p.kind==='payment'&&row.state!=='customer')throw new Error('거래처 입금으로 분류하고 저장한 뒤 수금 반영해 주세요.');
   if(row.deposit>0&&row.withdraw>0)throw new Error('입출금이 동시에 있는 거래는 개별 확인이 필요합니다.');
   const amount=p.kind==='expense'?row.withdraw:row.deposit;if(!Number.isSafeInteger(amount)||amount<=0)throw new Error('입출금 방향과 처리 종류가 일치하지 않습니다.');
   if(p.kind==='payment'){
    if(p.category||p.sector||!p.customerId||!db.prepare("SELECT id FROM customers WHERE id=? AND role='customer'").get(p.customerId))throw new Error('수금 거래처를 선택해 주세요.');
   }else{
    if(p.customerId||!p.category||!p.sector||!db.prepare("SELECT id FROM fixed_cost_items WHERE name=? AND active=1 AND cost_type IN ('cogs','sga')").get(p.category))throw new Error('사용 중인 비용 항목과 사업 부문을 선택해 주세요.');
   }
   if(p.kind==='payment'&&row.target_id!==p.customerId)throw new Error('분류에 저장한 거래처와 수금 거래처가 다릅니다.');
   if(environment==='production'){
    const duplicate=p.kind==='expense'?db.prepare('SELECT id FROM expenses WHERE expense_date=? AND amount=? AND category=? AND sector=?').get(day(row),amount,p.category,p.sector):db.prepare('SELECT id FROM payments WHERE paid_at=? AND amount=? AND customer_id=?').get(day(row),amount,p.customerId);
    if(duplicate)throw new Error('같은 날짜·금액의 장부 기록이 있습니다. 기존 기록 연결을 확인해 주세요.');
   }
   const r=db.prepare(`INSERT INTO ${table}(bank_id,kind,amount,posted_date,customer_id,category,sector,memo,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id,p.kind,amount,day(row),p.customerId??null,p.category??null,p.sector??null,p.memo,req.session.userId,Date.now());postingId=r.lastInsertRowid;
   if(environment==='production'){
    const ledger=p.kind==='expense'?db.prepare('INSERT INTO expenses(expense_date,category,amount,memo,sector,created_at) VALUES(?,?,?,?,?,?)').run(day(row),p.category,amount,p.memo,p.sector,Date.now()):db.prepare('INSERT INTO payments(customer_id,amount,paid_at,method,memo,created_at) VALUES(?,?,?,?,?,?)').run(p.customerId,amount,day(row),'transfer',p.memo,Date.now());
    db.prepare(`UPDATE ${table} SET ledger_id=? WHERE id=?`).run(ledger.lastInsertRowid,postingId);
   }

   db.prepare(`INSERT INTO ${audit}(bank_id,action,actor,at,detail) VALUES(?,?,?,?,?)`).run(id,'post',req.session.userId,Date.now(),JSON.stringify({postingId:Number(postingId),kind:p.kind,amount}));
  })();res.json({id:Number(postingId),environment,message:environment==='test'?'테스트 장부에 반영했습니다.':'운영 장부에 반영했습니다.'});
 }));
 app.post(prefix+'/:id/posting/:postingId/cancel',owner,safe((req,res)=>{
  const id=idSchema.parse(req.params.id),postingId=idSchema.parse(req.params.postingId),p=z.object({reason:z.string().trim().min(1).max(500)}).parse(req.body);
  db.transaction(()=>{
   get(id);const existing=db.prepare(`SELECT * FROM ${table} WHERE id=? AND bank_id=?`).get(postingId,id) as any;if(!existing)throw new Error('반영 기록이 없습니다.');if(existing.cancelled_at)return;
   db.prepare(`UPDATE ${table} SET cancelled_by=?,cancelled_at=?,cancel_reason=? WHERE id=? AND cancelled_at IS NULL`).run(req.session.userId,Date.now(),p.reason,postingId);
   if(environment==='production'&&existing.ledger_id){db.prepare(`DELETE FROM ${existing.kind==='expense'?'expenses':'payments'} WHERE id=?`).run(existing.ledger_id);}
   db.prepare(`INSERT INTO ${audit}(bank_id,action,actor,at,detail) VALUES(?,?,?,?,?)`).run(id,'cancel',req.session.userId,Date.now(),JSON.stringify({postingId,reason:p.reason}));
  })();res.json({ok:true});
 }));
 app.get(environment==='test'?'/api/admin/bank-test-ledger':'/api/admin/bank-live-ledger',owner,safe((_req,res)=>res.json({environment,expenses:db.prepare(`SELECT category,sector,sum(amount) AS amount,count(*) AS count FROM ${table} WHERE cancelled_at IS NULL AND kind='expense' GROUP BY category,sector`).all(),payments:db.prepare(`SELECT p.customer_id AS customerId,c.business_name AS name,sum(p.amount) AS amount,count(*) AS count FROM ${table} p LEFT JOIN customers c ON c.id=p.customer_id WHERE p.cancelled_at IS NULL AND p.kind='payment' GROUP BY p.customer_id,c.business_name`).all()})));
}
