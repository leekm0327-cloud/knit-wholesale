import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import { z } from 'zod';
export type BankEnvironment='test'|'production';
export type BankCredentials={key:string;corp:string;id:string};
export function registerBankConnection(app:Express,db:Database.Database,owner:RequestHandler){
 db.exec('CREATE TABLE IF NOT EXISTS bank_connections(environment TEXT PRIMARY KEY,ciphertext TEXT NOT NULL,updated_at INTEGER NOT NULL)');
 const encryptionKey=()=>{const secret=process.env.SESSION_SECRET;if(!secret||secret.length<32)throw new Error('서버 보안 설정 확인이 필요합니다.');return createHash('sha256').update('knit-bank-credentials-v1:'+secret).digest();};
 const envSchema=z.enum(['test','production']);
 const credentials=z.object({key:z.string().trim().min(20).max(100),corp:z.string().regex(/^\d{10}$/),id:z.string().trim().min(1).max(50)});
 const read=(env:BankEnvironment):BankCredentials=>{
  const row=db.prepare('SELECT ciphertext FROM bank_connections WHERE environment=?').get(env) as any;
  if(row){const [iv,tag,data]=row.ciphertext.split('.').map((s:string)=>Buffer.from(s,'base64'));const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),iv);decipher.setAuthTag(tag);return credentials.parse(JSON.parse(Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8')));}
  return credentials.parse({key:process.env[env==='test'?'BAROBILL_TEST_KEY':'BAROBILL_PRODUCTION_KEY'],corp:process.env.BAROBILL_CORP_NUM,id:process.env[env==='test'?'BAROBILL_USER_ID':'BAROBILL_PRODUCTION_USER_ID']});
 };
 app.post('/api/admin/bank-connection/:environment',owner,(req,res)=>{
  try{const env=envSchema.parse(req.params.environment),c=credentials.parse(req.body);const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify(c),'utf8'),cipher.final()]);
   db.prepare('INSERT INTO bank_connections(environment,ciphertext,updated_at) VALUES(?,?,?) ON CONFLICT(environment) DO UPDATE SET ciphertext=excluded.ciphertext,updated_at=excluded.updated_at').run(env,[iv,cipher.getAuthTag(),encrypted].map(b=>b.toString('base64')).join('.'),Date.now());
   res.json({ok:true});
  }catch{res.status(400).json({message:'연결 정보를 확인해 주세요. 저장에 실패하면 서버 보안 설정도 확인해 주세요.'});}
 });
 return read;
}
