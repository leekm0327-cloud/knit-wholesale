import type Database from 'better-sqlite3';
import {getCjReadyTransportReadiness,isOptedOut,sendAlimtalk} from './alimtalk';
import {shippingOrderFingerprint} from './roastery-tracking';

// Opt-in shipping lane, isolated from legacy Alimtalk. Select an approved recipient scope before enabling.
function configuration(){
 const templateId=(process.env.SOLAPI_CJ_READY_TEMPLATE_ID??'').trim();
 const rawCap=(process.env.CJ_READY_NOTICE_MONTHLY_CAP??'').trim();
 const requestedCap=/^[1-9]\d{0,3}$/.test(rawCap)?Number(rawCap):0;
 // Both monetary values use integer tenths of KRW; never round the unit cost down.
 const wonTenths=(name:string)=>{const v=(process.env[name]??'').trim();return /^[1-9]\d{0,6}$/.test(v)?Number(v):0;};
 const unitCeiling=wonTenths('CJ_READY_NOTICE_UNIT_CEILING_TENTHS_KRW');
 const budget=wonTenths('CJ_READY_NOTICE_MONTHLY_BUDGET_TENTHS_KRW');
 const monthlyCap=unitCeiling>0?Math.min(requestedCap,Math.floor(budget/unitCeiling)):0;
 const scope=(process.env.CJ_READY_NOTICE_RECIPIENT_SCOPE??'').trim();
 const customerIds=new Set((process.env.CJ_READY_NOTICE_CUSTOMER_IDS??'').split(',').map(x=>x.trim()).filter(x=>/^[1-9]\d*$/.test(x)));
 const hasScope=scope==='verified_external'||(scope==='allowlist'&&customerIds.size>0);
 return {on:process.env.CJ_READY_NOTICE_ENABLED==='true'&&!!templateId&&monthlyCap>0&&hasScope,templateId,monthlyCap,scope,customerIds};
}

export function isCjReadyNoticeEnabled(){return configuration().on;}

export function reportCjReadyStartup(){
 try{console.info('[knit-cj-ready-preflight]',JSON.stringify(getCjReadyTransportReadiness()));}
 catch{console.error('[knit-cj-ready-preflight] unavailable');}
}

export function installCjReadyNotice(db:Database.Database){
 db.exec("CREATE TABLE IF NOT EXISTS cj_ready_notice_attempts(order_id INTEGER PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('reserved','claimed','accepted','not_accepted')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS cj_ready_notice_attempts_created ON cj_ready_notice_attempts(created_at)");
}
const mobile=(value:unknown)=>typeof value==='string'&&/^[0-9 ()-]+$/.test(value)?value.replace(/\D/g,''):'';
function getEligible(db:Database.Database,id:number){
 const cfg=configuration();
 if(!cfg.on)return null;
 const transport=getCjReadyTransportReadiness();
 if(!transport.providerCredentialsPresent||!transport.productionEndpoint||!transport.pfidMatches||!transport.senderValid)return null;
 // A committed first whole-order CJ waybill is the trigger; the separate preparation checkbox is not required.
 const row:any=db.prepare("SELECT o.customer_id,o.order_no,o.status AS order_status,o.items,o.customer_snapshot,o.tracking_no AS legacy_tracking,c.phone,c.business_name,s.tracking,s.order_fingerprint FROM orders o JOIN customers c ON c.id=o.customer_id JOIN roastery_assignments a ON a.order_id=o.id JOIN suppliers supplier ON supplier.id=a.roastery_id JOIN roastery_shipments s ON s.order_id=o.id WHERE o.id=? AND o.status='done' AND o.is_store_order=0 AND o.is_sample=0 AND c.role='customer' AND c.is_store=0 AND c.biz_verified=1 AND supplier.name='클라리멘토' AND s.carrier='CJ' AND s.state='dispatch_confirmed'").get(id);
 if(!row||(cfg.scope==='allowlist'&&!cfg.customerIds.has(String(row.customer_id)))||/^(?:test(?:\b|[0-9_])|테스트|샘플)/i.test(String(row.business_name).trim())||isOptedOut(row.customer_id)||row.order_fingerprint!==shippingOrderFingerprint(row))return null;
 const tracking=String(row.tracking??'');
 if(!/^(?:\d{10}|\d{12})$/.test(tracking)||String(row.legacy_tracking??'').trim())return null;
 let snapshotPhone='';try{snapshotPhone=mobile(JSON.parse(row.customer_snapshot).phone);}catch{return null;}
 const phone=mobile(row.phone);
 if(!/^010\d{8}$/.test(phone)||/^010(?:0{8}|1{8}|12345678)$/.test(phone)||snapshotPhone!==phone)return null;
 return {customerId:Number(row.customer_id),businessName:String(row.business_name),phone,templateId:cfg.templateId,variables:{주문번호:String(row.order_no),송장번호:tracking}};
}

function kstMonth(at:number){
 const local=new Date(at+9*3600000);
 const start=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),1)-9*3600000;
 const end=Date.UTC(local.getUTCFullYear(),local.getUTCMonth()+1,1)-9*3600000;
 return {month:local.toISOString().slice(0,7),start,end};
}

// Intended for bounded monitoring. Never include any contact, number, order, or template identifiers.
export function reportCjReadyAggregate(db:Database.Database){
 try{
  const cfg=configuration();if(!cfg.on)return;
  const {month,start,end}=kstMonth(Date.now());
  const counts=db.prepare("SELECT count(*) AS used,coalesce(sum(state='reserved'),0) AS reserved,coalesce(sum(state='claimed'),0) AS claimed,coalesce(sum(state='accepted'),0) AS accepted,coalesce(sum(state='not_accepted'),0) AS needsReview FROM cj_ready_notice_attempts WHERE created_at>=? AND created_at<?").get(start,end) as {used:number;reserved:number;claimed:number;accepted:number;needsReview:number};
  console.info('[knit-cj-ready-monthly]',JSON.stringify({month,limit:cfg.monthlyCap,remaining:Math.max(0,cfg.monthlyCap-counts.used),...counts}));
 }catch{console.error('[knit-cj-ready-monthly] unavailable');}
}

export function reserveCjReadyNotice(db:Database.Database,id:number){
 // Called inside the existing order transaction, BEFORE recording the dispatch notice.
 // Older notices and any earlier shipment (including a rejected one) must never enter this path.
 if(db.prepare("SELECT 1 FROM roastery_dispatch_outbox WHERE order_id=?").get(id)||!getEligible(db,id))return false;
 const at=Date.now(),{start,end}=kstMonth(at);
 // Do not start an eligible attempt during the last two minutes of a billing month.
 if(end-at<=120_000)return false;
 const used=db.prepare("SELECT count(*) AS total FROM cj_ready_notice_attempts WHERE created_at>=? AND created_at<?").get(start,end) as {total:number};
 if(used.total>=configuration().monthlyCap)return false; // Inside the same IMMEDIATE shipment transaction.
 return db.prepare("INSERT OR IGNORE INTO cj_ready_notice_attempts(order_id,state,created_at,updated_at) VALUES(?,'reserved',?,?)").run(id,at,at).changes===1;
}

export async function deliverCjReadyNotice(db:Database.Database,id:number){
 // This is called only with ids reserved by the just-committed authenticated portal save.
 // No timer, startup/backfill worker, or automatic retry: uncertain responses must not duplicate customer notices.
 const now=Date.now(),{start,end}=kstMonth(now);
 if(end-now<=120_000)return;
 if(db.prepare("UPDATE cj_ready_notice_attempts SET state='claimed',updated_at=? WHERE order_id=? AND state='reserved' AND created_at>=?").run(now,id,Math.max(start,now-120_000)).changes!==1)return;
 let ok=false;
 try{
  const msg=getEligible(db,id);
  if(msg){
   const result=await sendAlimtalk({...msg,kind:'cj_ready',ref:String(id),disableSms:true,receiptMode:'strict-kakao'});
   ok=result.ok;
  }
 }finally{
  db.prepare("UPDATE cj_ready_notice_attempts SET state=?,updated_at=? WHERE order_id=? AND state='claimed'").run(ok?'accepted':'not_accepted',Date.now(),id);
  reportCjReadyAggregate(db);
 }
}
