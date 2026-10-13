import type {Express,RequestHandler,Request,Response} from 'express';
import type Database from 'better-sqlite3';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {cafe24Config,Cafe24Error,createCafe24Client,type Cafe24Config} from './cafe24-client';
declare module 'express-session' {
 interface SessionData {cafe24OAuth?:{state:string;expires:number;userId:number;mallId:string};}
}
export function registerCafe24Routes(app:Express,db:Database.Database,admin:RequestHandler,owner:RequestHandler,options?:{config:Cafe24Config|null;fetcher?:typeof fetch;now?:()=>number}){
 let config:Cafe24Config|null=null,invalid=false;
 try{config=options?options.config:cafe24Config();}catch{invalid=true;}
 const now=options?.now||Date.now;
 const client=createCafe24Client(db,config,options?.fetcher,now);
 const prefix='/api/admin/cafe24';
 const safe=(fn:(req:Request,res:Response)=>Promise<unknown>|unknown):RequestHandler=>async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  try{await fn(req,res);}catch(e){
   if(e instanceof z.ZodError){res.status(400).json({code:'invalid_input',message:'기간(최대 90일), 주문번호, 페이지를 확인해 주세요.'});return;}
   if(e instanceof Cafe24Error){res.status(e.status).json({code:e.code,message:e.message});return;}
   res.status(500).json({code:'internal',message:'자사몰 주문 조회를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'});
  }
 };
 const saveSession=(req:Request)=>new Promise<void>((resolve,reject)=>req.session.save(e=>e?reject(e):resolve()));
 app.get(prefix+'/status',admin,safe((_req,res)=>res.json(invalid?{state:'error',mallId:'',shopNo:1,message:'카페24 서버 연결 설정을 확인해 주세요.'}:client.status())));
 app.post(prefix+'/connect',owner,safe(async(req,res)=>{
  if(!config)throw new Cafe24Error('not_configured','카페24 앱 등록과 서버 연결 설정을 먼저 완료해 주세요.',503);
  // A credential-bearing connection can only be started from our own admin UI.
  if(req.get('Origin')!==new URL(config.redirectUri).origin)throw new Cafe24Error('origin','관리자 화면에서 연결을 시작해 주세요.',403);
  const state=randomBytes(32).toString('hex');
  req.session.cafe24OAuth={state,expires:now()+10*60000,userId:req.session.userId!,mallId:config.mallId};
  await saveSession(req);res.json({url:client.authorizeUrl(state)});
 }));
 app.get(prefix+'/callback',owner,safe(async(req,res)=>{
  const state=typeof req.query.state==='string'?req.query.state:'';
  const saved=req.session.cafe24OAuth;
  if(!/^[a-f0-9]{64}$/.test(state)||!saved||saved.expires<now()||saved.userId!==req.session.userId||saved.mallId!==config?.mallId||state.length!==saved.state.length||!timingSafeEqual(Buffer.from(state),Buffer.from(saved.state)))
   throw new Cafe24Error('oauth_state','연결 확인 시간이 지났거나 요청이 일치하지 않습니다. 관리자에서 다시 연결해 주세요.',400);
  delete req.session.cafe24OAuth;await saveSession(req);
  if(req.query.error){res.redirect('/#/admin/cafe24-orders?connection=cancelled');return;}
  const code=z.string().min(1).max(2048).parse(req.query.code);
  await client.exchange(code);
  res.redirect('/#/admin/cafe24-orders?connection=success');
 }));
 app.get(prefix+'/orders',admin,safe(async(req,res)=>res.json(await client.list(req.query))));
 app.get(prefix+'/orders/:id',admin,safe(async(req,res)=>res.json(await client.detail(req.params.id))));
}
