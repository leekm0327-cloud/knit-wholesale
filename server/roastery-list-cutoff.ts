import type Database from 'better-sqlite3';
import {clarimentoUsername} from './roastery-accounts';

type Boundary = {roasteryId:number; id:number; createdAt:number};
type Status =
  | {configEnabled:false;boundaryFound:false;reason:'unset'}
  | {configEnabled:true;boundaryFound:false;reason:'supplier_missing'|'supplier_ambiguous'|'anchor_missing'|'anchor_ambiguous'|'anchor_not_assigned'|'anchor_invalid'}
  | {configEnabled:true;boundaryFound:true;reason:'ready';boundary:Boundary};

export function resolveRoasteryListCutoff(db:Database.Database,value:string|undefined):Status {
  const anchor=value?.trim();
  if(!anchor) return {configEnabled:false,boundaryFound:false,reason:'unset'};
  const unavailable=(reason:Extract<Status,{configEnabled:true;boundaryFound:false}>['reason']):Status=>({configEnabled:true,boundaryFound:false,reason});
  const suppliers=db.prepare('SELECT id FROM suppliers WHERE name=? COLLATE BINARY LIMIT 2').all(clarimentoUsername) as {id:number}[];
  if(suppliers.length!==1) return unavailable(suppliers.length?'supplier_ambiguous':'supplier_missing');
  const roasteryId=suppliers[0].id;
  const orders=db.prepare(`SELECT o.id,o.created_at AS createdAt,a.roastery_id AS assignedTo
    FROM orders o LEFT JOIN roastery_assignments a ON a.order_id=o.id
    WHERE o.order_no=? COLLATE BINARY LIMIT 2`).all(anchor) as {id:number;createdAt:number;assignedTo:number|null}[];
  if(orders.length!==1) return unavailable(orders.length?'anchor_ambiguous':'anchor_missing');
  const {id,createdAt,assignedTo}=orders[0];
  if(assignedTo!==roasteryId) return unavailable('anchor_not_assigned');
  if(!Number.isSafeInteger(id)||!Number.isSafeInteger(createdAt)) return unavailable('anchor_invalid');
  return {configEnabled:true,boundaryFound:true,reason:'ready',boundary:{roasteryId,id,createdAt}};
}

export function filterRoasteryList<T extends {order_id:number;created_at:number}>(orders:T[],roasteryId:number,status:Status):T[] {
  if(!status.boundaryFound||status.boundary.roasteryId!==roasteryId) return orders;
  const {id,createdAt}=status.boundary;
  return orders.filter(order=>!Number.isSafeInteger(order.created_at)||!Number.isSafeInteger(order.order_id)
    ||order.created_at>createdAt||(order.created_at===createdAt&&order.order_id>id));
}
