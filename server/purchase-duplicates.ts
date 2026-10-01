import {createHash} from 'node:crypto';
const norm=(s:string)=>s.normalize('NFC').replace(/\s+/g,' ').trim();
const itemsKey=(items:any[])=>JSON.stringify(items.map(i=>[i.productId??norm(i.name),Number(i.qty)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
export function purchaseDuplicateCheck(db:any,input:any){
 const key=itemsKey(input.items),name=norm(input.customerName||'');
 const rows=db.prepare('SELECT * FROM purchases WHERE supplier_id=? AND purchase_date=?').all(input.supplierId,input.purchaseDate);
 const hits=rows.filter((p:any)=>{
  const sameCustomer=input.customerId!=null&&p.customer_id!=null?input.customerId===p.customer_id:name&&name===norm(p.customer_name||'');
  return sameCustomer&&itemsKey(JSON.parse(p.items))===key;
 });
 return {candidates:hits.map((p:any)=>({id:p.id,purchaseNo:p.purchase_no})),token:createHash('sha256').update(JSON.stringify([input.supplierId,input.purchaseDate,input.customerId??null,name,key,hits.map((p:any)=>[p.id,p.items])])).digest('hex')};
}
