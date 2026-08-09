// 직원 내부 관리 시스템 — 저장소
// 테이블 생성(멱등) + CRUD. 기존 storage.ts 의 db 핸들을 그대로 사용합니다.
import { db, sqlite } from "./storage";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  staff,
  attendance,
  espressoLogs,
  dessertLogs,
  shifts,
  announcements,
  announcementReads,
  type Staff,
  type PublicStaff,
  type InsertStaff,
  type Attendance,
  type EspressoLog,
  type InsertEspressoLog,
  type DessertLog,
  type InsertDessertLog,
  type Shift,
  type InsertShift,
  type Announcement,
  type InsertAnnouncement,
  type StaffHome,
  type AttendanceSummaryRow,
} from "@shared/schema";

// ===== 테이블 자동 생성 (마이그레이션 대용) =====
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login_id TEXT NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    position TEXT NOT NULL DEFAULT '바리스타',
    staff_role TEXT NOT NULL DEFAULT 'staff',
    hourly_wage INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    memo TEXT NOT NULL DEFAULT '',
    last_login_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    work_date TEXT NOT NULL,
    clock_in_at INTEGER,
    clock_out_at INTEGER,
    break_minutes INTEGER NOT NULL DEFAULT 0,
    memo TEXT NOT NULL DEFAULT '',
    edited_by_admin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS espresso_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    staff_name TEXT NOT NULL DEFAULT '',
    log_date TEXT NOT NULL,
    bean_name TEXT NOT NULL DEFAULT '',
    machine TEXT NOT NULL DEFAULT '',
    grind_setting TEXT NOT NULL DEFAULT '',
    dose_g REAL NOT NULL DEFAULT 0,
    yield_g REAL NOT NULL DEFAULT 0,
    time_sec REAL NOT NULL DEFAULT 0,
    water_temp REAL NOT NULL DEFAULT 0,
    tds TEXT NOT NULL DEFAULT '',
    rating INTEGER NOT NULL DEFAULT 0,
    flavor_tags TEXT NOT NULL DEFAULT '[]',
    memo TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dessert_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    staff_name TEXT NOT NULL DEFAULT '',
    prod_date TEXT NOT NULL,
    item_name TEXT NOT NULL,
    qty INTEGER NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT '개',
    discard_qty INTEGER NOT NULL DEFAULT 0,
    expiry_date TEXT NOT NULL DEFAULT '',
    memo TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    work_date TEXT NOT NULL,
    start_time TEXT NOT NULL DEFAULT '09:00',
    end_time TEXT NOT NULL DEFAULT '18:00',
    position TEXT NOT NULL DEFAULT '',
    memo TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0,
    important INTEGER NOT NULL DEFAULT 0,
    author_name TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS announcement_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    announcement_id INTEGER NOT NULL,
    staff_id INTEGER NOT NULL,
    read_at INTEGER NOT NULL
  );
`);

for (const stmt of [
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_login_id ON staff(login_id);",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_staff_date ON attendance(staff_id, work_date);",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_ann_read ON announcement_reads(announcement_id, staff_id);",
  "CREATE INDEX IF NOT EXISTS idx_espresso_logs_date ON espresso_logs(log_date);",
  "CREATE INDEX IF NOT EXISTS idx_dessert_logs_date ON dessert_logs(prod_date);",
  "CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(work_date);",
]) {
  try {
    sqlite.exec(stmt);
  } catch (e: any) {
    console.warn("[staff migration]", e?.message);
  }
}

// ===== 날짜 유틸 (KST 기준) =====
const KST = 9 * 60 * 60 * 1000;

export function kstToday(): string {
  return new Date(Date.now() + KST).toISOString().slice(0, 10);
}

export function kstMonthStart(day = kstToday()): string {
  return day.slice(0, 7) + "-01";
}

/** 해당 날짜가 속한 주의 월요일 (YYYY-MM-DD) */
export function kstWeekStart(day = kstToday()): string {
  const d = new Date(day + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=일
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/**
 * 아이디 정규화. 한글 아이디를 허용하므로 유니코드 정규화(NFC)가 필요하다.
 * macOS에서 입력한 한글은 자모가 분리된 형태(NFD)로 들어올 수 있어, 같은 글자인데 다른 문자열이 된다.
 */
export function normalizeLoginId(v: string): string {
  return v.normalize("NFC").trim();
}

export function toPublicStaff(s: Staff): PublicStaff {
  const { password, ...rest } = s;
  return rest;
}

/** 근무 분 계산 — 퇴근 미기록이면 0 */
export function workedMinutes(a: Attendance): number {
  if (!a.clockInAt || !a.clockOutAt) return 0;
  const raw = Math.round((a.clockOutAt - a.clockInAt) / 60000) - (a.breakMinutes ?? 0);
  return raw > 0 ? raw : 0;
}

export class StaffStorage {
  // ===== 직원 계정 =====
  async listStaff(includeInactive = true): Promise<PublicStaff[]> {
    const rows = db.select().from(staff).orderBy(asc(staff.active), asc(staff.name)).all();
    const list = includeInactive ? rows : rows.filter((r) => r.active === 1);
    return list.map(toPublicStaff).sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
  }

  async getStaff(id: number): Promise<Staff | undefined> {
    return db.select().from(staff).where(eq(staff.id, id)).get();
  }

  async getStaffByLoginId(loginId: string): Promise<Staff | undefined> {
    return db.select().from(staff).where(eq(staff.loginId, normalizeLoginId(loginId))).get();
  }

  async createStaff(s: InsertStaff): Promise<PublicStaff> {
    const row = db
      .insert(staff)
      .values({
        loginId: normalizeLoginId(s.loginId),
        password: bcrypt.hashSync(s.password, 10),
        name: s.name.trim(),
        phone: s.phone ?? "",
        position: s.position ?? "바리스타",
        staffRole: s.staffRole ?? "staff",
        hourlyWage: s.hourlyWage ?? 0,
        active: 1,
        memo: s.memo ?? "",
        createdAt: Date.now(),
      })
      .returning()
      .get();
    return toPublicStaff(row);
  }

  async updateStaff(id: number, patch: Partial<Staff> & { password?: string }): Promise<PublicStaff | undefined> {
    const next: Record<string, any> = { ...patch };
    if (typeof next.password === "string" && next.password.length > 0) {
      next.password = bcrypt.hashSync(next.password, 10);
    } else {
      delete next.password;
    }
    if (Object.keys(next).length === 0) {
      const cur = await this.getStaff(id);
      return cur ? toPublicStaff(cur) : undefined;
    }
    const row = db.update(staff).set(next).where(eq(staff.id, id)).returning().get();
    return row ? toPublicStaff(row) : undefined;
  }

  async deleteStaff(id: number): Promise<void> {
    // 기록은 남기고 계정만 비활성화하는 것이 안전하지만, 명시적 삭제도 지원
    db.delete(staff).where(eq(staff.id, id)).run();
  }

  async verifyStaffLogin(loginId: string, password: string): Promise<Staff | null> {
    const s = await this.getStaffByLoginId(loginId);
    if (!s) return null;
    if (s.active !== 1) return null;
    if (!bcrypt.compareSync(password, s.password)) return null;
    db.update(staff).set({ lastLoginAt: Date.now() }).where(eq(staff.id, s.id)).run();
    return s;
  }

  // ===== 출퇴근 =====
  async getAttendance(staffId: number, workDate: string): Promise<Attendance | undefined> {
    return db
      .select()
      .from(attendance)
      .where(and(eq(attendance.staffId, staffId), eq(attendance.workDate, workDate)))
      .get();
  }

  async clockIn(staffId: number): Promise<Attendance> {
    const workDate = kstToday();
    const cur = await this.getAttendance(staffId, workDate);
    if (cur) {
      if (cur.clockInAt) return cur; // 이미 출근 기록 있음
      return db
        .update(attendance)
        .set({ clockInAt: Date.now() })
        .where(eq(attendance.id, cur.id))
        .returning()
        .get();
    }
    return db
      .insert(attendance)
      .values({
        staffId,
        workDate,
        clockInAt: Date.now(),
        clockOutAt: null,
        breakMinutes: 0,
        memo: "",
        editedByAdmin: 0,
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }

  async clockOut(staffId: number): Promise<Attendance | undefined> {
    const workDate = kstToday();
    const cur = await this.getAttendance(staffId, workDate);
    if (!cur) return undefined;
    return db
      .update(attendance)
      .set({ clockOutAt: Date.now() })
      .where(eq(attendance.id, cur.id))
      .returning()
      .get();
  }

  async listAttendance(from: string, to: string, staffId?: number): Promise<Attendance[]> {
    const rows = db
      .select()
      .from(attendance)
      .where(and(gte(attendance.workDate, from), lte(attendance.workDate, to)))
      .orderBy(desc(attendance.workDate))
      .all();
    return staffId ? rows.filter((r) => r.staffId === staffId) : rows;
  }

  /** 관리자 수정 / 수동 입력 */
  async upsertAttendance(p: {
    staffId: number;
    workDate: string;
    clockInAt?: number | null;
    clockOutAt?: number | null;
    breakMinutes?: number;
    memo?: string;
  }): Promise<Attendance> {
    const cur = await this.getAttendance(p.staffId, p.workDate);
    if (cur) {
      return db
        .update(attendance)
        .set({
          clockInAt: p.clockInAt === undefined ? cur.clockInAt : p.clockInAt,
          clockOutAt: p.clockOutAt === undefined ? cur.clockOutAt : p.clockOutAt,
          breakMinutes: p.breakMinutes ?? cur.breakMinutes,
          memo: p.memo ?? cur.memo,
          editedByAdmin: 1,
        })
        .where(eq(attendance.id, cur.id))
        .returning()
        .get();
    }
    return db
      .insert(attendance)
      .values({
        staffId: p.staffId,
        workDate: p.workDate,
        clockInAt: p.clockInAt ?? null,
        clockOutAt: p.clockOutAt ?? null,
        breakMinutes: p.breakMinutes ?? 0,
        memo: p.memo ?? "",
        editedByAdmin: 1,
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }

  async deleteAttendance(id: number): Promise<void> {
    db.delete(attendance).where(eq(attendance.id, id)).run();
  }

  async attendanceSummary(from: string, to: string): Promise<AttendanceSummaryRow[]> {
    const rows = await this.listAttendance(from, to);
    const people = db.select().from(staff).all();
    const byStaff = new Map<number, { days: number; minutes: number }>();
    for (const r of rows) {
      const m = workedMinutes(r);
      const cur = byStaff.get(r.staffId) ?? { days: 0, minutes: 0 };
      cur.days += 1;
      cur.minutes += m;
      byStaff.set(r.staffId, cur);
    }
    return people
      .map((p) => {
        const agg = byStaff.get(p.id) ?? { days: 0, minutes: 0 };
        return {
          staffId: p.id,
          name: p.name,
          position: p.position,
          days: agg.days,
          minutes: agg.minutes,
          hourlyWage: p.hourlyWage,
          estimatedPay: Math.round((agg.minutes / 60) * p.hourlyWage),
        };
      })
      .filter((r) => r.days > 0 || people.find((p) => p.id === r.staffId)?.active === 1)
      .sort((a, b) => b.minutes - a.minutes);
  }

  // ===== 에스프레소 레시피 기록 =====
  async listEspressoLogs(from: string, to: string, staffId?: number): Promise<EspressoLog[]> {
    const rows = db
      .select()
      .from(espressoLogs)
      .where(and(gte(espressoLogs.logDate, from), lte(espressoLogs.logDate, to)))
      .orderBy(desc(espressoLogs.logDate), desc(espressoLogs.id))
      .all();
    return staffId ? rows.filter((r) => r.staffId === staffId) : rows;
  }

  async createEspressoLog(staffId: number, staffName: string, p: InsertEspressoLog): Promise<EspressoLog> {
    return db
      .insert(espressoLogs)
      .values({
        staffId,
        staffName,
        logDate: p.logDate && p.logDate.length > 0 ? p.logDate : kstToday(),
        beanName: p.beanName,
        machine: p.machine ?? "",
        grindSetting: p.grindSetting ?? "",
        doseG: p.doseG ?? 0,
        yieldG: p.yieldG ?? 0,
        timeSec: p.timeSec ?? 0,
        waterTemp: p.waterTemp ?? 0,
        tds: p.tds ?? "",
        rating: p.rating ?? 0,
        flavorTags: JSON.stringify(p.flavorTags ?? []),
        memo: p.memo ?? "",
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }

  async deleteEspressoLog(id: number): Promise<void> {
    db.delete(espressoLogs).where(eq(espressoLogs.id, id)).run();
  }

  /** 최근에 쓴 원두 이름 (입력 편의용 자동완성) */
  async recentBeanNames(limit = 12): Promise<string[]> {
    const rows = db
      .select()
      .from(espressoLogs)
      .orderBy(desc(espressoLogs.id))
      .limit(200)
      .all();
    const seen: string[] = [];
    for (const r of rows) {
      const n = (r.beanName ?? "").trim();
      if (n && !seen.includes(n)) seen.push(n);
      if (seen.length >= limit) break;
    }
    return seen;
  }

  // ===== 디저트 생산일지 =====
  async listDessertLogs(from: string, to: string, staffId?: number): Promise<DessertLog[]> {
    const rows = db
      .select()
      .from(dessertLogs)
      .where(and(gte(dessertLogs.prodDate, from), lte(dessertLogs.prodDate, to)))
      .orderBy(desc(dessertLogs.prodDate), desc(dessertLogs.id))
      .all();
    return staffId ? rows.filter((r) => r.staffId === staffId) : rows;
  }

  async createDessertLog(staffId: number, staffName: string, p: InsertDessertLog): Promise<DessertLog> {
    return db
      .insert(dessertLogs)
      .values({
        staffId,
        staffName,
        prodDate: p.prodDate && p.prodDate.length > 0 ? p.prodDate : kstToday(),
        itemName: p.itemName,
        qty: p.qty ?? 0,
        unit: p.unit ?? "개",
        discardQty: p.discardQty ?? 0,
        expiryDate: p.expiryDate ?? "",
        memo: p.memo ?? "",
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }

  async deleteDessertLog(id: number): Promise<void> {
    db.delete(dessertLogs).where(eq(dessertLogs.id, id)).run();
  }

  async recentDessertItems(limit = 15): Promise<string[]> {
    const rows = db.select().from(dessertLogs).orderBy(desc(dessertLogs.id)).limit(200).all();
    const seen: string[] = [];
    for (const r of rows) {
      const n = (r.itemName ?? "").trim();
      if (n && !seen.includes(n)) seen.push(n);
      if (seen.length >= limit) break;
    }
    return seen;
  }

  // ===== 스케줄 =====
  async listShifts(from: string, to: string, staffId?: number): Promise<Shift[]> {
    const rows = db
      .select()
      .from(shifts)
      .where(and(gte(shifts.workDate, from), lte(shifts.workDate, to)))
      .orderBy(asc(shifts.workDate), asc(shifts.startTime))
      .all();
    return staffId ? rows.filter((r) => r.staffId === staffId) : rows;
  }

  async createShift(p: InsertShift): Promise<Shift> {
    return db
      .insert(shifts)
      .values({
        staffId: p.staffId,
        workDate: p.workDate,
        startTime: p.startTime,
        endTime: p.endTime,
        position: p.position ?? "",
        memo: p.memo ?? "",
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }

  /** 근무표 칸 지정 — (날짜, 슬롯) 하나에 직원 한 명. 기존 배정은 교체된다. */
  async assignShift(p: { staffId: number; workDate: string; slot: string }): Promise<Shift> {
    db.delete(shifts)
      .where(and(eq(shifts.workDate, p.workDate), eq(shifts.position, p.slot)))
      .run();
    return db
      .insert(shifts)
      .values({
        staffId: p.staffId,
        workDate: p.workDate,
        startTime: "",
        endTime: "",
        position: p.slot,
        memo: "",
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }

  /** 근무표 칸 비우기 */
  async clearShift(workDate: string, slot: string): Promise<void> {
    db.delete(shifts).where(and(eq(shifts.workDate, workDate), eq(shifts.position, slot))).run();
  }

  async updateShift(id: number, patch: Partial<Shift>): Promise<Shift | undefined> {
    return db.update(shifts).set(patch).where(eq(shifts.id, id)).returning().get();
  }

  async deleteShift(id: number): Promise<void> {
    db.delete(shifts).where(eq(shifts.id, id)).run();
  }

  // ===== 공지사항 =====
  async listAnnouncements(): Promise<Announcement[]> {
    return db
      .select()
      .from(announcements)
      .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
      .all();
  }

  async getAnnouncement(id: number): Promise<Announcement | undefined> {
    return db.select().from(announcements).where(eq(announcements.id, id)).get();
  }

  async createAnnouncement(authorName: string, p: InsertAnnouncement): Promise<Announcement> {
    const now = Date.now();
    return db
      .insert(announcements)
      .values({
        title: p.title,
        body: p.body ?? "",
        pinned: p.pinned ?? 0,
        important: p.important ?? 0,
        authorName,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
  }

  async updateAnnouncement(id: number, patch: Partial<Announcement>): Promise<Announcement | undefined> {
    return db
      .update(announcements)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(announcements.id, id))
      .returning()
      .get();
  }

  async deleteAnnouncement(id: number): Promise<void> {
    db.delete(announcements).where(eq(announcements.id, id)).run();
    db.delete(announcementReads).where(eq(announcementReads.announcementId, id)).run();
  }

  async markAnnouncementRead(announcementId: number, staffId: number): Promise<void> {
    const cur = db
      .select()
      .from(announcementReads)
      .where(and(eq(announcementReads.announcementId, announcementId), eq(announcementReads.staffId, staffId)))
      .get();
    if (cur) return;
    db.insert(announcementReads)
      .values({ announcementId, staffId, readAt: Date.now() })
      .run();
  }

  async readAnnouncementIds(staffId: number): Promise<number[]> {
    return db
      .select()
      .from(announcementReads)
      .where(eq(announcementReads.staffId, staffId))
      .all()
      .map((r) => r.announcementId);
  }

  /** 공지별 읽음 인원 (관리자용) */
  async announcementReadCounts(): Promise<Record<number, number>> {
    const rows = db.select().from(announcementReads).all();
    const out: Record<number, number> = {};
    for (const r of rows) out[r.announcementId] = (out[r.announcementId] ?? 0) + 1;
    return out;
  }

  // ===== 직원 홈 요약 =====
  async staffHome(staffId: number): Promise<StaffHome | null> {
    const s = await this.getStaff(staffId);
    if (!s) return null;
    const today = kstToday();
    const att = (await this.getAttendance(staffId, today)) ?? null;
    const todayShifts = await this.listShifts(today, today, staffId);
    const anns = await this.listAnnouncements();
    const readIds = await this.readAnnouncementIds(staffId);
    const unread = anns.filter((a) => !readIds.includes(a.id)).length;

    const weekFrom = kstWeekStart(today);
    const monthFrom = kstMonthStart(today);
    const weekRows = await this.listAttendance(weekFrom, today, staffId);
    const monthRows = await this.listAttendance(monthFrom, today, staffId);

    return {
      staff: toPublicStaff(s),
      today,
      attendance: att,
      shift: todayShifts[0] ?? null,
      unreadAnnouncements: unread,
      latestAnnouncement: anns[0] ?? null,
      weekMinutes: weekRows.reduce((sum, r) => sum + workedMinutes(r), 0),
      monthMinutes: monthRows.reduce((sum, r) => sum + workedMinutes(r), 0),
    };
  }
}

export const staffStorage = new StaffStorage();
