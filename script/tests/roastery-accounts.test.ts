import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import express from 'express';
import bcrypt from 'bcryptjs';
import type Database from 'better-sqlite3';
import {DatabaseSync} from 'node:sqlite';
import {getRoasteryCredentialVersion,isRoasteryCredentialCurrent,registerRoasteryAccounts} from '../../server/roastery-accounts';

test('fixed username, fresh owner credential management, and session version revocation',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  const transaction=(fn:()=>unknown)=>({immediate:()=>{
    sqlite.exec('BEGIN IMMEDIATE');
    try {const result=fn();sqlite.exec('COMMIT');return result;}
    catch(error){sqlite.exec('ROLLBACK');throw error;}
  }});
  const db=Object.assign(sqlite,{transaction}) as unknown as Database.Database;
  db.exec(`
    CREATE TABLE customers(id INTEGER PRIMARY KEY,email TEXT,password TEXT,role TEXT,admin_role TEXT,business_name TEXT,manager_name TEXT,phone TEXT,created_at INTEGER);
    INSERT INTO customers VALUES(1,'owner@example.invalid','','admin','owner','Owner','','',0),(2,'customer@example.invalid','','customer','','Customer','','',0),(3,'manager@example.invalid','','admin','manager','Manager','','',0),(4,'','','roastery','','Legacy','','',0);
    CREATE TABLE suppliers(id INTEGER PRIMARY KEY,name TEXT);
    INSERT INTO suppliers VALUES(10,'클라리멘토'),(11,'Other');
    CREATE TABLE roastery_members(user_id INTEGER PRIMARY KEY,roastery_id INTEGER,enabled INTEGER);
    INSERT INTO roastery_members VALUES(4,11,1);
  `);
  const app=express();
  app.use(express.json());
  app.use((req,_res,next)=>{req.session={userId:Number(req.get('x-test-actor')||0)} as typeof req.session;next();});
  registerRoasteryAccounts(app,db,(req,res,next)=>[1,3].includes(req.session.userId!)?next():res.sendStatus(403));
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  try {
    const address=server.address();
    assert(address&&typeof address!=='string');
    const base='/api/admin/roastery-accounts';
    const call=(path:string,actor:number,body?:unknown)=>fetch(`http://127.0.0.1:${address.port}${path}`,{
      method:body===undefined?'GET':'POST',headers:{'x-test-actor':String(actor),'content-type':'application/json'},
      body:body===undefined?undefined:JSON.stringify(body)
    });
    const password='Proper Synthetic Passphrase';
    assert.equal((await call(base,0)).status,403);
    assert.equal((await call(base,2,{password})).status,403);
    assert.equal((await call(base,3,{password})).status,403);
    assert.equal((await call(base,1,{password:'short'})).status,400);
    assert.equal((await call(base,1,{password:'가'.repeat(25)})).status,400);
    assert.deepEqual(await (await call(base,1)).json(),{account:null});
    sqlite.prepare("UPDATE customers SET business_name='클라리멘토' WHERE id=2").run();
    assert.equal((await call(base,1,{password})).status,409);
    sqlite.prepare("UPDATE customers SET business_name='Customer' WHERE id=2").run();
    assert.equal((await call(base+'/4/password',1,{password})).status,404);
    assert.equal(getRoasteryCredentialVersion(db,4),0);
    const r=await call(base,1,{password});
    assert.equal(r.status,201);
    assert.equal(r.headers.get('cache-control'),'no-store');
    const {id,username}=await r.json();
    assert.equal(username,'클라리멘토');
    assert.deepEqual(await (await call(base,1)).json(),{account:{id,username,enabled:1}});
    assert.equal((await call(base,1,{password})).status,409);
    const hash=()=>String((sqlite.prepare('SELECT password FROM customers WHERE id=?').get(id)??{}).password);
    assert(bcrypt.compareSync(password,hash()));
    assert.equal(isRoasteryCredentialCurrent(db,id,1),true);
    assert.equal(isRoasteryCredentialCurrent(db,id,undefined),false);
    assert.equal((await call(base+'/'+id+'/password',3,{password})).status,403);
    const replacement='Another Synthetic Passphrase';
    assert.equal((await call(base+'/'+id+'/password',1,{password:replacement})).status,200);
    assert(!bcrypt.compareSync(password,hash()));
    assert(bcrypt.compareSync(replacement,hash()));
    assert.equal(isRoasteryCredentialCurrent(db,id,1),false);
    assert.equal(isRoasteryCredentialCurrent(db,id,2),true);
    assert.equal((await call(base+'/'+id+'/revoke',1,{})).status,200);
    assert.equal((await call(base+'/'+id+'/revoke',1,{})).status,200);
    assert.equal(getRoasteryCredentialVersion(db,id),undefined);
    assert.equal(isRoasteryCredentialCurrent(db,id,2),false);
    const reactivation='Reactivation Synthetic Passphrase';
    assert.equal((await call(base+'/'+id+'/password',1,{password:reactivation})).status,200);
    assert(!bcrypt.compareSync(replacement,hash()));
    assert(bcrypt.compareSync(reactivation,hash()));
    assert.equal(isRoasteryCredentialCurrent(db,id,2),false);
    assert.equal(isRoasteryCredentialCurrent(db,id,4),true);
    assert.deepEqual(sqlite.prepare('SELECT actor,action FROM roastery_account_audit WHERE user_id=? ORDER BY id').all(id).map(row=>({...row})),[
      {actor:1,action:'created'},{actor:1,action:'password_changed'},{actor:1,action:'revoked'},{actor:1,action:'reactivated_with_new_password'}
    ]);
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    db.close();
  }
});
