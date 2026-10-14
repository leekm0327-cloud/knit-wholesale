export function kstDay(offset=0){return new Date(Date.now()+9*3600000+offset*86400000).toISOString().slice(0,10);}
export function saveCsv(name:string,rows:unknown[][]){
 const csv='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
