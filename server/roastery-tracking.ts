import {createHash} from 'node:crypto';
export const shippingOrderFingerprint=(r:any)=>createHash('sha256').update(JSON.stringify([r.items,r.customer_snapshot,r.order_status,r.legacy_tracking])).digest('hex');
/** Missing includes rejected, empty and stale shipment records; cancellation never becomes a queue candidate. */
export function hasValidShippingTracking(r:any){
 if(r.order_status==='cancelled')return false;
 if(String(r.legacy_tracking??'').trim())return true;
 return !!String(r.tracking??'').trim() && !!r.state && r.state!=='rejected' && r.order_fingerprint===shippingOrderFingerprint(r);
}
