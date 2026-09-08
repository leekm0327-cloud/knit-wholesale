export type Manual = {id:number;title:string;category:string;body:string;published:number;version:number;updatedAt:number};
export type CalendarItem = {id:string;date:string;endDate:string;title:string;kind:string;detail:string;href?:string};
export type Sharing = {revenue:boolean;quantity:boolean;products:boolean;weekdays:boolean};
export type Performance = {from:string;to:string;coverage:{from:string;to:string}|null;days:number;sharing:Sharing;amount?:number;qty?:number;products?:{product:string;category:string;qty?:number;amount?:number}[];weekdays?:{weekday:number;days:number;qty?:number;amount?:number}[]};
