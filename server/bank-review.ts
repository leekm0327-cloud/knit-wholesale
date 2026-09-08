import { registerBankConnection, type BankEnvironment, type BankCredentials } from "./bank-connection";
import { registerBankPosting } from "./bank-posting";
import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { z } from 'zod';

const endpoint='https://testws.baroservice.com/BANKACCOUNT.asmx';
const namespace='http://ws.baroservice.com/';
const parser=new XMLParser({removeNSPrefix:true,parseTagValue:false});
const builder=new XMLBuilder({ignoreAttributes:false});
const list=(x:any):any[]=>x==null?[]:Array.isArray(x)?x:[x];
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(x=>!isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x);
const range=z.object({from:date,to:date}).refine(x=>x.from<=x.to&&Date.parse(x.to)-Date.parse(x.from)<=92*86400000,'조회 기간은 93일 이내로 선택해 주세요.');
export function bankConfig(){
 const key=process.env.BAROBILL_TEST_KEY,corp=process.env.BAROBILL_CORP_NUM,id=process.env.BAROBILL_USER_ID;
 if(!key||!corp||!id)throw new Error('바로빌 테스트 연결 설정이 필요합니다.');
 return {key,corp,id};
}
async function soap(method:string,fields:Record<string,string|number>,environment:BankEnvironment='test'){
 if(!['GetBankAccount','GetPeriodBankAccountTransLog'].includes(method))throw new Error('허용되지 않은 조회입니다.');
 const body=builder.build({'soap:Envelope':{'@_xmlns:soap':'http://schemas.xmlsoap.org/soap/envelope/','soap:Body':{[method]:{'@_xmlns':namespace,...fields}}}});
 let response:Response;
 try{response=await fetch(environment==='test'?endpoint:'https://ws.baroservice.com/BANKACCOUNT.asmx',{method:'POST',headers:{'Content-Type':'text/xml; charset=utf-8',SOAPAction:`"${namespace}${method}"`},body,signal:AbortSignal.timeout(25000),redirect:'error'});}catch{throw new Error('바로빌 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.');}
 if(!response.ok)throw new Error(`바로빌 통신 오류 (${response.status})`);
 const text=await response.text();if(text.length>5_000_000)throw new Error('조회 응답이 너무 큽니다.');
 const result=parser.parse(text)?.Envelope?.Body?.[method+'Response']?.[method+'Result'];
 if(result==null)throw new Error('바로빌 응답 형식을 확인할 수 없습니다.');
 return result;
}
export function normalizeBankRow(row:any,account:string){
 const money=(x:unknown)=>{const n=Number(x);if(!Number.isSafeInteger(n)||n<0)throw new Error('금액 형식 확인이 필요합니다.');return n;};
 if(!row.TransRefKey||!/^\d{14}$/.test(row.TransDT)||row.CurrencyCode!=='KRW')throw new Error('거래 식별번호·일시·통화를 확인해 주세요.');
 return {ref:String(row.TransRefKey),account,at:String(row.TransDT),deposit:money(row.Deposit),withdraw:money(row.Withdraw),remark:String(row.TransRemark1||row.TransRemark2||''),currency:'KRW'};
}
export async function fetchBankRows(from:string,to:string,environment:BankEnvironment='test',credentials?:BankCredentials){
 range.parse({from,to});const c=credentials||bankConfig();const fields={CERTKEY:c.key,CorpNum:c.corp};
 const accounts=list((await soap('GetBankAccount',fields,environment)).BankAccount);
 const rows:ReturnType<typeof normalizeBankRow>[]=[];
 for(const account of accounts){
  if(String(account.BankAccountNum).startsWith('-')||String(account.BankName).startsWith('-'))throw new Error('바로빌 계좌 조회 권한을 확인해 주세요.');
  for(let page=1;page<=200;page++){
   const result=await soap('GetPeriodBankAccountTransLog',{...fields,ID:c.id,BankAccountNum:account.BankAccountNum,StartDate:from.replaceAll('-',''),EndDate:to.replaceAll('-',''),TransDirection:1,CountPerPage:100,CurrentPage:page,OrderDirection:1},environment);
   const current=Number(result.CurrentPage),max=Number(result.MaxPageNum);
   if(current<0)throw new Error(`바로빌 조회 오류 (${current})`);
   if(!Number.isInteger(max)||max<0||max>200)throw new Error('조회 페이지 정보를 확인해 주세요.');
   rows.push(...list(result.BankAccountLogList?.BankAccountTransLog).map(r=>normalizeBankRow(r,account.BankAccountNum)));
   if(page>=max)break;
  }
 }
 return rows;
}
export function registerBankReview(app:Express,db:Database.Database,owner:RequestHandler){
 db.exec(`CREATE TABLE IF NOT EXISTS bank_review(id INTEGER PRIMARY KEY,environment TEXT NOT NULL DEFAULT 'test',account TEXT NOT NULL,ref TEXT NOT NULL,at TEXT NOT NULL,deposit INTEGER NOT NULL,withdraw INTEGER NOT NULL,remark TEXT NOT NULL,currency TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',target_id INTEGER,memo TEXT NOT NULL DEFAULT '',updated_by INTEGER,updated_at INTEGER,UNIQUE(environment,account,ref));`);
 const connection=registerBankConnection(app,db,owner);
 for(const environment of ['test','production'] as const){
 const prefix=environment==='test'?'/api/admin/bank-review':'/api/admin/bank-live';
 const postingTable=environment==='test'?'bank_test_postings':'bank_live_postings';
 registerBankPosting(app,db,owner,environment,prefix);
 const configured=()=>{try{connection(environment);return true;}catch{return false;}};
 const safe=(fn:(req:any,res:any)=>any):RequestHandler=>(req,res)=>{Promise.resolve().then(()=>fn(req,res)).catch(e=>res.status(e instanceof z.ZodError?400:502).json({message:e instanceof z.ZodError?'입력값을 확인해 주세요.':e.message}));};
 app.get(prefix,owner,safe((_req,res)=>{
  res.json({environment,configured:configured(),rows:db.prepare(`SELECT id,at,deposit,withdraw,remark,state,target_id AS targetId,memo,EXISTS(SELECT 1 FROM ${postingTable} p WHERE p.bank_id=bank_review.id AND p.cancelled_at IS NULL) AS posted,'****'||substr(account,-4) AS account FROM bank_review WHERE environment='${environment}' ORDER BY at DESC,id DESC`).all()});
 }));
 if(environment==='test')app.post(prefix+'/import',owner,safe((req,res)=>{
  const row=z.object({ref:z.string().min(1).max(100),account:z.string().regex(/^\d{5,30}$/),at:z.string().regex(/^\d{14}$/),deposit:z.number().int().nonnegative().safe(),withdraw:z.number().int().nonnegative().safe(),remark:z.string().max(1000),currency:z.literal('KRW')});
  const payload=z.object({environment:z.literal('test'),rows:z.array(row).max(5000)}).parse(req.body);let added=0;
  db.transaction(()=>{const insert=db.prepare('INSERT OR IGNORE INTO bank_review(account,ref,at,deposit,withdraw,remark,currency) VALUES(?,?,?,?,?,?,?)');for(const r of payload.rows)added+=insert.run(r.account,r.ref,r.at,r.deposit,r.withdraw,r.remark,r.currency).changes;})();
  res.json({received:payload.rows.length,added});
 }));
 let syncing=false;
 app.post(prefix+'/sync',owner,safe(async(req,res)=>{
  const {from,to}=range.parse(req.body);if(syncing)return res.status(409).json({message:'이미 내역을 가져오는 중입니다.'});syncing=true;
  try{const rows=await fetchBankRows(from,to,environment,connection(environment));let added=0;
   db.transaction(()=>{const insert=db.prepare('INSERT OR IGNORE INTO bank_review(environment,account,ref,at,deposit,withdraw,remark,currency) VALUES(?,?,?,?,?,?,?,?)');for(const r of rows)added+=insert.run(environment,r.account,r.ref,r.at,r.deposit,r.withdraw,r.remark,r.currency).changes;})();
   res.json({received:rows.length,added});
  }finally{syncing=false;}
 }));
 app.get(prefix+'/:id/candidates',owner,safe((req,res)=>{
  const row=db.prepare(`SELECT * FROM bank_review WHERE id=? AND environment='${environment}'`).get(z.coerce.number().int().positive().parse(req.params.id)) as any;
  if(!row)return res.status(404).json({message:'내역이 없습니다.'});
  const day=`${row.at.slice(0,4)}-${row.at.slice(4,6)}-${row.at.slice(6,8)}`;
  const candidates=row.withdraw>0?db.prepare("SELECT id,expense_date AS date,category||' '||memo AS label,amount FROM expenses WHERE amount=? AND abs(julianday(expense_date)-julianday(?))<=7 ORDER BY expense_date DESC").all(row.withdraw,day):db.prepare("SELECT p.id,p.paid_at AS date,c.business_name||' '||p.memo AS label,p.amount FROM payments p LEFT JOIN customers c ON c.id=p.customer_id WHERE p.amount=? AND abs(julianday(p.paid_at)-julianday(?))<=7 ORDER BY p.paid_at DESC").all(row.deposit,day);
  res.json({type:row.withdraw>0?'expense':'payment',candidates,customers:row.deposit>0?db.prepare("SELECT id,business_name AS name FROM customers WHERE role='customer' ORDER BY business_name").all():[]});
 }));
 app.patch(prefix+'/:id',owner,safe((req,res)=>{
  const id=z.coerce.number().int().positive().parse(req.params.id);
  const p=z.object({state:z.enum(['pending','expense','payment','customer','settlement','transfer','card','loan','other']),targetId:z.number().int().positive().nullable(),memo:z.string().max(500)}).parse(req.body);
  db.transaction(()=>{
   const row=db.prepare(`SELECT * FROM bank_review WHERE id=? AND environment='${environment}'`).get(id) as any;if(!row)throw new Error('내역이 없습니다.');
   if(db.prepare(`SELECT id FROM ${postingTable} WHERE bank_id=? AND cancelled_at IS NULL`).get(id))throw new Error('장부 반영을 먼저 취소해 주세요.');
   if(p.state==='settlement'&&!row.deposit)throw new Error('정산 입금은 입금 내역에서 선택해 주세요.');
   if(['expense','payment'].includes(p.state)){
    const isExpense=p.state==='expense';const amount=isExpense?row.withdraw:row.deposit;
    if(!amount||!p.targetId)throw new Error('연결할 기존 기록을 선택해 주세요.');
    const target=db.prepare(`SELECT amount FROM ${isExpense?'expenses':'payments'} WHERE id=?`).get(p.targetId) as any;
    if(environment==='production'&&db.prepare(`SELECT id FROM bank_live_postings WHERE kind=? AND ledger_id=? AND cancelled_at IS NULL`).get(p.state,p.targetId))throw new Error('이미 통장 내역에서 생성한 장부 기록입니다.');
    if(!target||target.amount!==amount)throw new Error('기존 기록의 금액과 일치하지 않습니다.');
    if(db.prepare(`SELECT id FROM bank_review WHERE environment='${environment}' AND state=? AND target_id=? AND id<>?`).get(p.state,p.targetId,id))throw new Error('이미 다른 통장 내역과 연결한 기록입니다.');
   }else if(p.state==='customer'){
    if(!row.deposit||!p.targetId||!db.prepare('SELECT id FROM customers WHERE id=?').get(p.targetId))throw new Error('입금 거래처를 선택해 주세요.');
   }else if(p.targetId!==null)throw new Error('분류 항목에는 연결 기록을 지정할 수 없습니다.');
   db.prepare('UPDATE bank_review SET state=?,target_id=?,memo=?,updated_by=?,updated_at=? WHERE id=?').run(p.state,p.targetId,p.memo,req.session.userId,Date.now(),id);
  })();res.json({ok:true});
 }));
 }
}
