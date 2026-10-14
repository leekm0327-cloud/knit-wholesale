import type Database from 'better-sqlite3';
import {createOrderActionStore,OrderActionError} from './online-order-actions';
import type {Express,Request,Response,RequestHandler} from 'express';
import {z} from 'zod';
import {SmartstoreError,smartstoreConfig,createSmartstoreClient,type SmartstoreConfig} from './smartstore-client';
export function registerSmartstoreRoutes(app:Express,admin:RequestHandler,options?:{config?:SmartstoreConfig|null;fetcher?:typeof fetch;now?:()=>number;db?:Database.Database}){
 let config:SmartstoreConfig|null=null,error='';try{config=options&&Object.hasOwn(options,'config')?options.config??null:smartstoreConfig();}catch(e){error=e instanceof SmartstoreError?e.message:'네이버 서버 설정을 확인해 주세요.';}
 const actions=options?.db?createOrderActionStore(options.db):null;
 const client=createSmartstoreClient(config,options?.fetcher,options?.now);
 const safe=(fn:(r:Request,s:Response)=>unknown):RequestHandler=>async(r,s)=>{s.setHeader('Cache-Control','no-store');s.setHeader('Referrer-Policy','no-referrer');try{await fn(r,s);}catch(e){if(e instanceof OrderActionError){s.status(e.status).json({message:e.message});return;}if(e instanceof z.ZodError){s.status(400).json({message:'날짜, 상품주문번호, 페이지를 확인해 주세요.'});return;}if(e instanceof SmartstoreError){s.status(e.status).json({code:e.code,message:e.message});return;}s.status(500).json({message:'스마트스토어 조회를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'});}};
 app.get('/api/admin/smartstore/status',admin,safe((_r,s)=>s.json(error?{state:'error',message:error}:client.status())));
 app.get('/api/admin/smartstore/orders',admin,safe(async(r,s)=>s.json(await client.list(r.query))));
 app.get('/api/admin/smartstore/range',admin,safe(async(r,s)=>s.json(await client.range(r.query))));
 app.get('/api/admin/smartstore/orders/:id/history',admin,safe((r,s)=>s.json(actions?.history('smartstore',String(r.params.id))||[])));
 app.post('/api/admin/smartstore/orders/:id/action',admin,safe(async(r,s)=>{if(!actions)throw new OrderActionError('처리 저장소가 준비되지 않았습니다.',503);s.json(await actions.run(r,'smartstore',String(r.params.id),()=>client.action(r.params.id,r.body)));}));
 app.get('/api/admin/smartstore/orders/:id',admin,safe(async(r,s)=>s.json(await client.detail(r.params.id))));
}
