import {registerOrderInvoices,assertOrderInvoiceCurrent} from './order-invoices';
import { createHash, randomUUID } from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { invoiceDraft, invoiceParty, taxEnvironment } from '../shared/tax-invoices';
import type { BankCredentials, BankEnvironment } from './bank-connection';
import { taxCall, soapInvoice, TaxRemoteError } from './tax-soap';

export function registerTaxInvoices(app:Express,db:Database.Database,owner:RequestHandler,credentials:(env:BankEnvironment)=>BankCredentials){
 db.exec(`CREATE TABLE IF NOT EXISTS tax_invoice_profiles(environment TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS tax_invoice_drafts(id TEXT PRIMARY KEY,environment TEXT NOT NULL,fingerprint TEXT NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'draft',remote_state TEXT,error TEXT,created_at INTEGER NOT NULL,UNIQUE(environment,fingerprint));`);
 const route=(fn:(req:any,res:any)=>Promise<void>|void):RequestHandler=>async(req,res)=>{res.setHeader('Cache-Control','no-store');try{await fn(req,res);}catch(e){res.status(400).json({message:e instanceof z.ZodError?'필수 항목·날짜·금액을 확인해 주세요.':e instanceof TaxRemoteError?e.message:e instanceof Error&&e.message.startsWith('바로빌')?e.message:'처리하지 못했습니다. 입력 정보와 바로빌 연결 상태를 확인해 주세요.'});}};
 registerOrderInvoices(app,db,owner,route,credentials);
 const base='/api/admin/tax-invoices/:environment';
 const read=(id:string,env:string)=>db.prepare('SELECT * FROM tax_invoice_drafts WHERE id=? AND environment=?').get(id,env) as any;
 const view=(r:any)=>({...r,error:typeof r.error === 'string' && r.error.startsWith('바로빌 오류 -26006.') ? new TaxRemoteError('-26006').message : r.error,payload:JSON.parse(r.payload),remote_state:r.remote_state?JSON.parse(r.remote_state):null,fingerprint:undefined});
 app.get(base+'/drafts/:id',owner,route((req,res)=>{const r=read(req.params.id,taxEnvironment.parse(req.params.environment));if(!r){res.sendStatus(404);return;}res.json(view(r));}));
 app.get(base,owner,route((req,res)=>{
  const env=taxEnvironment.parse(req.params.environment);let configured=false,corp='';try{const c=credentials(env);configured=true;corp=c.corp;}catch{}
  const profile=db.prepare('SELECT payload FROM tax_invoice_profiles WHERE environment=?').get(env) as any;
  res.json({configured,corp,profile:profile?JSON.parse(profile.payload):null,rows:(db.prepare('SELECT * FROM tax_invoice_drafts WHERE environment=? ORDER BY created_at DESC LIMIT 300').all(env) as any[]).map(view)});
 }));
 app.put(base+'/profile',owner,route((req,res)=>{const env=taxEnvironment.parse(req.params.environment),p=invoiceParty.parse(req.body),c=credentials(env);if(p.corpNum!==c.corp){res.status(400).json({message:'연결된 사업자번호와 공급자 사업자번호가 다릅니다.'});return;}
 db.prepare('INSERT INTO tax_invoice_profiles VALUES(?,?) ON CONFLICT(environment) DO UPDATE SET payload=excluded.payload').run(env,JSON.stringify(p));res.json({ok:true});}));
 app.post(base+'/certificate',owner,route(async(req,res)=>{const env=taxEnvironment.parse(req.params.environment);const result=await taxCall(env,credentials(env),'CheckCERTIsValid');res.json({valid:String(result)==='1'});}));
 app.post(base+'/setup',owner,route(async(req,res)=>{
  const env=taxEnvironment.parse(req.params.environment),kind=z.literal('certificate').parse(req.body.kind),c=credentials(env);
  const url=String(await taxCall(env,c,'GetCertificateRegistURL',{ID:c.id,PWD:''}));
  const u=new URL(url);if(u.protocol!=='https:'||!(u.hostname==='barobill.co.kr'||u.hostname.endsWith('.barobill.co.kr')))throw new Error('Invalid URL');res.json({url});
 }));
 app.post(base+'/drafts',owner,route((req,res)=>{
  const env=taxEnvironment.parse(req.params.environment),d=invoiceDraft.parse(req.body),c=credentials(env);
  if(d.supplier.corpNum!==c.corp||d.date>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})){res.status(400).json({message:'공급자 사업자번호와 작성일을 확인해 주세요. 미래 날짜로 발행할 수 없습니다.'});return;}
  // Stable content deduplication survives double-clicks and reconnects. Existing drafts are immutable.
  const payload=JSON.stringify(d),fingerprint=createHash('sha256').update(payload).digest('hex'),id='KN'+randomUUID().replaceAll('-','').slice(0,22);
  db.prepare('INSERT OR IGNORE INTO tax_invoice_drafts(id,environment,fingerprint,payload,created_at) VALUES(?,?,?,?,?)').run(id,env,fingerprint,payload,Date.now());
  const row=db.prepare('SELECT * FROM tax_invoice_drafts WHERE environment=? AND fingerprint=?').get(env,fingerprint);res.json(view(row));
 }));
 app.post(base+'/drafts/:id/issue',owner,route(async(req,res)=>{
  const env=taxEnvironment.parse(req.params.environment),r=read(req.params.id,env);
  if(!r){res.sendStatus(404);return;}
  if(req.body.confirm!==r.id||req.body.duplicateChecked!==true){res.status(400).json({message:'발행 내용과 기존 발행 여부를 확인해 주세요.'});return;}
  if(!['draft','rejected'].includes(r.state)){res.status(409).json({message:'이미 요청한 문서입니다. 발행 상태를 조회해 주세요.'});return;}
  const d=invoiceDraft.parse(JSON.parse(r.payload)),c=credentials(env);
  if(c.corp!==d.supplier.corpNum){res.status(400).json({message:'연결된 공급자 사업자번호가 변경되었습니다.'});return;}
  if(String(await taxCall(env,c,'CheckCERTIsValid'))!=='1')throw new Error('바로빌 공동인증서를 확인해 주세요.');
  assertOrderInvoiceCurrent(db,r.id);
  // Atomic claim before the external side effect. Never retry a timeout automatically.
  const lock=db.prepare(`UPDATE tax_invoice_drafts SET state='sending',error=NULL WHERE id=? AND state IN ('draft','rejected') AND NOT EXISTS (
    SELECT 1 FROM tax_invoice_drafts other WHERE other.id<>? AND other.environment=? AND other.state IN ('sending','unknown','issued')
    AND (NOT EXISTS (SELECT 1 FROM tax_invoice_order_links WHERE draft_id=? AND active=1) OR NOT EXISTS (SELECT 1 FROM tax_invoice_order_links WHERE draft_id=other.id AND active=1))
    AND json_extract(other.payload,'$.supplier.corpNum')=? AND json_extract(other.payload,'$.buyer.corpNum')=?
    AND json_extract(other.payload,'$.date')=? AND json_extract(other.payload,'$.amount')=? AND json_extract(other.payload,'$.tax')=?
   )`).run(r.id,r.id,env,r.id,d.supplier.corpNum,d.buyer.corpNum,d.date,d.amount,d.tax);
  if(!lock.changes){res.status(409).json({message:'같은 거래처·날짜·금액의 발행 요청이 이미 있습니다. 기존 문서 상태를 확인해 주세요.'});return;}
  try{
   const result=await taxCall(env,c,'RegistAndIssueTaxInvoice',{Invoice:soapInvoice(d,c,r.id),SendSMS:false,ForceIssue:false,MailTitle:''});
   if(String(result)!=='1')throw new Error('Unknown result');
   db.prepare("UPDATE tax_invoice_drafts SET state='issued',error=NULL WHERE id=?").run(r.id);
  }catch(e){
   const definite=e instanceof TaxRemoteError;
   db.prepare('UPDATE tax_invoice_drafts SET state=?,error=? WHERE id=?').run(definite?'rejected':'unknown',definite?(e as Error).message:'응답 확인 필요. 중복 발행하지 말고 상태 조회 또는 바로빌에서 확인해 주세요.',r.id);
  }
  res.json(view(read(r.id,env)));
 }));
 app.post(base+'/drafts/:id/status',owner,route(async(req,res)=>{
  const env=taxEnvironment.parse(req.params.environment),r=read(req.params.id,env);if(!r){res.sendStatus(404);return;}
  const c=credentials(env);if(c.corp!==JSON.parse(r.payload).supplier.corpNum)throw new Error('바로빌 사업자번호가 변경되었습니다.');
  const s=await taxCall(env,c,'GetTaxInvoiceStateEX',{MgtKey:r.id});
  if(!s||!/^\d+$/.test(String(s.BarobillState)))throw new TaxRemoteError(String(s?.BarobillState||'상태 확인 필요'));
  const n=Number(s.BarobillState),state=[3011,3021,3014].includes(n)?'issued':[5013,5023,5031].includes(n)?'cancelled':r.state;
  db.prepare('UPDATE tax_invoice_drafts SET state=?,remote_state=?,error=? WHERE id=?').run(state,JSON.stringify(s),state==='issued'?null:r.error,r.id);if(state==='cancelled')db.prepare('UPDATE tax_invoice_order_links SET active=0 WHERE draft_id=?').run(r.id);res.json(view(read(r.id,env)));
 }));
}
