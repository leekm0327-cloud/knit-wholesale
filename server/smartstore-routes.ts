import type {Express,Request,Response,RequestHandler} from 'express';
import {z} from 'zod';
import {SmartstoreError,smartstoreConfig,createSmartstoreClient,type SmartstoreConfig} from './smartstore-client';
export function registerSmartstoreRoutes(app:Express,admin:RequestHandler,options?:{config:SmartstoreConfig|null;fetcher?:typeof fetch;now?:()=>number}){
 let config:SmartstoreConfig|null=null,error='';try{config=options?options.config:smartstoreConfig();}catch(e){error=e instanceof SmartstoreError?e.message:'네이버 서버 설정을 확인해 주세요.';}
 const client=createSmartstoreClient(config,options?.fetcher,options?.now);
 const safe=(fn:(r:Request,s:Response)=>unknown):RequestHandler=>async(r,s)=>{s.setHeader('Cache-Control','no-store');s.setHeader('Referrer-Policy','no-referrer');try{await fn(r,s);}catch(e){if(e instanceof z.ZodError){s.status(400).json({message:'날짜, 상품주문번호, 페이지를 확인해 주세요.'});return;}if(e instanceof SmartstoreError){s.status(e.status).json({code:e.code,message:e.message});return;}s.status(500).json({message:'스마트스토어 조회를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'});}};
 app.get('/api/admin/smartstore/status',admin,safe((_r,s)=>s.json(error?{state:'error',message:error}:client.status())));
 app.get('/api/admin/smartstore/orders',admin,safe(async(r,s)=>s.json(await client.list(r.query))));
 app.get('/api/admin/smartstore/orders/:id',admin,safe(async(r,s)=>s.json(await client.detail(r.params.id))));
}
