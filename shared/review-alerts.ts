export type ReviewAlert = {
 state:'ready'|'permission_required'|'unavailable';
 unread:number; through:number; checkedAt:string|null; initializedAt:string|null;
 latestAt:string|null; message:string;
};
