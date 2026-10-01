import type {Express, RequestHandler} from 'express';
import multer from 'multer';
import {z} from 'zod';
import {digest,period,parseChat,parseSettlement,customerName,productName,unitOf,type SourceLine} from './settlement-files';
import {effectiveOrderYmd} from '../shared/orderDate';

type Issue={id:string;date:string;reference:string;text:string;source:'chat'|'excel'|'site';reviewed?:boolean;note?:string};
type Decision={line_id:string;patch_json:string;reason:string};
const inPeriod=(date:string,p:{from:string;to:string})=>date>=p.from&&date<=p.to;
const round=(n:number)=>Math.round(n*100)/100;
const known=['코튼','실크','울','디카페인','몰케','게쉬','브루사','산타와니','브라질 게이샤'];
export function initSettlements(db:any){
 db.exec(`CREATE TABLE IF NOT EXISTS settlement_runs (
  id INTEGER PRIMARY KEY, month TEXT NOT NULL,supplier_id INTEGER NOT NULL,fingerprint TEXT UNIQUE NOT NULL,
  excel_json TEXT NOT NULL,chat_json TEXT NOT NULL,created_at INTEGER NOT NULL,created_by INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS settlement_decisions (
   run_id INTEGER NOT NULL,line_id TEXT NOT NULL,patch_json TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL,updated_at INTEGER NOT NULL,
   PRIMARY KEY(run_id,line_id));
  CREATE TABLE IF NOT EXISTS settlement_decision_history (
   id INTEGER PRIMARY KEY,run_id INTEGER NOT NULL,line_id TEXT NOT NULL,before_json TEXT,after_json TEXT NOT NULL,actor_id INTEGER NOT NULL,created_at INTEGER NOT NULL);`);
}
function sourceIssues(source:Issue['source'],list:any[]):Issue[]{return list.map(i=>({...i,source,id:source+'-issue-'+digest(JSON.stringify(i))}));}
export function siteSources(db:any,supplierId:number,month:string){
 const p=period(month), lines:SourceLine[]=[], issues:Issue[]=[];
 const orders=db.prepare('SELECT * FROM orders').all();
 const purchases=db.prepare('SELECT * FROM purchases WHERE supplier_id=?').all(supplierId);
 const linked=new Map(orders.filter((o:any)=>o.auto_purchase_id).map((o:any)=>[o.auto_purchase_id,o]));
 for(const purchase of purchases){
  const o:any=linked.get(purchase.id),orderDate=o?effectiveOrderYmd({createdAt:o.created_at,ecountDate:o.ecount_date}):'';
  if(!inPeriod(purchase.purchase_date,p)&&!inPeriod(orderDate,p))continue;
  let customer=purchase.customer_name;
  if(!customer&&o){try{customer=JSON.parse(o.customer_snapshot)?.businessName;}catch{}}
  const warnings:string[]=[];
  if(!customer)warnings.push('거래처가 비어 있습니다.');
  if(orderDate&&orderDate!==purchase.purchase_date)warnings.push(`주문일 ${orderDate} / 발주일 ${purchase.purchase_date}: 기준일 확인`);
  if(o?.status==='cancelled')warnings.push('취소 주문에 연결된 발주');
  const items=JSON.parse(purchase.items);
  for(const [i,item] of items.entries()){
   const product=productName(item.name),unit=unitOf(item.name,known.includes(product));
   lines.push({id:'site-'+digest(JSON.stringify([purchase.id,purchase.purchase_date,customer,item,i])),source:'site',date:purchase.purchase_date,
    customer:customerName(customer||'거래처 미확인'),product,qty:Number(item.qty),unit,amount:Number(item.amount),unitPrice:Number(item.unitPrice),
    reference:purchase.purchase_no+(o?` · ${o.order_no}`:''),text:JSON.stringify({purchaseId:purchase.id,orderId:o?.id,orderDate,item}),
    warnings:[...warnings,...(unit==='미확인'?['포장 단위 확인']:[])]});
  }
 }
 // Missing/changed linked purchases remain visible, even when their purchase date falls outside this cycle.
 const categoryRows=db.prepare('SELECT key FROM product_categories WHERE is_bean=1').all();
 const keys=categoryRows.length?categoryRows.map((c:any)=>c.key):['blend','decaf','single'];
 for(const o of orders){
  const date=effectiveOrderYmd({createdAt:o.created_at,ecountDate:o.ecount_date});if(o.status!=='done'||!inPeriod(date,p))continue;
  const po=db.prepare('SELECT * FROM purchases WHERE id=?').get(o.auto_purchase_id??-1);
  // Unlinked orders have no supplier yet: show them as candidates, never as this supplier's payable.
  if(po&&po.supplier_id!==supplierId)continue;
  const positive=JSON.parse(o.items).filter((i:any)=>keys.includes(i.category)&&Number(i.qty)>0);
  if(!positive.length)continue;
  const qtyMap=(items:any[])=>{const m:Record<string,number>={};for(const i of items){const k=(i.productId??i.name)+'';m[k]=(m[k]||0)+Number(i.qty);}return JSON.stringify(Object.entries(m).sort());};
  if(!po||qtyMap(positive)!==qtyMap(JSON.parse(po.items)))issues.push({id:'site-issue-'+digest(JSON.stringify([o.id,o.items,po?.items])),date,source:'site',reference:o.order_no,
    text:!po?`연결 발주 없음 (공급처 확인 필요) · 주문 ${o.id}`:`주문과 발주 수량 불일치 · 주문 ${o.id} / ${po.purchase_no}`});
 }
 return {lines,issues};
}

export function compareSources(month:string,allLines:SourceLine[],allIssues:Issue[],decisions:Decision[]=[]){
 const p=period(month), d=new Map(decisions.map(d=>[d.line_id,d]));
 const apply=(line:SourceLine)=>{const decision=d.get(line.id);return decision?{...line,...JSON.parse(decision.patch_json),note:decision.reason,reviewed:true,original:line,reviewPatch:JSON.parse(decision.patch_json)}: {...line,reviewed:false};};
 const lines=allLines.map(apply);
 const issues=allIssues.filter(i=>i.source==='excel'||!i.date||inPeriod(i.date,p)).map(i=>{
  const decision=d.get(i.id);if(!decision)return i;
  const patch=JSON.parse(decision.patch_json);
  if(patch.interpretation){const x=patch.interpretation;lines.push(apply({id:i.id,source:i.source,date:x.date,customer:x.customer,product:x.product,qty:x.qty,unit:x.unit,reference:i.reference,text:i.text,warnings:['대화 수동 해석']}));}
  return {...i,reviewed:true,note:decision.reason,reviewPatch:patch};
 });
 const duplicateMap=new Map<string,typeof lines>();
 for(const l of lines){const key=JSON.stringify([l.source,l.date,l.customer,l.product,l.unit,l.qty]);const group=duplicateMap.get(key)||[];group.push(l);duplicateMap.set(key,group);}
 const groups=new Map<string,any>();
 for(const l of lines){
  const isOutside=!inPeriod(l.date,p);
  if(isOutside&&l.source==='chat')continue;
  const same=duplicateMap.get(JSON.stringify([l.source,l.date,l.customer,l.product,l.unit,l.qty]));
  const warnings=[...l.warnings,...(isOutside?['정산 기간 밖 내역: 이월 청구 여부 확인']:[]),...(same&&same.length>1?['같은 날짜·거래처·품목·수량 반복: 중복 여부 확인']:[])];
  const key=JSON.stringify([l.customer,l.product,l.unit]),g=groups.get(key)||{key,customer:l.customer,product:l.product,unit:l.unit,chat:[],excel:[],site:[]};
  g[l.source].push({...l,warnings,outside:isOutside});groups.set(key,g);
 }
 const rows=Array.from(groups.values()).map(g=>{
  const totals:any={},amounts:any={};let needsReview=false;
  for(const source of ['chat','excel','site']){
   const active=g[source].filter((l:any)=>!l.excluded&&!l.outside);
   totals[source]=round(active.reduce((s:number,l:any)=>s+l.qty,0));
   amounts[source]=active.length&&active.every((l:any)=>Number.isFinite(l.amount))?round(active.reduce((s:number,l:any)=>s+l.amount,0)):null;
   if(g[source].some((l:any)=>!l.reviewed&&(l.warnings.length||l.excluded)))needsReview=true;
  }
  const matching=totals.chat===totals.excel&&totals.excel===totals.site;
  const activeCount=['chat','excel','site'].reduce((n,s)=>n+g[s].filter((l:any)=>!l.excluded&&!l.outside).length,0);
  const dates=(s:string)=>g[s].filter((l:any)=>!l.excluded&&!l.outside).map((l:any)=>l.date).sort().join(',');
  const dateDifferent=dates('chat')!==dates('excel')||dates('excel')!==dates('site');
  if(dateDifferent&&['chat','excel','site'].some(s=>g[s].some((l:any)=>!l.reviewed&&!l.excluded)))needsReview=true;
  const priceDifferent=amounts.excel!=null&&amounts.site!=null&&Math.abs(amounts.excel-amounts.site)>1;
  return {...g,totals,amounts,status:!activeCount?'기간 밖·제외':!matching?'수량 차이':needsReview?'근거 확인':priceDifferent?'금액 차이':amounts.excel==null||amounts.site==null?'단가 확인':'수량·금액 일치'};
 }).sort((a,b)=>(a.status==='수량·금액 일치'?1:0)-(b.status==='수량·금액 일치'?1:0)||a.customer.localeCompare(b.customer,'ko')||a.product.localeCompare(b.product,'ko'));
 const totals:any={};for(const source of ['chat','excel','site']){const ls=lines.filter(l=>l.source===source&&!l.excluded&&inPeriod(l.date,p));totals[source]={oneKgQty:round(ls.filter(l=>l.unit==='1kg').reduce((s,l)=>s+l.qty,0)),otherLines:ls.filter(l=>l.unit!=='1kg').length,count:ls.length};}
 return {period:p,rows,issues,totals,unresolvedIssues:issues.filter(i=>!i.reviewed).length,
  staleDecisions:decisions.filter(d=>!allLines.some(l=>l.id===d.line_id)&&!allIssues.some(i=>i.id===d.line_id)).length};
}
export function settlementView(db:any,id:number){
 const run=db.prepare('SELECT * FROM settlement_runs WHERE id=?').get(id);if(!run)throw new Error('대조 기록을 찾지 못했습니다.');
 const excel=JSON.parse(run.excel_json),chat=JSON.parse(run.chat_json),site=siteSources(db,run.supplier_id,run.month);
 const lines=[...excel.lines,...chat.lines,...site.lines];const issues=[...sourceIssues('excel',excel.issues),...sourceIssues('chat',chat.issues),...site.issues];
 const decisions=db.prepare('SELECT * FROM settlement_decisions WHERE run_id=?').all(id);
 const before=compareSources(run.month,lines,issues);
 const compared=compareSources(run.month,lines,issues,decisions);
 return {id,month:run.month,supplierId:run.supplier_id,createdAt:run.created_at,...compared,rawTotals:before.totals,
  excelSummary:{supplyAmount:excel.supplyAmount,vat:excel.vat,prices:excel.prices},
  siteFingerprint:digest(JSON.stringify(site)),decisionCount:decisions.length};
}
const text=z.string().trim().min(1).max(150);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d=>!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d);
const fields={date,customer:text,product:text,qty:z.number().finite().min(-100000).max(100000),unit:z.enum(['1kg','500g','200g','100g','미확인'])};
const decisionSchema=z.object({reason:z.string().trim().min(3).max(1000),siteFingerprint:z.string(),patch:z.object({excluded:z.boolean().optional(),date:date.optional(),customer:text.optional(),product:text.optional(),qty:fields.qty.optional(),unit:fields.unit.optional(),interpretation:z.object(fields).optional()}).strict()});
export function registerSettlements(app:Express,db:any,auth:RequestHandler){
 initSettlements(db);
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:2,fields:4}}).fields([{name:'excel',maxCount:1},{name:'chat',maxCount:1}]);
 app.get('/api/admin/settlements',auth,(_req,res)=>res.json(db.prepare('SELECT id,month,supplier_id AS supplierId,created_at AS createdAt FROM settlement_runs ORDER BY id DESC LIMIT 60').all()));
 app.post('/api/admin/settlements',auth,(req,res)=>{upload(req,res,err=>{
  try{
   if(err)throw new Error('파일은 엑셀·CSV 각 10MB 이하로 한 개씩 올려 주세요.');
   const month=String(req.body.month);period(month);const supplierId=Number(req.body.supplierId);
   if(!db.prepare('SELECT id FROM suppliers WHERE id=?').get(supplierId))throw new Error('공급처를 선택해 주세요.');
   if(req.body.confirmUnit!=='true')throw new Error('클라리멘토 원장 수량의 1kg 단위를 확인해 주세요.');
   const files=req.files as {[key:string]:Express.Multer.File[]};const excelFile=files?.excel?.[0],chatFile=files?.chat?.[0];
   if(!excelFile||!chatFile||!excelFile.originalname.toLowerCase().endsWith('.xlsx')||!chatFile.originalname.toLowerCase().endsWith('.csv'))throw new Error('클라리멘토 XLSX와 카카오톡 CSV를 올려 주세요.');
   const fingerprint=digest(JSON.stringify([month,supplierId,digest(excelFile.buffer),digest(chatFile.buffer),'v1']));
   const existing=db.prepare('SELECT id FROM settlement_runs WHERE fingerprint=?').get(fingerprint);if(existing)return res.json({id:existing.id,reused:true});
   const excel=parseSettlement(excelFile.buffer),chat=parseChat(new TextDecoder('utf-8',{fatal:true}).decode(chatFile.buffer));
   if(!chat.lines.length)throw new Error('대화에서 발주 형식을 찾지 못했습니다. PC 카카오톡 CSV 내보내기 파일인지 확인해 주세요.');
   const p=period(month);if(!chat.lines.some(l=>inPeriod(l.date,p)))throw new Error('선택한 정산 기간의 발주 대화가 없습니다.');
   // Retain only the selected period's conversation. Do not store years of unrelated chat or phone numbers unnecessarily.
   chat.lines=chat.lines.filter(l=>inPeriod(l.date,p));chat.issues=chat.issues.filter(l=>!l.date||inPeriod(l.date,p));
   const id=Number(db.prepare('INSERT INTO settlement_runs(month,supplier_id,fingerprint,excel_json,chat_json,created_at,created_by) VALUES(?,?,?,?,?,?,?)').run(month,supplierId,fingerprint,JSON.stringify(excel),JSON.stringify(chat),Date.now(),req.session.userId).lastInsertRowid);
   res.json({id,reused:false});
  }catch(e:any){res.status(400).json({message:e instanceof TypeError?'CSV를 UTF-8로 다시 저장해 주세요.':e.message});}
 });});
 app.get('/api/admin/settlements/:id',auth,(req,res)=>{try{res.json(settlementView(db,Number(req.params.id)));}catch(e:any){res.status(400).json({message:e.message});}});
 app.put('/api/admin/settlements/:id/decisions/:lineId',auth,(req,res)=>{
  try{const data=decisionSchema.parse(req.body),runId=Number(req.params.id),lineId=String(req.params.lineId);
   db.transaction(()=>{
    const view=settlementView(db,runId);if(data.siteFingerprint!==view.siteFingerprint)throw new Error('사이트 발주가 변경됐습니다. 새로고침 후 다시 확인해 주세요.');
    const row=view.rows.flatMap((r:any)=>[...r.chat,...r.excel,...r.site]).find((l:any)=>l.id===lineId);const issue=view.issues.find(i=>i.id===lineId);
    if(!row&&!issue)throw new Error('현재 원문에서 찾을 수 없는 항목입니다.');
    if(row&&data.patch.interpretation&&!issue)throw new Error('일반 품목 행에는 대화 해석을 추가할 수 없습니다.');
    if(issue&&!data.patch.interpretation&&Object.keys(data.patch).length)throw new Error('대화 확인은 사유만 저장하거나 품목으로 해석해 주세요.');
    const patch={...data.patch};if(patch.customer)patch.customer=customerName(patch.customer);if(patch.product)patch.product=productName(patch.product);
    if(patch.interpretation){patch.interpretation.customer=customerName(patch.interpretation.customer);patch.interpretation.product=productName(patch.interpretation.product);}
    if(row&&((patch.product&&patch.product!==row.product)||(patch.unit&&patch.unit!==row.unit))){(patch as any).unitPrice=null;(patch as any).amount=null;}
    else if(row&&patch.qty!=null&&row.unitPrice!=null)(patch as any).amount=round(patch.qty*row.unitPrice);
    const before=db.prepare('SELECT * FROM settlement_decisions WHERE run_id=? AND line_id=?').get(runId,lineId);
    db.prepare(`INSERT INTO settlement_decisions VALUES(?,?,?,?,?,?) ON CONFLICT(run_id,line_id) DO UPDATE SET patch_json=excluded.patch_json,reason=excluded.reason,actor_id=excluded.actor_id,updated_at=excluded.updated_at`).run(runId,lineId,JSON.stringify(patch),data.reason,req.session.userId,Date.now());
    db.prepare('INSERT INTO settlement_decision_history(run_id,line_id,before_json,after_json,actor_id,created_at) VALUES(?,?,?,?,?,?)').run(runId,lineId,before?JSON.stringify(before):null,JSON.stringify(data),req.session.userId,Date.now());
   })();res.json({ok:true});
  }catch(e:any){res.status(409).json({message:e instanceof z.ZodError?'날짜·거래처·품목·수량과 확인 사유를 입력해 주세요.':e.message});}
 });
}
