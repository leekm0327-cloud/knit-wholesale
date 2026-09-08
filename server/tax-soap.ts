import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type { BankCredentials, BankEnvironment } from './bank-connection';
import type { InvoiceDraft } from '../shared/tax-invoices';
const ns='http://ws.baroservice.com/';
export class TaxRemoteError extends Error { constructor(public code:string){super(`바로빌 오류 ${code}. 인증서·회원 정보와 신청 상태를 확인해 주세요.`);} }
export async function taxCall(env:BankEnvironment,c:BankCredentials,method:string,params:Record<string,unknown>={}) {
 const xml=new XMLBuilder({ignoreAttributes:false}).build({'soap:Envelope':{'@_xmlns:soap':'http://schemas.xmlsoap.org/soap/envelope/','soap:Body':{[method]:{'@_xmlns':ns,CERTKEY:c.key,CorpNum:c.corp,...params}}}});
 let response:Response;
 try {response=await fetch(`https://${env==='test'?'testws':'ws'}.baroservice.com/TI.asmx`,{method:'POST',headers:{'Content-Type':'text/xml; charset=utf-8',SOAPAction:`"${ns}${method}"`},body:xml,signal:AbortSignal.timeout(25000),redirect:'error'});}catch{throw new Error('바로빌 응답을 확인하지 못했습니다.');}
 if(!response.ok)throw new Error('바로빌 응답을 확인하지 못했습니다.');
 const data=await response.text();if(data.length>8000000)throw new Error('조회 결과가 너무 큽니다. 기간을 줄여 주세요.');
 const parsed=new XMLParser({removeNSPrefix:true,parseTagValue:false}).parse(data);
 const result=parsed?.Envelope?.Body?.[`${method}Response`]?.[`${method}Result`];
 if(result===undefined)throw new Error('바로빌 응답 형식을 확인하지 못했습니다.');
 if(typeof result!=='object'&&/^-\d+$/.test(String(result)))throw new TaxRemoteError(String(result));
 return result;
}
export function soapInvoice(d:InvoiceDraft,c:BankCredentials,mgt:string){
 const party=(p:InvoiceDraft['supplier'],sender:boolean)=>({ContactID:sender?c.id:'',CorpNum:p.corpNum,MgtNum:sender?mgt:'',CorpName:p.name,TaxRegID:'',CEOName:p.ceo,Addr:p.address,BizClass:p.bizClass,BizType:p.bizType,ContactName:p.contact,TEL:'',HP:'',Email:p.email});
 return {InvoicerParty:party(d.supplier,true),InvoiceeParty:party(d.buyer,false),IssueDirection:1,TaxInvoiceType:1,TaxType:1,TaxCalcType:0,PurposeType:Number(d.purpose),ModifyCode:'',WriteDate:d.date.replaceAll('-',''),AmountTotal:String(d.amount),TaxTotal:String(d.tax),TotalAmount:String(d.amount+d.tax),Remark1:d.remark,TaxInvoiceTradeLineItems:{TaxInvoiceTradeLineItem:d.lines?d.lines.map(l=>({PurchaseExpiry:d.date.replaceAll('-',''),Name:l.name,ChargeableUnit:l.qty,UnitPrice:l.unitPrice,Amount:String(l.amount),Tax:String(l.tax),Description:l.description})):[{PurchaseExpiry:d.date.replaceAll('-',''),Name:d.item,Amount:String(d.amount),Tax:String(d.tax)}]}};
}
