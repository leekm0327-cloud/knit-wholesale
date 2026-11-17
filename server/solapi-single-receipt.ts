type JsonRecord=Record<string,unknown>;
type Receipt={kind:'accepted';messageId:string}|{kind:'rejected'|'unknown';detail:string};

const record=(x:unknown):x is JsonRecord=>!!x&&typeof x==='object'&&!Array.isArray(x);
// ID format examples are opaque alphanumerics. Do not accept group IDs or array indexes.
const id=(value:unknown)=>typeof value==='string'&&/^M4V[A-Za-z0-9_-]{8,120}$/.test(value)?value:'';
const unknown=():Receipt=>({kind:'unknown',detail:'솔라피 접수 여부 확인 필요 · 자동 재발송 금지'});
export function parseSingleSolapiReceipt(body:unknown):Receipt{
 if(!record(body)||!Array.isArray(body.failedMessageList))return unknown();
 const items=body.messageList;
 if(body.failedMessageList.length){
  if(body.failedMessageList.length!==1||!record(body.failedMessageList[0])||
   (items!==undefined&&(!Array.isArray(items)&&!record(items)||Object.keys(items).length>0)))return unknown();
  const code=body.failedMessageList[0].statusCode;
  if(typeof code!=='string'||!/^\d{4}$/.test(code)||code==='2000'||code==='4000')return unknown();
  return {kind:'rejected',detail:'솔라피 접수 거절 ('+code+')'};
 }
 const count=record(body.groupInfo)&&record(body.groupInfo.count)?body.groupInfo.count:null;
 if(count&&(('registeredSuccess' in count&&count.registeredSuccess!==1)||
            ('registeredFailed' in count&&count.registeredFailed!==0)||
            ('total' in count&&count.total!==1)))return unknown();
 let row:unknown,key='';
 if(Array.isArray(items)){
  if(items.length!==1)return unknown();
  row=items[0];
 }else if(record(items)){
  const entries=Object.entries(items);
  if(entries.length!==1)return unknown();
  [key,row]=entries[0];
  if(!id(key))return unknown();
 }else return unknown();
 if(!record(row)||row.statusCode!=='2000')return unknown();
 const supplied='messageId' in row;
 const value=supplied?id(row.messageId):key;
 if(!value||(key&&value!==key))return unknown();
 return {kind:'accepted',messageId:value};
}
