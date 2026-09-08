import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';

const request=z.object({kind:z.enum(['expense','payment']),customerId:z.number().int().positive().optional(),category:z.string().trim().min(1).max(100).optional(),sector:z.enum(['store','wholesale','online','atelier','consulting','popup','common']).optional(),memo:z.string().trim().max(500),duplicateChecked:z.literal(true)});
const idSchema=z.coerce.number().int().positive();
export function registerBankPosting(app:Express,db:Database.Database,owner:RequestHandler){
 db.exec(`CREATE TABLE IF NOT EXISTS bank_test_postings(id INTEGER PRIMARY KEY,bank_id INTEGER NOT NULL,kind TEXT NOT NULL,amount INTEGER NOT NULL,posted_date TEXT NOT NULL,customer_id INTEGER,category TEXT,sector TEXT,memo TEXT NOT NULL,created_by INTEGER NOT NULL,created_at INTEGER NOT NULL,cancelled_by INTEGER,cancelled_at INTEGER,cancel_reason TEXT);
 CREATE UNIQUE INDEX IF NOT EXISTS bank_test_posting_active ON bank_test_postings(bank_id) WHERE cancelled_at IS NULL;
 CREATE TABLE IF NOT EXISTS bank_test_audit(id INTEGER PRIMARY KEY,bank_id INTEGER NOT NULL,action TEXT NOT NULL,actor INTEGER NOT NULL,at INTEGER NOT NULL,detail TEXT NOT NULL);`);
 const safe=(fn:(req:any,res:any)=>any):RequestHandler=>(req,res)=>{try{fn(req,res);}catch(e){res.status(e instanceof z.ZodError?400:409).json({message:e instanceof z.ZodError?'입력값과 중복 확인 여부를 확인해 주세요.':e instanceof Error?e.message:'처리하지 못했습니다.'});}};
 const get=(id:number)=>{const row=db.prepare("SELECT * FROM bank_review WHERE id=? AND environment='test'").get(id) as any;if(!row)throw new Error('테스트 통장 내역을 찾을 수 없습니다.');return row;};
 const day=(r:any)=>`${r.at.slice(0,4)}-${r.at.slice(4,6)}-${r.at.slice(6,8)}`;
 app.get('/api/admin/bank-review/:id/posting',owner,safe((req,res)=>{
  const id=idSchema.parse(req.params.id);get(id);
  res.json({environment:'test',history:db.prepare('SELECT * FROM bank_test_postings WHERE bank_id=? ORDER BY id DESC').all(id),categories:db.prepare("SELECT name,sector FROM fixed_cost_items WHERE active=1 AND cost_type IN ('cogs','sga') ORDER BY sort_order,id").all()});
 }));
 app.post('/api/admin/bank-review/:id/posting',owner,safe((req,res)=>{
  const id=idSchema.parse(req.params.id),p=request.parse(req.body);let postingId:number|bigint=0;
  db.transaction(()=>{
   const row=get(id);
   const existing=db.prepare('SELECT * FROM bank_test_postings WHERE bank_id=? AND cancelled_at IS NULL').get(id) as any;
   if(existing){
    if(existing.kind===p.kind&&existing.customer_id===(p.customerId??null)&&existing.category===(p.category??null)&&existing.sector===(p.sector??null)&&existing.memo===p.memo){postingId=existing.id;return;}
    throw new Error('이미 반영한 내역입니다. 취소 후 다시 처리해 주세요.');
   }
   if(['expense','payment','card','transfer','loan'].includes(row.state))throw new Error('이미 연결했거나 비용·수금으로 바로 등록할 수 없는 분류입니다.');
   if(row.deposit>0&&row.withdraw>0)throw new Error('입출금이 동시에 있는 거래는 개별 확인이 필요합니다.');
   const amount=p.kind==='expense'?row.withdraw:row.deposit;if(!Number.isSafeInteger(amount)||amount<=0)throw new Error('입출금 방향과 처리 종류가 일치하지 않습니다.');
   if(p.kind==='payment'){
    if(p.category||p.sector||!p.customerId||!db.prepare("SELECT id FROM customers WHERE id=? AND role='customer'").get(p.customerId))throw new Error('수금 거래처를 선택해 주세요.');
   }else{
    if(p.customerId||!p.category||!p.sector||!db.prepare("SELECT id FROM fixed_cost_items WHERE name=? AND active=1 AND cost_type IN ('cogs','sga')").get(p.category))throw new Error('사용 중인 비용 항목과 사업 부문을 선택해 주세요.');
   }
   const r=db.prepare('INSERT INTO bank_test_postings(bank_id,kind,amount,posted_date,customer_id,category,sector,memo,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,p.kind,amount,day(row),p.customerId??null,p.category??null,p.sector??null,p.memo,req.session.userId,Date.now());postingId=r.lastInsertRowid;
   db.prepare('INSERT INTO bank_test_audit(bank_id,action,actor,at,detail) VALUES(?,?,?,?,?)').run(id,'post',req.session.userId,Date.now(),JSON.stringify({postingId:Number(postingId),kind:p.kind,amount}));
  })();res.json({id:Number(postingId),environment:'test',message:'테스트 장부에 반영했습니다.'});
 }));
 app.post('/api/admin/bank-review/:id/posting/:postingId/cancel',owner,safe((req,res)=>{
  const id=idSchema.parse(req.params.id),postingId=idSchema.parse(req.params.postingId),p=z.object({reason:z.string().trim().min(1).max(500)}).parse(req.body);
  db.transaction(()=>{
   get(id);const existing=db.prepare('SELECT * FROM bank_test_postings WHERE id=? AND bank_id=?').get(postingId,id) as any;if(!existing)throw new Error('반영 기록이 없습니다.');if(existing.cancelled_at)return;
   db.prepare('UPDATE bank_test_postings SET cancelled_by=?,cancelled_at=?,cancel_reason=? WHERE id=? AND cancelled_at IS NULL').run(req.session.userId,Date.now(),p.reason,postingId);
   db.prepare('INSERT INTO bank_test_audit(bank_id,action,actor,at,detail) VALUES(?,?,?,?,?)').run(id,'cancel',req.session.userId,Date.now(),JSON.stringify({postingId,reason:p.reason}));
  })();res.json({ok:true});
 }));
 app.get('/api/admin/bank-test-ledger',owner,safe((_req,res)=>res.json({environment:'test',expenses:db.prepare("SELECT category,sector,sum(amount) AS amount,count(*) AS count FROM bank_test_postings WHERE cancelled_at IS NULL AND kind='expense' GROUP BY category,sector").all(),payments:db.prepare("SELECT p.customer_id AS customerId,c.business_name AS name,sum(p.amount) AS amount,count(*) AS count FROM bank_test_postings p LEFT JOIN customers c ON c.id=p.customer_id WHERE p.cancelled_at IS NULL AND p.kind='payment' GROUP BY p.customer_id,c.business_name").all()})));
}
