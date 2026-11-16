import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import express from 'express';
import type Database from 'better-sqlite3';
import {DatabaseSync} from 'node:sqlite';
import {registerStaffBeanOrders} from '../../server/staff-bean-orders';

test('staff orders are idempotent, internal, and scoped to the configured store',async()=>{
 const db=new DatabaseSync(':memory:');
 const transaction=(fn:()=>unknown)=>({immediate:()=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}});
 const wrapped=Object.assign(db,{transaction}) as unknown as Database.Database;
 db.exec(`
 CREATE TABLE staff (id INTEGER PRIMARY KEY,name TEXT,active INTEGER);
 INSERT INTO staff VALUES(1,'Synthetic One',1),(2,'Synthetic Two',1),(3,'Inactive',0);
 CREATE TABLE customers (id INTEGER PRIMARY KEY,role TEXT,is_store INTEGER,business_name TEXT,manager_name TEXT,phone TEXT,default_address TEXT,biz_reg_no TEXT,tax_email TEXT,payment_method TEXT);
 INSERT INTO customers VALUES(10,'customer',1,'Synthetic store','Synthetic manager','0000','Synthetic address','','','transfer');
 CREATE TABLE product_categories(key TEXT,is_bean INTEGER);
 INSERT INTO product_categories VALUES('bean',1),('other',0);
 CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT,category TEXT,min_order_qty INTEGER,cost_price INTEGER,available INTEGER,hidden INTEGER,sort_order INTEGER);
 INSERT INTO products VALUES(1,'Cotton 1kg','bean',2,5000,1,0,1),(2,'Silk 1kg','bean',1,6000,1,0,2),(3,'Hidden','bean',0,8000,1,1,3),(4,'Sold out','bean',0,7000,0,0,4),(5,'Accessory','other',0,8000,1,0,5);
 CREATE TABLE orders(id INTEGER PRIMARY KEY,order_no TEXT,customer_id INTEGER,is_store_order INTEGER,customer_snapshot TEXT,items TEXT,supply_amount INTEGER,vat INTEGER,total_amount INTEGER,note TEXT,status TEXT,created_at INTEGER);
 CREATE TABLE activity_logs(actor_user_id INTEGER,actor_email TEXT,actor_role TEXT,action TEXT,target_type TEXT,target_id TEXT,summary TEXT,metadata TEXT,created_at INTEGER);
 `);
 const app=express();app.use(express.json());
 app.use((req,_res,next)=>{req.session={staffId:Number(req.get('x-staff')??0)} as typeof req.session;next();});
 registerStaffBeanOrders(app,wrapped,(_req,_res,next)=>next());
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');
 try {
  const address=server.address();assert(address&&typeof address==='object');
  const call=(id:number,body?:unknown)=>fetch(`http://127.0.0.1:${address.port}/api/staff/bean-orders`,{method:body?'POST':'GET',headers:{'x-staff':String(id),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  assert.equal((await call(0)).status,401);assert.equal((await call(3)).status,401);
  assert.deepEqual(await (await call(1)).json(),{configured:true,products:[{id:1,name:'Cotton 1kg',minQty:2},{id:2,name:'Silk 1kg',minQty:1}],recent:[]});
  const req={requestId:randomUUID(),items:[{productId:1,qty:2},{productId:2,qty:3}]};
  assert.equal((await call(1,{...req,customerId:10})).status,400);
  assert.equal((await call(1,{...req,items:[{productId:1,qty:4}]})).status,400);
  assert.equal((await call(1,{...req,items:[{productId:1,qty:1},{productId:2,qty:4}]})).status,400);
  for(const productId of [3,4,5])assert.equal((await call(1,{...req,items:[{productId,qty:5}]})).status,409);
  db.exec("INSERT INTO customers VALUES(11,'customer',1,'Second store','','0000','Another address','','','transfer')");
  assert.equal((await call(1,req)).status,409);db.exec('DELETE FROM customers WHERE id=11');
  const r=await call(1,req);assert.equal(r.status,201);
  const response=await r.json();assert.deepEqual(Object.keys(response),['orderNo']);
  const replay=await call(1,{...req,items:[...req.items].reverse()});assert.equal(replay.status,200);assert.deepEqual(await replay.json(),response);
  assert.equal((await call(1,{...req,items:[{productId:1,qty:5}]})).status,409);
  const actual=db.prepare('SELECT * FROM orders').all();
  assert.equal(actual.length,1);assert.equal(actual[0].customer_id,10);assert.equal(actual[0].is_store_order,1);assert.equal(actual[0].status,'pending');
  assert.equal(actual[0].total_amount,30800);
  assert.equal(db.prepare('SELECT actor_user_id FROM activity_logs').get()?.actor_user_id,1);
  assert.equal((await (await call(2)).json()).recent.length,0);
  assert.deepEqual(Object.keys((await (await call(1)).json()).recent[0]).sort(),['createdAt','orderNo','status']);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();}
});
