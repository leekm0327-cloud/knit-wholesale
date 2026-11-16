import type Database from 'better-sqlite3';
import type {Express, RequestHandler} from 'express';
import bcrypt from 'bcryptjs';
import {z} from 'zod';

export const clarimentoUsername = '클라리멘토';
const passwordInput = z.object({password:z.string().min(12).max(72).refine(s=>Buffer.byteLength(s,'utf8')<=72)}).strict();

export function getRoasteryCredentialVersion(db:Database.Database,userId:number):number|undefined {
  const account = db.prepare(`SELECT COALESCE(v.version,0) AS version
    FROM customers c JOIN roastery_members m ON m.user_id=c.id
    LEFT JOIN roastery_credential_versions v ON v.user_id=c.id
    WHERE c.id=? AND c.role='roastery' AND m.enabled=1`).get(userId) as {version:number}|undefined;
  return account?.version;
}

export function isRoasteryCredentialCurrent(db:Database.Database,userId:number|undefined,sessionVersion:number|undefined):boolean {
  if(!userId||!Number.isSafeInteger(sessionVersion)) return false;
  return getRoasteryCredentialVersion(db,userId)===sessionVersion;
}

export function registerRoasteryAccounts(app:Express,db:Database.Database,owner:RequestHandler) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roastery_credential_versions (
      user_id INTEGER PRIMARY KEY,version INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS roastery_account_audit (
      id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,actor INTEGER NOT NULL,
      action TEXT NOT NULL,created_at INTEGER NOT NULL
    );
  `);
  const base='/api/admin/roastery-accounts';
  const noStore:RequestHandler=(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();};
  const freshOwner:RequestHandler=(req,res,next)=>{
    const actor=req.session.userId;
    if(!actor||!db.prepare("SELECT 1 FROM customers WHERE id=? AND role='admin' AND admin_role='owner'").get(actor))
      return res.status(403).json({message:'대표 관리자 권한이 필요합니다.'});
    next();
  };
  const audit=(id:number,actor:number,action:string)=>
    db.prepare('INSERT INTO roastery_account_audit(user_id,actor,action,created_at) VALUES(?,?,?,?)').run(id,actor,action,Date.now());
  const supplier=()=>{
    const rows=db.prepare('SELECT id FROM suppliers WHERE name=? LIMIT 2').all(clarimentoUsername) as {id:number}[];
    return rows.length===1?rows[0].id:undefined;
  };
  // Credential-version rows mark identities created by this workflow. Never adopt legacy users.
  const managed=()=>db.prepare(`SELECT c.id,c.business_name AS username,m.enabled FROM customers c
      JOIN roastery_members m ON m.user_id=c.id JOIN roastery_credential_versions v ON v.user_id=c.id
      WHERE c.role='roastery' AND c.business_name=? AND m.roastery_id=?`).get(clarimentoUsername,supplier()??-1) as {id:number;username:string;enabled:number}|undefined;
  const bump=(id:number)=>db.prepare('UPDATE roastery_credential_versions SET version=version+1 WHERE user_id=?').run(id);
  const invalid='비밀번호는 12자 이상이고 UTF-8 기준 72바이트 이하여야 합니다.';

  app.get(base,noStore,owner,freshOwner,(_req,res)=>res.json({account:managed()??null}));
  app.post(base,noStore,owner,freshOwner,(req,res)=>{
    const p=passwordInput.safeParse(req.body);
    if(!p.success) return res.status(400).json({message:invalid});
    const hash=bcrypt.hashSync(p.data.password,10);
    const id=db.transaction(()=>{
      const rid=supplier();
      if(rid===undefined||db.prepare('SELECT 1 FROM customers WHERE business_name=? LIMIT 1').get(clarimentoUsername)) return null;
      const id=Number(db.prepare(`INSERT INTO customers(email,password,role,admin_role,business_name,manager_name,phone,created_at)
        VALUES('',?,'roastery','',?,?,'',?)`).run(hash,clarimentoUsername,clarimentoUsername,Date.now()).lastInsertRowid);
      db.prepare('INSERT INTO roastery_members(user_id,roastery_id,enabled) VALUES(?,?,1)').run(id,rid);
      db.prepare('INSERT INTO roastery_credential_versions(user_id,version) VALUES(?,1)').run(id);
      audit(id,req.session.userId!,'created');
      return id;
    }).immediate();
    if(id===null) return res.status(409).json({message:'클라리멘토 공급처 또는 기존 계정을 확인해 주세요.'});
    return res.status(201).json({id,username:clarimentoUsername});
  });
  app.post(base+'/:id/password',noStore,owner,freshOwner,(req,res)=>{
    const id=Number(req.params.id);
    const p=passwordInput.safeParse(req.body);
    if(!p.success) return res.status(400).json({message:invalid});
    const current=managed();
    if(!current||current.id!==id) return res.status(404).json({message:'사용 중인 계정을 찾을 수 없습니다.'});
    const hash=bcrypt.hashSync(p.data.password,10);
    const changed=db.transaction(()=>{
      const account=managed();
      if(!account||account.id!==id) return false;
      db.prepare('UPDATE customers SET password=? WHERE id=?').run(hash,id);
      db.prepare('UPDATE roastery_members SET enabled=1 WHERE user_id=?').run(id);
      bump(id);
      audit(id,req.session.userId!,account.enabled?'password_changed':'reactivated_with_new_password');
      return true;
    }).immediate();
    return changed?res.json({ok:true}):res.status(404).json({message:'사용 중인 계정을 찾을 수 없습니다.'});
  });
  app.post(base+'/:id/revoke',noStore,owner,freshOwner,(req,res)=>{
    const id=Number(req.params.id);
    const found=db.transaction(()=>{
      const account=managed();
      if(!account||account.id!==id) return false;
      if(account.enabled){
        db.prepare('UPDATE roastery_members SET enabled=0 WHERE user_id=?').run(id);
        bump(id);
        audit(id,req.session.userId!,'revoked');
      }
      return true;
    }).immediate();
    return found?res.json({ok:true}):res.status(404).json({message:'계정을 찾을 수 없습니다.'});
  });
}
