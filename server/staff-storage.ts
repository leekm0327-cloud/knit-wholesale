// 직원 내부 관리 시스템 — 저장소
// 테이블 생성(멱등) + CRUD. 기존 storage.ts 의 db 핸들을 그대로 사용합니다.
import { db, sqlite } from "./storage";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { ESPRESSO_IMPORT_ROWS } from "./espresso-import";
import {
  staff,
  attendance,
  espressoLogs,
  dessertItems,
  dessertLogs,
  shifts,
  announcements,
  announcementReads,
  leaveGrants,
  leaveRequests,
  handovers,
  handoverReads,
  prepTasks,
  prepTaskPresets,
  supplyVendors,
  supplyOrders,
  staffEvents,
  type Handover,
  type HandoverRow,
  type HandoverDay,
  type PrepTask,
  type PrepTaskPreset,
  type SupplyVendor,
  type SupplyOrder,
  type SupplyOrderSummary,
  type StaffEvent,
  type StaffCalendar,
  type Staff,
  type PublicStaff,
  type InsertStaff,
  type Attendance,
  type EspressoLog,
  type InsertEspressoLog,
  type DessertItem,
  type InsertDessertItem,
  type DessertLog,
  type Shift,
  type InsertShift,
  type Announcement,
  type InsertAnnouncement,
  type StaffHome,
  type AttendanceSummaryRow,
  type LeaveGrant,
  type LeaveRequest,
  type LeaveBalance,
  LEAVE_START_DATE,
  annualLeaveDays,
  OWNER_STAFF_LOGIN_ID,
  OWNER_STAFF_NAME,
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
    hourly_wage INTEGER NOT NULL DEFAULT 0, -- (미사용) 이전 버전 잔여 컬럼
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
    produced_by_name TEXT NOT NULL DEFAULT '',
    produced_at INTEGER,
    discarded_by_name TEXT NOT NULL DEFAULT '',
    discarded_at INTEGER,
    expiry_date TEXT NOT NULL DEFAULT '',
    memo TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dessert_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT '개',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
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

  CREATE TABLE IF NOT EXISTS leave_grants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'manual',
    days REAL NOT NULL DEFAULT 0,
    grant_date TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    memo TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    staff_name TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    days REAL NOT NULL DEFAULT 0,
    half_day INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    decided_by_name TEXT NOT NULL DEFAULT '',
    decided_at INTEGER,
    admin_memo TEXT NOT NULL DEFAULT '',
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

  CREATE TABLE IF NOT EXISTS handovers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_date TEXT NOT NULL,
    staff_id INTEGER NOT NULL,
    staff_name TEXT NOT NULL,
    body TEXT NOT NULL,
    important INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS handover_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    handover_id INTEGER NOT NULL,
    staff_id INTEGER NOT NULL,
    staff_name TEXT NOT NULL,
    read_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS staff_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'order',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    memo TEXT NOT NULL DEFAULT '',
    created_by_staff_id INTEGER NOT NULL DEFAULT 0,
    created_by_name TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS supply_vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    memo TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS supply_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_date TEXT NOT NULL,
    vendor TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    staff_id INTEGER NOT NULL,
    staff_name TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prep_task_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    memo TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prep_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_date TEXT NOT NULL,
    title TEXT NOT NULL,
    memo TEXT NOT NULL DEFAULT '',
    created_by_staff_id INTEGER NOT NULL DEFAULT 0,
    created_by_name TEXT NOT NULL DEFAULT '',
    done INTEGER NOT NULL DEFAULT 0,
    done_by_staff_id INTEGER NOT NULL DEFAULT 0,
    done_by_name TEXT NOT NULL DEFAULT '',
    done_at INTEGER,
    created_at INTEGER NOT NULL
  );
`);

// 기존 DB에 컬럼 추가 (멱등)
for (const [table, col] of [
  ["dessert_logs", "item_id INTEGER NOT NULL DEFAULT 0"],
  ["dessert_logs", "produced_by_name TEXT NOT NULL DEFAULT ''"],
  ["dessert_logs", "produced_at INTEGER"],
  ["dessert_logs", "discarded_by_name TEXT NOT NULL DEFAULT ''"],
  ["dessert_logs", "discarded_at INTEGER"],
  ["staff", "hire_date TEXT NOT NULL DEFAULT ''"],
  ["staff", "leave_enabled INTEGER NOT NULL DEFAULT 0"],
  ["espresso_logs", "room_temp REAL NOT NULL DEFAULT 0"],
  ["espresso_logs", "room_humidity REAL NOT NULL DEFAULT 0"],
  ["espresso_logs", "grinder_temp REAL NOT NULL DEFAULT 0"],
  ["espresso_logs", "roast_days REAL NOT NULL DEFAULT 0"],
  ["espresso_logs", "source TEXT NOT NULL DEFAULT 'staff'"],
]) {
  try {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${col};`);
  } catch (e: any) {
    if (!/duplicate column/i.test(String(e?.message ?? ""))) {
      console.warn(`[staff migration ${table}]`, e?.message);
    }
  }
}

for (const stmt of [
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_login_id ON staff(login_id);",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_staff_date ON attendance(staff_id, work_date);",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_ann_read ON announcement_reads(announcement_id, staff_id);",
  "CREATE INDEX IF NOT EXISTS idx_espresso_logs_date ON espresso_logs(log_date);",
  "CREATE INDEX IF NOT EXISTS idx_dessert_logs_date ON dessert_logs(prod_date);",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_dessert_logs_day_item ON dessert_logs(prod_date, item_id);",
  "CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(work_date);",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_grant_auto ON leave_grants(staff_id, kind, grant_date);",
  "CREATE INDEX IF NOT EXISTS idx_leave_req_staff ON leave_requests(staff_id, start_date);",
  "CREATE INDEX IF NOT EXISTS idx_handover_date ON handovers(work_date);",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_handover_read ON handover_reads(handover_id, staff_id);",
  "CREATE INDEX IF NOT EXISTS idx_prep_task_date ON prep_tasks(work_date);",
  "CREATE INDEX IF NOT EXISTS idx_supply_order_date ON supply_orders(order_date);",
  "CREATE INDEX IF NOT EXISTS idx_staff_event_date ON staff_events(start_date);",
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

/** YYYY-MM-DD 에 일수를 더한 날짜 */
export function addDays(day: string, n: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD 에 개월 수를 더한다. 말일 보정(1/31 + 1개월 = 2/28) 포함 */
export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, last);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

export function addYears(day: string, n: number): string {
  return addMonths(day, n * 12);
}

/** 두 날짜 사이의 일수 (양끝 포함) */
export function dateSpanDays(from: string, to: string): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
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
        active: 1,
        memo: s.memo ?? "",
        hireDate: s.hireDate ?? "",
        leaveEnabled: s.leaveEnabled ?? 0,
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
        roomTemp: p.roomTemp ?? 0,
        roomHumidity: p.roomHumidity ?? 0,
        grinderTemp: p.grinderTemp ?? 0,
        roastDays: p.roastDays ?? 0,
        source: "staff",
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

  /**
   * 하루치 생산일지 저장.
   * 생산은 Baker, 폐기는 Close 담당자가 각각 입력하므로 kind에 해당하는 쪽만 건드린다.
   */
  async saveDessertLogs(
    staffId: number,
    staffName: string,
    prodDate: string,
    kind: "produce" | "discard",
    rows: { itemId: number; value: number }[],
  ): Promise<DessertLog[]> {
    const items = await this.listDessertItems(true);
    const byId = new Map(items.map((i) => [i.id, i]));
    const now = Date.now();

    for (const r of rows) {
      const item = byId.get(r.itemId);
      if (!item) continue;
      const cur = db
        .select()
        .from(dessertLogs)
        .where(and(eq(dessertLogs.prodDate, prodDate), eq(dessertLogs.itemId, r.itemId)))
        .get();

      const nextQty = kind === "produce" ? r.value : (cur?.qty ?? 0);
      const nextDiscard = kind === "discard" ? r.value : (cur?.discardQty ?? 0);

      // 양쪽 다 0이 되면 줄 자체를 지운다
      if (nextQty === 0 && nextDiscard === 0) {
        if (cur) db.delete(dessertLogs).where(eq(dessertLogs.id, cur.id)).run();
        continue;
      }

      const sideFields =
        kind === "produce"
          ? { producedByName: staffName, producedAt: now }
          : { discardedByName: staffName, discardedAt: now };

      if (cur) {
        db.update(dessertLogs)
          .set({
            qty: nextQty,
            discardQty: nextDiscard,
            itemName: item.name,
            unit: item.unit,
            staffId,
            staffName,
            ...sideFields,
          })
          .where(eq(dessertLogs.id, cur.id))
          .run();
      } else {
        db.insert(dessertLogs)
          .values({
            itemId: r.itemId,
            staffId,
            staffName,
            prodDate,
            itemName: item.name,
            qty: nextQty,
            unit: item.unit,
            discardQty: nextDiscard,
            producedByName: "",
            producedAt: null,
            discardedByName: "",
            discardedAt: null,
            expiryDate: "",
            memo: "",
            createdAt: now,
            ...sideFields,
          })
          .run();
      }
    }
    return this.listDessertLogs(prodDate, prodDate);
  }

  // ===== 디저트 품목 (관리자) =====
  async listDessertItems(includeInactive = false): Promise<DessertItem[]> {
    const rows = db
      .select()
      .from(dessertItems)
      .orderBy(asc(dessertItems.sortOrder), asc(dessertItems.id))
      .all();
    return includeInactive ? rows : rows.filter((r) => r.active === 1);
  }

  async createDessertItem(p: InsertDessertItem): Promise<DessertItem> {
    const rows = await this.listDessertItems(true);
    return db
      .insert(dessertItems)
      .values({
        name: p.name,
        unit: p.unit && p.unit.length > 0 ? p.unit : "개",
        sortOrder: rows.length,
        active: 1,
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }

  async updateDessertItem(id: number, patch: Partial<DessertItem>): Promise<DessertItem | undefined> {
    return db.update(dessertItems).set(patch).where(eq(dessertItems.id, id)).returning().get();
  }

  async deleteDessertItem(id: number): Promise<void> {
    // 기록은 남기고 목록에서만 감춘다 (지난 생산일지가 사라지면 안 되므로)
    db.update(dessertItems).set({ active: 0 }).where(eq(dessertItems.id, id)).run();
  }

  async reorderDessertItems(orderedIds: number[]): Promise<void> {
    orderedIds.forEach((id, i) =>
      db.update(dessertItems).set({ sortOrder: i }).where(eq(dessertItems.id, id)).run(),
    );
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


  // ============================================================
  // 연차(유급휴가)
  // ============================================================

  /**
   * 입사일 기준 자동 부여를 현재 시점까지 채워 넣는다. (멱등 — 같은 발생일은 한 번만)
   * - 1년 미만: 입사 응당일마다 1일 (최대 11회)
   * - 1년 이상: 입사 응당일마다 15일 + 가산
   * - LEAVE_START_DATE 이전 발생분은 건너뛴다
   */
  async syncLeaveGrants(): Promise<void> {
    const today = kstToday();
    const people = db.select().from(staff).all().filter((s) => s.leaveEnabled === 1 && s.hireDate);

    for (const p of people) {
      const hire = p.hireDate;
      const rows: { kind: string; days: number; grantDate: string }[] = [];

      // 월 단위 (입사 1개월 후부터 11회)
      for (let m = 1; m <= 11; m++) {
        const d = addMonths(hire, m);
        if (d > today) break;
        if (d < LEAVE_START_DATE) continue;
        rows.push({ kind: "monthly", days: 1, grantDate: d });
      }
      // 연 단위 (입사 1년 후부터)
      for (let y = 1; y <= 30; y++) {
        const d = addYears(hire, y);
        if (d > today) break;
        if (d < LEAVE_START_DATE) continue;
        rows.push({ kind: "annual", days: annualLeaveDays(y), grantDate: d });
      }

      for (const r of rows) {
        const dup = db
          .select()
          .from(leaveGrants)
          .where(
            and(
              eq(leaveGrants.staffId, p.id),
              eq(leaveGrants.kind, r.kind),
              eq(leaveGrants.grantDate, r.grantDate),
            ),
          )
          .get();
        if (dup) continue;
        db.insert(leaveGrants)
          .values({
            staffId: p.id,
            kind: r.kind,
            days: r.days,
            grantDate: r.grantDate,
            expiresAt: addYears(r.grantDate, 1),
            memo: "",
            createdAt: Date.now(),
          })
          .run();
      }
    }
  }

  async listLeaveGrants(staffId?: number): Promise<LeaveGrant[]> {
    const rows = db.select().from(leaveGrants).orderBy(desc(leaveGrants.grantDate)).all();
    return staffId ? rows.filter((r) => r.staffId === staffId) : rows;
  }

  async createLeaveGrant(p: { staffId: number; days: number; grantDate: string; memo?: string }): Promise<LeaveGrant> {
    return db
      .insert(leaveGrants)
      .values({
        staffId: p.staffId,
        kind: "manual",
        days: p.days,
        grantDate: p.grantDate,
        expiresAt: addYears(p.grantDate, 1),
        memo: p.memo ?? "",
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }

  async deleteLeaveGrant(id: number): Promise<void> {
    db.delete(leaveGrants).where(eq(leaveGrants.id, id)).run();
  }

  async listLeaveRequests(staffId?: number, status?: string): Promise<LeaveRequest[]> {
    let rows = db.select().from(leaveRequests).orderBy(desc(leaveRequests.startDate)).all();
    if (staffId) rows = rows.filter((r) => r.staffId === staffId);
    if (status) rows = rows.filter((r) => r.status === status);
    return rows;
  }

  async getLeaveRequest(id: number): Promise<LeaveRequest | undefined> {
    return db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).get();
  }

  async createLeaveRequest(p: {
    staffId: number;
    staffName: string;
    startDate: string;
    endDate: string;
    halfDay: boolean;
    reason: string;
  }): Promise<LeaveRequest> {
    const days = p.halfDay ? 0.5 : dateSpanDays(p.startDate, p.endDate);
    return db
      .insert(leaveRequests)
      .values({
        staffId: p.staffId,
        staffName: p.staffName,
        startDate: p.startDate,
        endDate: p.endDate,
        days,
        halfDay: p.halfDay ? 1 : 0,
        reason: p.reason,
        status: "pending",
        decidedByName: "",
        decidedAt: null,
        adminMemo: "",
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }

  async decideLeaveRequest(
    id: number,
    status: "approved" | "rejected",
    decidedByName: string,
    adminMemo: string,
  ): Promise<LeaveRequest | undefined> {
    return db
      .update(leaveRequests)
      .set({ status, decidedByName, decidedAt: Date.now(), adminMemo })
      .where(eq(leaveRequests.id, id))
      .returning()
      .get();
  }

  async deleteLeaveRequest(id: number): Promise<void> {
    db.delete(leaveRequests).where(eq(leaveRequests.id, id)).run();
  }

  /**
   * 잔여 연차 계산 — 오래된 부여분부터 차감(FIFO)하고, 소멸일이 지난 부여분은 제외한다.
   */
  async leaveBalance(staffId: number): Promise<LeaveBalance | null> {
    const p = await this.getStaff(staffId);
    if (!p) return null;
    const today = kstToday();

    const grants = (await this.listLeaveGrants(staffId))
      .slice()
      .sort((a, b) => a.grantDate.localeCompare(b.grantDate))
      .map((g) => ({ ...g, left: g.days }));

    const approved = (await this.listLeaveRequests(staffId, "approved"))
      .slice()
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    let used = 0;
    for (const r of approved) {
      used += r.days;
      let need = r.days;
      for (const g of grants) {
        if (need <= 0) break;
        if (g.left <= 0) continue;
        // 사용 시점에 살아있던 부여분에서만 차감
        if (g.grantDate > r.startDate || g.expiresAt < r.startDate) continue;
        const take = Math.min(need, g.left);
        g.left -= take;
        need -= take;
      }
    }

    const alive = grants.filter((g) => g.grantDate <= today && g.expiresAt >= today && g.left > 0);
    const remaining = alive.reduce((sum, g) => sum + g.left, 0);

    const soonLimit = addDays(today, 60);
    const soon = alive.filter((g) => g.expiresAt <= soonLimit);
    const expiringSoon = soon.reduce((sum, g) => sum + g.left, 0);
    const expiringDate = soon.length > 0 ? soon[0].expiresAt : "";

    const pending = (await this.listLeaveRequests(staffId, "pending")).reduce((sum, r) => sum + r.days, 0);
    const granted = grants
      .filter((g) => g.grantDate <= today && g.expiresAt >= today)
      .reduce((sum, g) => sum + g.days, 0);

    return {
      staffId,
      name: p.name,
      hireDate: p.hireDate,
      granted,
      used,
      pending,
      remaining,
      expiringSoon,
      expiringDate,
    };
  }

  async allLeaveBalances(): Promise<LeaveBalance[]> {
    const people = db.select().from(staff).all().filter((s) => s.leaveEnabled === 1);
    const out: LeaveBalance[] = [];
    for (const p of people) {
      const b = await this.leaveBalance(p.id);
      if (b) out.push(b);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** 기간 안에 승인된 연차가 걸쳐 있는 직원 id 목록 (근무표 표시용) */
  async approvedLeaveDays(from: string, to: string): Promise<{ staffId: number; date: string; halfDay: boolean }[]> {
    const rows = await this.listLeaveRequests(undefined, "approved");
    const out: { staffId: number; date: string; halfDay: boolean }[] = [];
    for (const r of rows) {
      let d = r.startDate;
      let guard = 0;
      while (d <= r.endDate && guard++ < 400) {
        if (d >= from && d <= to) out.push({ staffId: r.staffId, date: d, halfDay: r.halfDay === 1 });
        d = addDays(d, 1);
      }
    }
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

    const bal = s.leaveEnabled === 1 ? await this.leaveBalance(staffId) : null;
    const tomorrow = addDays(today, 1);
    const tomorrowShifts = await this.listShifts(tomorrow, tomorrow, staffId);
    const weekShifts = await this.listShifts(weekFrom, addDays(weekFrom, 6), staffId);

    return {
      staff: toPublicStaff(s),
      today,
      attendance: att,
      shift: todayShifts[0] ?? null,
      tomorrow,
      tomorrowShift: tomorrowShifts[0] ?? null,
      weekFrom,
      weekShifts,
      unreadAnnouncements: unread,
      latestAnnouncement: anns[0] ?? null,
      weekMinutes: weekRows.reduce((sum, r) => sum + workedMinutes(r), 0),
      monthMinutes: monthRows.reduce((sum, r) => sum + workedMinutes(r), 0),
      leaveEnabled: s.leaveEnabled === 1,
      leaveRemaining: bal?.remaining ?? 0,
      leavePending: bal?.pending ?? 0,
      handoverCount: this.countHandovers(today),
      handoverUnread: this.countUnreadHandovers(today, staffId),
      handoverNew: this.unreadHandovers(today, staffId),
      prepTodo: this.countPrepTodo(today),
      prepTotal: this.countPrepTotal(today),
    };
  }

  // ============================================================
  // 인수인계
  // ============================================================

  private countHandovers(date: string): number {
    return db.select().from(handovers).where(eq(handovers.workDate, date)).all().length;
  }

  /** 내가 아직 확인하지 않은, 남이 쓴 인수인계 수 */
  private countUnreadHandovers(date: string, staffId: number): number {
    const rows = db.select().from(handovers).where(eq(handovers.workDate, date)).all();
    if (rows.length === 0) return 0;
    const mine = new Set(
      db.select().from(handoverReads).where(eq(handoverReads.staffId, staffId)).all().map((r) => r.handoverId),
    );
    return rows.filter((r) => r.staffId !== staffId && !mine.has(r.id)).length;
  }

  /** 확인하지 않은 인수인계 본문 (홈 상단 강조용) */
  private unreadHandovers(date: string, staffId: number) {
    const rows = db
      .select()
      .from(handovers)
      .where(eq(handovers.workDate, date))
      .orderBy(desc(handovers.important), asc(handovers.createdAt))
      .all();
    if (rows.length === 0) return [];
    const mine = new Set(
      db.select().from(handoverReads).where(eq(handoverReads.staffId, staffId)).all().map((r) => r.handoverId),
    );
    return rows
      .filter((r) => r.staffId !== staffId && !mine.has(r.id))
      .slice(0, 3)
      .map((r) => ({
        id: r.id,
        staffName: r.staffName,
        body: r.body,
        important: r.important,
        createdAt: r.createdAt,
      }));
  }

  async handoverDay(date: string, staffId: number): Promise<HandoverDay> {
    const rows = db
      .select()
      .from(handovers)
      .where(eq(handovers.workDate, date))
      .orderBy(desc(handovers.important), asc(handovers.createdAt))
      .all();

    const ids = new Set(rows.map((r) => r.id));
    const reads = ids.size
      ? db.select().from(handoverReads).all().filter((r) => ids.has(r.handoverId))
      : [];

    const staffCount = db.select().from(staff).all().filter((s) => s.active === 1).length;

    return {
      date,
      staffCount,
      rows: rows.map((r) => {
        const readers = reads
          .filter((x) => x.handoverId === r.id)
          .map((x) => ({ staffId: x.staffId, staffName: x.staffName, readAt: x.readAt }))
          .sort((a, b) => a.readAt - b.readAt);
        return {
          ...r,
          readers,
          readByMe: readers.some((x) => x.staffId === staffId),
          mine: r.staffId === staffId,
        } satisfies HandoverRow;
      }),
    };
  }

  async createHandover(input: {
    workDate: string;
    staffId: number;
    staffName: string;
    body: string;
    important: boolean;
  }): Promise<Handover> {
    const now = Date.now();
    const [row] = db
      .insert(handovers)
      .values({
        workDate: input.workDate,
        staffId: input.staffId,
        staffName: input.staffName,
        body: input.body,
        important: input.important ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all();
    return row;
  }

  async updateHandover(id: number, body: string, important: boolean): Promise<void> {
    db.update(handovers)
      .set({ body, important: important ? 1 : 0, updatedAt: Date.now() })
      .where(eq(handovers.id, id))
      .run();
  }

  async getHandover(id: number): Promise<Handover | null> {
    return db.select().from(handovers).where(eq(handovers.id, id)).all()[0] ?? null;
  }

  async deleteHandover(id: number): Promise<void> {
    db.delete(handoverReads).where(eq(handoverReads.handoverId, id)).run();
    db.delete(handovers).where(eq(handovers.id, id)).run();
  }

  /** 확인 표시. 이미 확인했으면 아무 일도 하지 않는다. */
  async readHandover(id: number, staffId: number, staffName: string): Promise<void> {
    const already = db
      .select()
      .from(handoverReads)
      .where(and(eq(handoverReads.handoverId, id), eq(handoverReads.staffId, staffId)))
      .all();
    if (already.length > 0) return;
    db.insert(handoverReads)
      .values({ handoverId: id, staffId, staffName, readAt: Date.now() })
      .run();
  }

  /** 관리자용 — 기간 조회 */
  async listHandovers(from: string, to: string): Promise<HandoverRow[]> {
    const rows = db
      .select()
      .from(handovers)
      .where(and(gte(handovers.workDate, from), lte(handovers.workDate, to)))
      .orderBy(desc(handovers.workDate), asc(handovers.createdAt))
      .all();
    const ids = new Set(rows.map((r) => r.id));
    const reads = ids.size ? db.select().from(handoverReads).all().filter((r) => ids.has(r.handoverId)) : [];
    return rows.map((r) => ({
      ...r,
      readers: reads
        .filter((x) => x.handoverId === r.id)
        .map((x) => ({ staffId: x.staffId, staffName: x.staffName, readAt: x.readAt }))
        .sort((a, b) => a.readAt - b.readAt),
      readByMe: false,
      mine: false,
    }));
  }

  // ============================================================
  // 준비 작업 (간헐적 베이킹 등)
  // ============================================================

  private countPrepTotal(date: string): number {
    return db.select().from(prepTasks).where(eq(prepTasks.workDate, date)).all().length;
  }

  private countPrepTodo(date: string): number {
    return db
      .select()
      .from(prepTasks)
      .where(eq(prepTasks.workDate, date))
      .all()
      .filter((t) => t.done !== 1).length;
  }

  async prepTasksOn(date: string): Promise<PrepTask[]> {
    return db
      .select()
      .from(prepTasks)
      .where(eq(prepTasks.workDate, date))
      .orderBy(asc(prepTasks.done), asc(prepTasks.createdAt))
      .all();
  }

  async listPrepTasks(from: string, to: string): Promise<PrepTask[]> {
    return db
      .select()
      .from(prepTasks)
      .where(and(gte(prepTasks.workDate, from), lte(prepTasks.workDate, to)))
      .orderBy(asc(prepTasks.workDate), asc(prepTasks.createdAt))
      .all();
  }

  async createPrepTask(input: {
    workDate: string;
    title: string;
    memo: string;
    staffId: number;
    staffName: string;
  }): Promise<PrepTask> {
    const [row] = db
      .insert(prepTasks)
      .values({
        workDate: input.workDate,
        title: input.title,
        memo: input.memo,
        createdByStaffId: input.staffId,
        createdByName: input.staffName,
        done: 0,
        createdAt: Date.now(),
      })
      .returning()
      .all();
    return row;
  }

  async getPrepTask(id: number): Promise<PrepTask | null> {
    return db.select().from(prepTasks).where(eq(prepTasks.id, id)).all()[0] ?? null;
  }

  /** 체크/해제. 해제하면 완료자 정보도 지운다. */
  async togglePrepTask(id: number, done: boolean, staffId: number, staffName: string): Promise<void> {
    db.update(prepTasks)
      .set(
        done
          ? { done: 1, doneByStaffId: staffId, doneByName: staffName, doneAt: Date.now() }
          : { done: 0, doneByStaffId: 0, doneByName: "", doneAt: null },
      )
      .where(eq(prepTasks.id, id))
      .run();
  }

  async deletePrepTask(id: number): Promise<void> {
    db.delete(prepTasks).where(eq(prepTasks.id, id)).run();
  }

  // ===== 준비 작업 프리셋 (자주 하는 일) =====

  async listPrepPresets(includeInactive = false): Promise<PrepTaskPreset[]> {
    const rows = db
      .select()
      .from(prepTaskPresets)
      .orderBy(asc(prepTaskPresets.sortOrder), asc(prepTaskPresets.id))
      .all();
    return includeInactive ? rows : rows.filter((r) => r.active === 1);
  }

  async createPrepPreset(input: { title: string; memo: string }): Promise<PrepTaskPreset> {
    const max = db
      .select()
      .from(prepTaskPresets)
      .all()
      .reduce((m, r) => Math.max(m, r.sortOrder), 0);
    const [row] = db
      .insert(prepTaskPresets)
      .values({
        title: input.title,
        memo: input.memo,
        sortOrder: max + 1,
        active: 1,
        createdAt: Date.now(),
      })
      .returning()
      .all();
    return row;
  }

  async updatePrepPreset(
    id: number,
    patch: Partial<{ title: string; memo: string; active: number; sortOrder: number }>,
  ): Promise<PrepTaskPreset | null> {
    if (Object.keys(patch).length === 0) return this.getPrepPreset(id);
    db.update(prepTaskPresets).set(patch).where(eq(prepTaskPresets.id, id)).run();
    return this.getPrepPreset(id);
  }

  async getPrepPreset(id: number): Promise<PrepTaskPreset | null> {
    return db.select().from(prepTaskPresets).where(eq(prepTaskPresets.id, id)).all()[0] ?? null;
  }

  async deletePrepPreset(id: number): Promise<void> {
    db.delete(prepTaskPresets).where(eq(prepTaskPresets.id, id)).run();
  }

  // ============================================================
  // 일정 (단체 주문 등)
  // ============================================================

  /** 기간에 걸쳐 있는 일정 — 시작일이 늦어도 기간이 겹치면 포함한다 */
  async listStaffEvents(from: string, to: string): Promise<StaffEvent[]> {
    return db
      .select()
      .from(staffEvents)
      .all()
      .filter((e) => e.startDate <= to && e.endDate >= from)
      .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.id - b.id));
  }

  async getStaffEvent(id: number): Promise<StaffEvent | null> {
    return db.select().from(staffEvents).where(eq(staffEvents.id, id)).all()[0] ?? null;
  }

  async createStaffEvent(input: {
    title: string;
    kind: string;
    startDate: string;
    endDate: string;
    memo: string;
    staffId: number;
    staffName: string;
  }): Promise<StaffEvent> {
    const now = Date.now();
    const [row] = db
      .insert(staffEvents)
      .values({
        title: input.title,
        kind: input.kind,
        startDate: input.startDate,
        endDate: input.endDate,
        memo: input.memo,
        createdByStaffId: input.staffId,
        createdByName: input.staffName,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all();
    return row;
  }

  async updateStaffEvent(
    id: number,
    patch: Partial<{ title: string; kind: string; startDate: string; endDate: string; memo: string }>,
  ): Promise<StaffEvent | null> {
    if (Object.keys(patch).length > 0) {
      db.update(staffEvents)
        .set({ ...patch, updatedAt: Date.now() })
        .where(eq(staffEvents.id, id))
        .run();
    }
    return this.getStaffEvent(id);
  }

  async deleteStaffEvent(id: number): Promise<void> {
    db.delete(staffEvents).where(eq(staffEvents.id, id)).run();
  }

  /** 홈 2주 달력 — 이번 주 월요일부터 14일치 */
  async staffCalendar(staffId: number): Promise<StaffCalendar> {
    const today = kstToday();
    const from = kstWeekStart(today);
    const to = addDays(from, 13);
    const shifts = (await this.listShifts(from, to)).filter((s) => s.staffId === staffId);
    return {
      from,
      to,
      today,
      events: await this.listStaffEvents(from, to),
      prepTasks: await this.listPrepTasks(from, to),
      shifts,
    };
  }

  // ============================================================
  // 발주 기록 (매장 소모품·식자재)
  // ============================================================

  async listSupplyVendors(includeInactive = false): Promise<SupplyVendor[]> {
    const rows = db
      .select()
      .from(supplyVendors)
      .orderBy(asc(supplyVendors.sortOrder), asc(supplyVendors.id))
      .all();
    return includeInactive ? rows : rows.filter((r) => r.active === 1);
  }

  async createSupplyVendor(input: { name: string; memo: string }): Promise<SupplyVendor> {
    const max = db
      .select()
      .from(supplyVendors)
      .all()
      .reduce((m, r) => Math.max(m, r.sortOrder), 0);
    const [row] = db
      .insert(supplyVendors)
      .values({ name: input.name, memo: input.memo, sortOrder: max + 1, active: 1, createdAt: Date.now() })
      .returning()
      .all();
    return row;
  }

  async getSupplyVendor(id: number): Promise<SupplyVendor | null> {
    return db.select().from(supplyVendors).where(eq(supplyVendors.id, id)).all()[0] ?? null;
  }

  async updateSupplyVendor(
    id: number,
    patch: Partial<{ name: string; memo: string; active: number; sortOrder: number }>,
  ): Promise<SupplyVendor | null> {
    if (Object.keys(patch).length > 0) {
      db.update(supplyVendors).set(patch).where(eq(supplyVendors.id, id)).run();
    }
    return this.getSupplyVendor(id);
  }

  async deleteSupplyVendor(id: number): Promise<void> {
    db.delete(supplyVendors).where(eq(supplyVendors.id, id)).run();
  }

  async moveSupplyVendor(id: number, dir: -1 | 1): Promise<void> {
    const rows = await this.listSupplyVendors(true);
    const i = rows.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const a = rows[i];
    const b = rows[j];
    db.update(supplyVendors).set({ sortOrder: b.sortOrder }).where(eq(supplyVendors.id, a.id)).run();
    db.update(supplyVendors).set({ sortOrder: a.sortOrder }).where(eq(supplyVendors.id, b.id)).run();
  }

  async listSupplyOrders(from: string, to: string, staffId?: number): Promise<SupplyOrder[]> {
    const rows = db
      .select()
      .from(supplyOrders)
      .where(and(gte(supplyOrders.orderDate, from), lte(supplyOrders.orderDate, to)))
      .orderBy(desc(supplyOrders.orderDate), desc(supplyOrders.createdAt))
      .all();
    return staffId ? rows.filter((r) => r.staffId === staffId) : rows;
  }

  async getSupplyOrder(id: number): Promise<SupplyOrder | null> {
    return db.select().from(supplyOrders).where(eq(supplyOrders.id, id)).all()[0] ?? null;
  }

  /** 같은 구입처의 가장 최근 기록 — '지난번과 같이' 불러오기에 쓴다 */
  async lastSupplyOrder(vendor: string): Promise<SupplyOrder | null> {
    return (
      db
        .select()
        .from(supplyOrders)
        .where(eq(supplyOrders.vendor, vendor))
        .orderBy(desc(supplyOrders.orderDate), desc(supplyOrders.createdAt))
        .all()[0] ?? null
    );
  }

  async createSupplyOrder(input: {
    orderDate: string;
    vendor: string;
    body: string;
    amount: number;
    staffId: number;
    staffName: string;
  }): Promise<SupplyOrder> {
    const now = Date.now();
    const [row] = db
      .insert(supplyOrders)
      .values({ ...input, createdAt: now, updatedAt: now })
      .returning()
      .all();
    return row;
  }

  async updateSupplyOrder(
    id: number,
    patch: Partial<{ orderDate: string; vendor: string; body: string; amount: number }>,
  ): Promise<SupplyOrder | null> {
    if (Object.keys(patch).length > 0) {
      db.update(supplyOrders)
        .set({ ...patch, updatedAt: Date.now() })
        .where(eq(supplyOrders.id, id))
        .run();
    }
    return this.getSupplyOrder(id);
  }

  async deleteSupplyOrder(id: number): Promise<void> {
    db.delete(supplyOrders).where(eq(supplyOrders.id, id)).run();
  }

  /** 구입처별·담당자별·월별 합계 */
  async supplyOrderSummary(from: string, to: string): Promise<SupplyOrderSummary> {
    const rows = await this.listSupplyOrders(from, to);
    const bump = (m: Map<string, { count: number; amount: number }>, key: string, amount: number) => {
      const cur = m.get(key) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += amount;
      m.set(key, cur);
    };
    const v = new Map<string, { count: number; amount: number }>();
    const s = new Map<string, { count: number; amount: number }>();
    const mo = new Map<string, { count: number; amount: number }>();
    let total = 0;
    for (const r of rows) {
      total += r.amount;
      bump(v, r.vendor || "미지정", r.amount);
      bump(s, r.staffName || "미상", r.amount);
      bump(mo, r.orderDate.slice(0, 7), r.amount);
    }
    const toArr = <K extends string>(m: Map<string, { count: number; amount: number }>, key: K) =>
      Array.from(m.entries()).map(([k, x]) => ({ [key]: k, count: x.count, amount: x.amount })) as any[];
    return {
      total,
      count: rows.length,
      byVendor: toArr(v, "vendor").sort((a, b) => b.amount - a.amount),
      byStaff: toArr(s, "staffName").sort((a, b) => b.amount - a.amount),
      byMonth: toArr(mo, "month").sort((a, b) => (a.month < b.month ? -1 : 1)),
    };
  }

  /** 위아래로 한 칸 이동 */
  async movePrepPreset(id: number, dir: -1 | 1): Promise<void> {
    const rows = await this.listPrepPresets(true);
    const i = rows.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const a = rows[i];
    const b = rows[j];
    db.update(prepTaskPresets).set({ sortOrder: b.sortOrder }).where(eq(prepTaskPresets.id, a.id)).run();
    db.update(prepTaskPresets).set({ sortOrder: a.sortOrder }).where(eq(prepTaskPresets.id, b.id)).run();
  }
}

export const staffStorage = new StaffStorage();

/**
 * 구글폼으로 받아 두었던 기존 추출 기록을 DB로 한 번만 옮긴다.
 * 이미 옮겨진 기록(source='import')이 있으면 아무 것도 하지 않는다.
 * 담당자 이름이 직원 계정과 같으면 그 계정에 붙이고, 없으면 이름만 남긴다.
 */
export function importEspressoHistory(): void {
  try {
    // 전체 행을 읽지 않고 개수만 센다 (시작이 느려지지 않도록)
    const already = (sqlite.prepare("SELECT COUNT(*) AS c FROM espresso_logs WHERE source = 'import'").get() as { c: number }).c > 0;
    if (already) return;
    if (ESPRESSO_IMPORT_ROWS.length === 0) return;

    const people = db.select().from(staff).all();
    const idByName = new Map(people.map((p) => [p.name, p.id]));

    for (const r of ESPRESSO_IMPORT_ROWS) {
      db.insert(espressoLogs)
        .values({
          staffId: idByName.get(r.staffName) ?? 0,
          staffName: r.staffName,
          logDate: r.logDate,
          beanName: r.beanName,
          machine: "",
          grindSetting: "",
          doseG: r.doseG,
          yieldG: r.yieldG,
          timeSec: r.timeSec,
          waterTemp: r.waterTemp,
          tds: "",
          rating: r.rating,
          flavorTags: "[]",
          memo: r.memo,
          roomTemp: r.roomTemp,
          roomHumidity: r.roomHumidity,
          grinderTemp: r.grinderTemp,
          roastDays: r.roastDays,
          source: "import",
          createdAt: r.createdAt,
        })
        .run();
    }
    console.log(`[seed] 기존 에스프레소 기록 ${ESPRESSO_IMPORT_ROWS.length}건 이관 완료`);
  } catch (e: any) {
    console.warn("[import espresso history]", e?.message);
  }
}

/**
 * 대표(이강민) 계정을 근무표에 항상 넣어두기 위한 시드.
 * 직원 계정을 따로 만들지 않아도 스케줄에 배정할 수 있게 한다.
 * 비밀번호는 임의값이라 그대로는 로그인할 수 없고, 필요하면 직원 계정 화면에서 새로 지정하면 된다.
 */
export function seedOwnerStaff(): void {
  try {
    const exists = db.select().from(staff).all().some((s) => s.staffRole === "owner");
    if (exists) return;
    db.insert(staff)
      .values({
        loginId: OWNER_STAFF_LOGIN_ID,
        password: bcrypt.hashSync(randomUUID(), 10),
        name: OWNER_STAFF_NAME,
        phone: "",
        position: "대표",
        staffRole: "owner",
        active: 1,
        memo: "근무표 배정용 계정 (자동 생성)",
        createdAt: Date.now(),
      })
      .run();
    console.log("[seed] 근무표용 대표 계정 생성 완료");
  } catch (e: any) {
    console.warn("[seed owner staff]", e?.message);
  }
}
