import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import type Database from 'better-sqlite3';
import {installRoasteryLoginLock,roasteryLoginWait,roasteryLoginFailed,clearRoasteryLoginFailures} from '../../server/roastery-login-lock';

test('five failures produce a durable fixed fifteen-minute lock; success clears counters',()=>{
  const dir=mkdtempSync(join(tmpdir(),'synthetic-roastery-lock-'));
  const makeDb=()=>{
    const sqlite=new DatabaseSync(join(dir,'fixture.sqlite'));
    const transaction=(fn:()=>unknown)=>({immediate:()=>{
      sqlite.exec('BEGIN IMMEDIATE');
      try{const result=fn();sqlite.exec('COMMIT');return result;}
      catch(error){sqlite.exec('ROLLBACK');throw error;}
    }});
    const db=Object.assign(sqlite,{transaction}) as unknown as Database.Database;
    installRoasteryLoginLock(db);
    return db;
  };
  let db=makeDb();
  try{
    const t=100_000;
    const lock=15*60_000;
    for(let i=0;i<4;i++) assert.equal(roasteryLoginFailed(db,20,t+i),0);
    assert.equal(roasteryLoginWait(db,20,t+4),0);
    assert.equal(roasteryLoginFailed(db,20,t+4),lock);
    assert.equal(roasteryLoginWait(db,21,t+4),0);
    db.close();
    db=makeDb();
    assert.equal(roasteryLoginWait(db,20,t+5),lock-1);
    assert.equal(roasteryLoginFailed(db,20,t+6),lock-2);
    assert.equal(roasteryLoginWait(db,20,t+4+lock-1),1);
    assert.equal(roasteryLoginWait(db,20,t+4+lock),0);
    assert.equal(roasteryLoginFailed(db,20,t+4+lock),0);
    assert.equal(roasteryLoginFailed(db,20,t+4+2*lock),0);
    clearRoasteryLoginFailures(db,20);
    for(let i=0;i<4;i++) assert.equal(roasteryLoginFailed(db,20,t+3*lock+i),0);
    assert.equal(roasteryLoginFailed(db,20,t+3*lock+4),lock);
  }finally{
    db.close();
    rmSync(dir,{recursive:true,force:true});
  }
});
