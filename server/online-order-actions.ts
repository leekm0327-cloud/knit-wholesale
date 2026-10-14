import type Database from 'better-sqlite3';
import type {Request} from 'express';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {OrderActionResult} from '../shared/smartstore';

export class OrderActionError extends Error {constructor(message:string,public status=409){super(message);}}
/** Records contain operation IDs and digests only, never addresses, phones or raw tracking numbers. */
export function createOrderActionStore(db:Database.Database){
 db.exec(`CREATE TABLE IF NOT EXISTS online_order_actions (
  request_id TEXT PRIMARY KEY, channel TEXT NOT NULL, order_id TEXT NOT NULL,
  action TEXT NOT NULL, digest TEXT NOT NULL, actor TEXT NOT NULL,
  outcome TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL
 )`);
 return {
  history(channel:string,id:string){return db.prepare('SELECT action,outcome,message,created_at AS createdAt FROM online_order_actions WHERE channel=? AND order_id=? ORDER BY created_at DESC LIMIT 30').all(channel,id);},
  async run(req:Request,channel:string,id:string,fn:()=>Promise<OrderActionResult>){
   const allowed=process.env.PUBLIC_URL;
   const origin=req.get('Origin');
   if(!origin||origin!==(allowed?new URL(allowed).origin:`${req.protocol}://${req.get('Host')}`))throw new OrderActionError('관리자 화면에서 처리해 주세요.',403);
   const key=z.string().uuid().parse(req.get('X-Order-Action-Key'));
   if(req.body?.confirmed!==true)throw new OrderActionError('처리할 주문과 내용을 먼저 확인해 주세요.',400);
   const action=z.enum(['confirm','dispatch']).parse(req.body.action);
   const digest=createHash('sha256').update(JSON.stringify({channel,id,action,carrier:req.body.carrier||'',trackingNo:req.body.trackingNo||'',itemCodes:req.body.itemCodes||[]})).digest('hex');
   const existing=db.prepare('SELECT * FROM online_order_actions WHERE request_id=?').get(key) as any;
   if(existing){if(existing.digest!==digest)throw new OrderActionError('동일 요청 번호로 다른 내용을 전송할 수 없습니다.');return {id,outcome:existing.outcome==='pending'?'unknown':existing.outcome,message:existing.message} as OrderActionResult;}
   db.transaction(()=>{
    const locked=db.prepare("SELECT 1 FROM online_order_actions WHERE channel=? AND order_id=? AND action=? AND outcome IN ('pending','unknown','success')").get(channel,id,action);
    if(locked)throw new OrderActionError('이미 처리했거나 결과 확인이 필요한 주문입니다. 채널의 최신 상태와 처리 기록을 확인해 주세요.');
    db.prepare('INSERT INTO online_order_actions VALUES(?,?,?,?,?,?,?,?,?)').run(key,channel,id,action,digest,String(req.session?.userId||''),'pending','처리 결과 확인 중',new Date().toISOString());
   })();
   let result:OrderActionResult;
   try {result=await fn();} catch(e:any){
    // A timeout/5xx can occur after the upstream mutation committed. Never retry automatically.
    result={id,outcome:e instanceof z.ZodError||[400,401,403,404,409,422,429].includes(e?.status)?'failed':'unknown',message:e instanceof z.ZodError?'입력한 주문 처리 정보를 확인해 주세요.':e?.status&&e instanceof Error?e.message:'결과가 불확실합니다. 채널에서 상태를 확인한 뒤 처리해 주세요.'};
   }
   db.prepare('UPDATE online_order_actions SET outcome=?,message=? WHERE request_id=?').run(result.outcome,result.message,key);
   return result;
  }
 };
}
