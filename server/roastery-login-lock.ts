import type Database from 'better-sqlite3';

const attemptsLimit = 5;
const windowMs = 15 * 60_000;

type LockRow = {failures:number;window_started:number;locked_until:number};

export function installRoasteryLoginLock(db:Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS roastery_login_failures(
    user_id INTEGER PRIMARY KEY, failures INTEGER NOT NULL,
    window_started INTEGER NOT NULL, locked_until INTEGER NOT NULL
  )`);
}

const rowFor=(db:Database.Database,userId:number)=>
  db.prepare('SELECT failures,window_started,locked_until FROM roastery_login_failures WHERE user_id=?').get(userId) as LockRow|undefined;

export function roasteryLoginWait(db:Database.Database,userId:number,now=Date.now()) {
  return Math.max(0,(rowFor(db,userId)?.locked_until??0)-now);
}

export function roasteryLoginFailed(db:Database.Database,userId:number,now=Date.now()) {
  return db.transaction(()=>{
    const old=rowFor(db,userId);
    if(old && old.locked_until>now) return old.locked_until-now;
    const recent=old && old.locked_until===0 && old.window_started+windowMs>now;
    const failures=recent?old.failures+1:1;
    const started=recent?old.window_started:now;
    const lockedUntil=failures>=attemptsLimit?now+windowMs:0;
    db.prepare(`INSERT INTO roastery_login_failures(user_id,failures,window_started,locked_until) VALUES(?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET failures=excluded.failures,window_started=excluded.window_started,locked_until=excluded.locked_until`)
      .run(userId,failures,started,lockedUntil);
    return lockedUntil?windowMs:0;
  }).immediate();
}

export function clearRoasteryLoginFailures(db:Database.Database,userId:number) {
  db.prepare('DELETE FROM roastery_login_failures WHERE user_id=?').run(userId);
}
