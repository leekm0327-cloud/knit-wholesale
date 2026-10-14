import type Database from 'better-sqlite3';
import type {ReviewAlert} from '../shared/review-alerts';
export type ReviewSignal={id:number;createdAt:string};
/** Store only review identifiers/dates. Never review bodies, authors or replies. */
export function createReviewAlerts(db:Database.Database,key:string,read:()=>Promise<ReviewSignal[]>,now=Date.now){
 db.exec(`CREATE TABLE IF NOT EXISTS review_alert_sources(source TEXT PRIMARY KEY,initialized_at TEXT NOT NULL,checked_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS review_alert_items(seq INTEGER PRIMARY KEY AUTOINCREMENT,source TEXT NOT NULL,article_id INTEGER NOT NULL,created_at TEXT NOT NULL,unread INTEGER NOT NULL,UNIQUE(source,article_id));`);
 let running:Promise<ReviewAlert>|null=null,lastSuccess=0;
 function status():ReviewAlert{
  const source=db.prepare('SELECT * FROM review_alert_sources WHERE source=?').get(key) as any;
  const counts=db.prepare('SELECT COUNT(CASE WHEN unread=1 THEN 1 END) AS unread,COALESCE(MAX(seq),0) AS through,MAX(created_at) AS latestAt FROM review_alert_items WHERE source=?').get(key) as any;
  return {state:'ready',unread:counts.unread,through:counts.through,checkedAt:source?.checked_at||null,initializedAt:source?.initialized_at||null,latestAt:counts.latestAt||null,message:'처음 연결한 뒤 도착한 새 리뷰를 표시합니다.'};
 }
 async function refresh(){
  if(running)return running;
  if(lastSuccess&&now()-lastSuccess<60000)return status();
  running=(async()=>{
   // A failed or incomplete read must not establish a baseline or clear alerts.
   const reviews=await read(),stamp=new Date(now()).toISOString();
   db.transaction(()=>{
    const initialized=!!db.prepare('SELECT source FROM review_alert_sources WHERE source=?').get(key);
    const add=db.prepare('INSERT OR IGNORE INTO review_alert_items(source,article_id,created_at,unread) VALUES(?,?,?,?)');
    for(const r of reviews)add.run(key,r.id,r.createdAt,initialized?1:0);
    db.prepare('INSERT INTO review_alert_sources VALUES(?,?,?) ON CONFLICT(source) DO UPDATE SET checked_at=excluded.checked_at').run(key,stamp,stamp);
   })();
   lastSuccess=now();return status();
  })().finally(()=>{running=null;});return running;
 }
 function acknowledge(through:number){
  const current=status();
  if(!Number.isSafeInteger(through)||through<0||through>current.through)throw Error('invalid acknowledgement');
  db.prepare('UPDATE review_alert_items SET unread=0 WHERE source=? AND seq<=?').run(key,through);
  return status();
 }
 return {refresh,acknowledge,status};
}
