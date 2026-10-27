import type {Express,RequestHandler} from 'express';
import type Database from 'better-sqlite3';
import type {CustomerShipping} from '../shared/shipping';
import {shippingOrderFingerprint} from './roastery-shipping';
/** Read the committed shipment source, never copy tracking into mutable legacy orders. Call only after order authorization. */
export function withCustomerShipping<T extends {id:number;trackingNo:string}>(db:Database.Database,order:T):T & {shipping:CustomerShipping|null}{
 const r:any=db.prepare(`SELECT o.items,o.customer_snapshot,o.status AS order_status,o.tracking_no AS legacy_tracking,s.carrier,s.tracking,s.state,s.order_fingerprint FROM orders o LEFT JOIN roastery_shipments s ON s.order_id=o.id WHERE o.id=?`).get(order.id);
 if(!r||r.order_status==='cancelled')return {...order,trackingNo:'',shipping:null};
 if(r.legacy_tracking)return {...order,trackingNo:r.legacy_tracking,shipping:{carrier:'',tracking:r.legacy_tracking,state:'registered'}};
 if(!r.state)return {...order,trackingNo:'',shipping:null};
 if(r.state==='rejected'||r.order_fingerprint!==shippingOrderFingerprint(r))return {...order,trackingNo:'',shipping:{carrier:'',tracking:'',state:'review_required'}};
 return {...order,trackingNo:r.tracking,shipping:{carrier:r.carrier,tracking:r.tracking,state:r.state==='dispatch_confirmed'?'dispatch_confirmed':'registered'}};
}

export function registerCustomerOrderReads(app:Express,db:Database.Database,auth:RequestHandler,storage:{listOrdersByCustomer:(id:number)=>Promise<any[]>;getOrder:(id:number)=>Promise<any>}){
 app.get('/api/orders/mine',auth,async(req,res)=>{res.setHeader('Cache-Control','no-store');res.json((await storage.listOrdersByCustomer(req.session.userId!)).map(o=>withCustomerShipping(db,o)));});
 app.get('/api/orders/:id',auth,async(req,res)=>{const order=await storage.getOrder(Number(req.params.id));if(!order)return res.status(404).json({message:'주문을 찾을 수 없습니다.'});if(req.session.role!=='admin'&&order.customerId!==req.session.userId)return res.status(403).json({message:'권한이 없습니다.'});res.setHeader('Cache-Control','no-store');res.json(req.session.role==='admin'?order:withCustomerShipping(db,order));});
}
