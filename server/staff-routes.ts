// 직원 내부 관리 시스템 — API
// 직원용 엔드포인트: /api/staff/*        (직원 세션 필요)
// 관리자용 엔드포인트: /api/admin/staff/* (관리자 세션 필요)
import type { Express, Request, Response, NextFunction } from "express";
import { staffStorage, seedOwnerStaff, importEspressoHistory, kstToday, kstMonthStart, toPublicStaff, workedMinutes, dateSpanDays } from "./staff-storage";
import type { IStorage } from "./storage";
import {
  staffLoginSchema,
  insertStaffSchema,
  updateStaffSchema,
  upsertAttendanceSchema,
  insertEspressoLogSchema,
  insertDessertItemSchema,
  updateDessertItemSchema,
  saveDessertLogsSchema,
  insertShiftSchema,
  assignShiftSchema,
  clearShiftSchema,
  insertAnnouncementSchema,
  createLeaveRequestSchema,
  decideLeaveRequestSchema,
  createLeaveGrantSchema,
  createHandoverSchema,
  createPrepTaskSchema,
  insertPrepPresetSchema,
  updatePrepPresetSchema,
} from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    staffId?: number;
  }
}

// ===== 미들웨어 =====
function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (!req.session.staffId) return res.status(401).json({ message: "직원 로그인이 필요합니다." });
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId || req.session.role !== "admin")
    return res.status(403).json({ message: "관리자 권한이 필요합니다." });
  next();
}

function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId || req.session.role !== "admin")
    return res.status(403).json({ message: "관리자 권한이 필요합니다." });
  if (req.session.adminRole !== "owner")
    return res.status(403).json({ message: "Owner 권한이 필요합니다." });
  next();
}

// 로그인 시도 제한 (메모리)
const loginFails = new Map<string, { n: number; until: number }>();
const LOGIN_MAX = 8;
const LOGIN_BLOCK_MS = 10 * 60 * 1000;

function loginBlockedFor(key: string): number {
  const rec = loginFails.get(key);
  if (!rec) return 0;
  if (rec.until > Date.now()) return Math.ceil((rec.until - Date.now()) / 60000);
  if (rec.until !== 0 && rec.until <= Date.now()) loginFails.delete(key);
  return 0;
}

function noteLoginFail(key: string) {
  const rec = loginFails.get(key) ?? { n: 0, until: 0 };
  rec.n += 1;
  if (rec.n >= LOGIN_MAX) {
    rec.until = Date.now() + LOGIN_BLOCK_MS;
    rec.n = 0;
  }
  loginFails.set(key, rec);
}

function badRequest(res: Response, err: any) {
  return res.status(400).json({ message: err?.errors?.[0]?.message ?? "입력값 오류" });
}

function rangeOf(req: Request): { from: string; to: string } {
  const today = kstToday();
  const from = typeof req.query.from === "string" && req.query.from ? req.query.from : kstMonthStart(today);
  const to = typeof req.query.to === "string" && req.query.to ? req.query.to : today;
  return { from, to };
}

export function registerStaffRoutes(app: Express, storage: IStorage) {
  seedOwnerStaff();
  importEspressoHistory();

  // ============================================================
  // 직원 인증
  // ============================================================
  app.post("/api/staff/login", async (req, res) => {
    const parsed = staffLoginSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);

    const ip = (req.ip || req.socket.remoteAddress || "unknown").toString();
    const key = `${ip}|${parsed.data.loginId}`;
    const blocked = loginBlockedFor(key);
    if (blocked > 0)
      return res.status(429).json({ message: `로그인 시도가 많습니다. ${blocked}분 후 다시 시도해 주세요.` });

    const s = await staffStorage.verifyStaffLogin(parsed.data.loginId, parsed.data.password);
    if (!s) {
      noteLoginFail(key);
      return res.status(401).json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." });
    }
    loginFails.delete(key);
    req.session.staffId = s.id;
    res.json(toPublicStaff(s));
  });

  app.post("/api/staff/logout", (req, res) => {
    req.session.staffId = undefined;
    res.json({ ok: true });
  });

  app.get("/api/staff/me", async (req, res) => {
    if (!req.session.staffId) return res.json(null);
    const s = await staffStorage.getStaff(req.session.staffId);
    if (!s || s.active !== 1) {
      req.session.staffId = undefined;
      return res.json(null);
    }
    res.json(toPublicStaff(s));
  });

  /** 본인이 바꿀 수 있는 항목 — 연락처만 */
  app.patch("/api/staff/me", requireStaff, async (req, res) => {
    const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : undefined;
    if (phone === undefined) return res.status(400).json({ message: "변경할 내용이 없습니다." });
    if (phone.length > 30) return res.status(400).json({ message: "연락처가 너무 깁니다." });
    const row = await staffStorage.updateStaff(req.session.staffId!, { phone });
    if (!row) return res.status(404).json({ message: "계정을 찾을 수 없습니다." });
    res.json(row);
  });

  app.patch("/api/staff/me/password", requireStaff, async (req, res) => {
    const cur = String(req.body?.currentPassword ?? "");
    const next = String(req.body?.newPassword ?? "");
    if (next.length < 6) return res.status(400).json({ message: "새 비밀번호는 6자 이상이어야 합니다." });
    const s = await staffStorage.getStaff(req.session.staffId!);
    if (!s) return res.status(404).json({ message: "계정을 찾을 수 없습니다." });
    const ok = await staffStorage.verifyStaffLogin(s.loginId, cur);
    if (!ok) return res.status(400).json({ message: "현재 비밀번호가 올바르지 않습니다." });
    await staffStorage.updateStaff(s.id, { password: next });
    res.json({ ok: true });
  });

  // ============================================================
  // 직원 홈 · 출퇴근
  // ============================================================
  app.get("/api/staff/home", requireStaff, async (req, res) => {
    const home = await staffStorage.staffHome(req.session.staffId!);
    if (!home) return res.status(404).json({ message: "계정을 찾을 수 없습니다." });
    res.json(home);
  });

  app.post("/api/staff/attendance/clock-in", requireStaff, async (req, res) => {
    const row = await staffStorage.clockIn(req.session.staffId!);
    res.json(row);
  });

  app.post("/api/staff/attendance/clock-out", requireStaff, async (req, res) => {
    const row = await staffStorage.clockOut(req.session.staffId!);
    if (!row) return res.status(400).json({ message: "오늘 출근 기록이 없습니다." });
    res.json(row);
  });

  app.get("/api/staff/attendance", requireStaff, async (req, res) => {
    const { from, to } = rangeOf(req);
    const rows = await staffStorage.listAttendance(from, to, req.session.staffId!);
    res.json(rows.map((r) => ({ ...r, minutes: workedMinutes(r) })));
  });

  // ============================================================
  // 직원 — 에스프레소 레시피 기록
  // ============================================================
  app.get("/api/staff/espresso-logs", requireStaff, async (req, res) => {
    const { from, to } = rangeOf(req);
    const mine = req.query.mine === "1";
    const rows = await staffStorage.listEspressoLogs(from, to, mine ? req.session.staffId! : undefined);
    res.json(rows);
  });

  app.get("/api/staff/espresso-logs/beans", requireStaff, async (_req, res) => {
    res.json(await staffStorage.recentBeanNames());
  });

  app.post("/api/staff/espresso-logs", requireStaff, async (req, res) => {
    const parsed = insertEspressoLogSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const s = await staffStorage.getStaff(req.session.staffId!);
    const row = await staffStorage.createEspressoLog(req.session.staffId!, s?.name ?? "", parsed.data);
    res.json(row);
  });

  app.delete("/api/staff/espresso-logs/:id", requireStaff, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const rows = await staffStorage.listEspressoLogs("0000-01-01", "9999-12-31");
    const row = rows.find((r) => r.id === id);
    if (!row) return res.status(404).json({ message: "기록을 찾을 수 없습니다." });
    if (row.staffId !== req.session.staffId)
      return res.status(403).json({ message: "본인이 작성한 기록만 삭제할 수 있습니다." });
    await staffStorage.deleteEspressoLog(id);
    res.json({ ok: true });
  });

  // ============================================================
  // 직원 — 디저트 생산일지
  // ============================================================
  app.get("/api/staff/dessert-logs", requireStaff, async (req, res) => {
    const { from, to } = rangeOf(req);
    const mine = req.query.mine === "1";
    const rows = await staffStorage.listDessertLogs(from, to, mine ? req.session.staffId! : undefined);
    res.json(rows);
  });

  app.get("/api/staff/dessert-items", requireStaff, async (_req, res) => {
    res.json(await staffStorage.listDessertItems());
  });

  /** 그날의 품목별 입력값 (없으면 0) */
  app.get("/api/staff/dessert-logs/day", requireStaff, async (req, res) => {
    const date = typeof req.query.date === "string" && req.query.date ? req.query.date : kstToday();
    const items = await staffStorage.listDessertItems();
    const logs = await staffStorage.listDessertLogs(date, date);
    const byItem = new Map(logs.map((l) => [l.itemId, l]));
    res.json({
      date,
      rows: items.map((it) => {
        const l = byItem.get(it.id);
        return {
          itemId: it.id,
          name: it.name,
          unit: it.unit,
          qty: l?.qty ?? 0,
          discardQty: l?.discardQty ?? 0,
          producedByName: l?.producedByName ?? "",
          discardedByName: l?.discardedByName ?? "",
        };
      }),
    });
  });

  app.post("/api/staff/dessert-logs/save", requireStaff, async (req, res) => {
    const parsed = saveDessertLogsSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const s = await staffStorage.getStaff(req.session.staffId!);
    const date = parsed.data.prodDate && parsed.data.prodDate.length > 0 ? parsed.data.prodDate : kstToday();
    await staffStorage.saveDessertLogs(
      req.session.staffId!,
      s?.name ?? "",
      date,
      parsed.data.kind,
      parsed.data.rows,
    );
    res.json({ ok: true });
  });

  // ============================================================
  // 직원 — 스케줄 / 공지
  // ============================================================
  app.get("/api/staff/shifts", requireStaff, async (req, res) => {
    const { from, to } = rangeOf(req);
    const rows = await staffStorage.listShifts(from, to);
    const people = await staffStorage.listStaff();
    res.json({ shifts: rows, staff: people.map((p) => ({ id: p.id, name: p.name, position: p.position })) });
  });

  app.get("/api/staff/announcements", requireStaff, async (req, res) => {
    const list = await staffStorage.listAnnouncements();
    const readIds = await staffStorage.readAnnouncementIds(req.session.staffId!);
    res.json(list.map((a) => ({ ...a, read: readIds.includes(a.id) })));
  });

  app.post("/api/staff/announcements/:id/read", requireStaff, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    await staffStorage.markAnnouncementRead(id, req.session.staffId!);
    res.json({ ok: true });
  });

  // ============================================================
  // 인수인계 — 직원
  // ============================================================
  app.get("/api/staff/handover", requireStaff, async (req, res) => {
    const date = String(req.query.date ?? "") || kstToday();
    res.json(await staffStorage.handoverDay(date, req.session.staffId!));
  });

  app.post("/api/staff/handover", requireStaff, async (req, res) => {
    const parsed = createHandoverSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    const me = await staffStorage.getStaff(req.session.staffId!);
    if (!me) return res.status(404).json({ message: "계정을 찾을 수 없습니다." });
    const row = await staffStorage.createHandover({
      workDate: parsed.data.workDate,
      staffId: me.id,
      staffName: me.name,
      body: parsed.data.body,
      important: parsed.data.important,
    });
    res.json(row);
  });

  app.patch("/api/staff/handover/:id", requireStaff, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const row = await staffStorage.getHandover(id);
    if (!row) return res.status(404).json({ message: "찾을 수 없습니다." });
    if (row.staffId !== req.session.staffId)
      return res.status(403).json({ message: "직접 쓴 인수인계만 수정할 수 있습니다." });
    const body = String(req.body?.body ?? "").trim();
    if (!body) return res.status(400).json({ message: "내용을 입력해 주세요." });
    await staffStorage.updateHandover(id, body.slice(0, 2000), !!req.body?.important);
    res.json({ ok: true });
  });

  app.delete("/api/staff/handover/:id", requireStaff, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const row = await staffStorage.getHandover(id);
    if (!row) return res.status(404).json({ message: "찾을 수 없습니다." });
    const me = await staffStorage.getStaff(req.session.staffId!);
    const isOwner = me?.staffRole === "owner";
    if (row.staffId !== req.session.staffId && !isOwner)
      return res.status(403).json({ message: "직접 쓴 인수인계만 지울 수 있습니다." });
    await staffStorage.deleteHandover(id);
    res.json({ ok: true });
  });

  app.post("/api/staff/handover/:id/read", requireStaff, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const me = await staffStorage.getStaff(req.session.staffId!);
    if (!me) return res.status(404).json({ message: "계정을 찾을 수 없습니다." });
    await staffStorage.readHandover(id, me.id, me.name);
    res.json({ ok: true });
  });

  // ============================================================
  // 준비 작업 — 직원 (추가·체크 모두 가능)
  // ============================================================
  app.get("/api/staff/prep-presets", requireStaff, async (_req, res) => {
    res.json(await staffStorage.listPrepPresets());
  });

  app.get("/api/staff/prep-tasks", requireStaff, async (req, res) => {
    const date = String(req.query.date ?? "") || kstToday();
    res.json({ date, rows: await staffStorage.prepTasksOn(date) });
  });

  app.post("/api/staff/prep-tasks", requireStaff, async (req, res) => {
    const parsed = createPrepTaskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    const me = await staffStorage.getStaff(req.session.staffId!);
    if (!me) return res.status(404).json({ message: "계정을 찾을 수 없습니다." });
    const row = await staffStorage.createPrepTask({
      workDate: parsed.data.workDate,
      title: parsed.data.title,
      memo: parsed.data.memo,
      staffId: me.id,
      staffName: me.name,
    });
    res.json(row);
  });

  app.post("/api/staff/prep-tasks/:id/toggle", requireStaff, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const row = await staffStorage.getPrepTask(id);
    if (!row) return res.status(404).json({ message: "찾을 수 없습니다." });
    const me = await staffStorage.getStaff(req.session.staffId!);
    if (!me) return res.status(404).json({ message: "계정을 찾을 수 없습니다." });
    await staffStorage.togglePrepTask(id, row.done !== 1, me.id, me.name);
    res.json({ ok: true });
  });

  app.delete("/api/staff/prep-tasks/:id", requireStaff, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const row = await staffStorage.getPrepTask(id);
    if (!row) return res.status(404).json({ message: "찾을 수 없습니다." });
    const me = await staffStorage.getStaff(req.session.staffId!);
    const isOwner = me?.staffRole === "owner";
    if (row.createdByStaffId !== req.session.staffId && !isOwner)
      return res.status(403).json({ message: "직접 추가한 작업만 지울 수 있습니다." });
    await staffStorage.deletePrepTask(id);
    res.json({ ok: true });
  });


  // ============================================================
  // 연차 — 직원
  // ============================================================
  app.get("/api/staff/leave", requireStaff, async (req, res) => {
    await staffStorage.syncLeaveGrants();
    const id = req.session.staffId!;
    const s = await staffStorage.getStaff(id);
    if (!s) return res.status(404).json({ message: "계정을 찾을 수 없습니다." });
    if (s.leaveEnabled !== 1) return res.json({ enabled: false });
    res.json({
      enabled: true,
      balance: await staffStorage.leaveBalance(id),
      grants: await staffStorage.listLeaveGrants(id),
      requests: await staffStorage.listLeaveRequests(id),
    });
  });

  app.post("/api/staff/leave/requests", requireStaff, async (req, res) => {
    const parsed = createLeaveRequestSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const s = await staffStorage.getStaff(req.session.staffId!);
    if (!s) return res.status(404).json({ message: "계정을 찾을 수 없습니다." });
    if (s.leaveEnabled !== 1) return res.status(403).json({ message: "연차 대상이 아닙니다." });

    await staffStorage.syncLeaveGrants();
    const bal = await staffStorage.leaveBalance(s.id);
    const want = parsed.data.halfDay ? 0.5 : dateSpanDays(parsed.data.startDate, parsed.data.endDate);
    if (bal && want > bal.remaining - bal.pending) {
      return res.status(400).json({
        message: `잔여 연차가 부족합니다. (신청 ${want}일 / 남은 ${Math.max(0, bal.remaining - bal.pending)}일)`,
      });
    }
    const row = await staffStorage.createLeaveRequest({
      staffId: s.id,
      staffName: s.name,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      halfDay: !!parsed.data.halfDay,
      reason: parsed.data.reason ?? "",
    });
    res.json(row);
  });

  /** 승인 전에는 본인이 취소할 수 있다 */
  app.delete("/api/staff/leave/requests/:id", requireStaff, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const row = await staffStorage.getLeaveRequest(id);
    if (!row) return res.status(404).json({ message: "신청을 찾을 수 없습니다." });
    if (row.staffId !== req.session.staffId)
      return res.status(403).json({ message: "본인 신청만 취소할 수 있습니다." });
    if (row.status !== "pending")
      return res.status(400).json({ message: "이미 처리된 신청은 취소할 수 없습니다. 대표님께 말씀해 주세요." });
    await staffStorage.deleteLeaveRequest(id);
    res.json({ ok: true });
  });

  // ============================================================
  // 연차 — 관리자
  // ============================================================
  app.get("/api/admin/staff/leave", requireAdmin, async (_req, res) => {
    await staffStorage.syncLeaveGrants();
    res.json({
      balances: await staffStorage.allLeaveBalances(),
      requests: await staffStorage.listLeaveRequests(),
      grants: await staffStorage.listLeaveGrants(),
      staff: await staffStorage.listStaff(),
    });
  });

  app.get("/api/admin/staff/leave/pending-count", requireAdmin, async (_req, res) => {
    const rows = await staffStorage.listLeaveRequests(undefined, "pending");
    res.json({ count: rows.length });
  });

  app.patch("/api/admin/staff/leave/requests/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const parsed = decideLeaveRequestSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const user = req.session.userId ? await storage.getCustomer(req.session.userId) : null;
    const row = await staffStorage.decideLeaveRequest(
      id,
      parsed.data.status,
      user?.managerName || "관리자",
      parsed.data.adminMemo ?? "",
    );
    if (!row) return res.status(404).json({ message: "신청을 찾을 수 없습니다." });
    await logIfPossible(
      req,
      storage,
      `staff.leave.${parsed.data.status}`,
      "leaveRequest",
      id,
      `${row.staffName} 연차 ${row.startDate}~${row.endDate} ${parsed.data.status === "approved" ? "승인" : "반려"}`,
    );
    res.json(row);
  });

  app.delete("/api/admin/staff/leave/requests/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    await staffStorage.deleteLeaveRequest(id);
    res.json({ ok: true });
  });

  app.post("/api/admin/staff/leave/grants", requireOwner, async (req, res) => {
    const parsed = createLeaveGrantSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    res.json(await staffStorage.createLeaveGrant(parsed.data));
  });

  app.delete("/api/admin/staff/leave/grants/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    await staffStorage.deleteLeaveGrant(id);
    res.json({ ok: true });
  });

  /** 근무표에 표시할 승인된 연차 */
  app.get("/api/admin/staff/leave/days", requireAdmin, async (req, res) => {
    const { from, to } = rangeOf(req);
    res.json(await staffStorage.approvedLeaveDays(from, to));
  });

  app.get("/api/staff/leave/days", requireStaff, async (req, res) => {
    const { from, to } = rangeOf(req);
    res.json(await staffStorage.approvedLeaveDays(from, to));
  });

  // ============================================================
  // 관리자 — 직원 계정 (owner 전용)
  // ============================================================
  app.get("/api/admin/staff", requireAdmin, async (_req, res) => {
    res.json(await staffStorage.listStaff());
  });

  app.post("/api/admin/staff", requireOwner, async (req, res) => {
    const parsed = insertStaffSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const dup = await staffStorage.getStaffByLoginId(parsed.data.loginId);
    if (dup) return res.status(400).json({ message: "이미 사용 중인 아이디입니다." });
    const row = await staffStorage.createStaff(parsed.data);
    await logIfPossible(req, storage, "staff.create", "staff", row.id, `직원 '${row.name}' 계정 생성`);
    res.json(row);
  });

  app.patch("/api/admin/staff/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const parsed = updateStaffSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const row = await staffStorage.updateStaff(id, parsed.data as any);
    if (!row) return res.status(404).json({ message: "직원을 찾을 수 없습니다." });
    await logIfPossible(req, storage, "staff.update", "staff", id, `직원 '${row.name}' 정보 수정`);
    res.json(row);
  });

  app.delete("/api/admin/staff/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const s = await staffStorage.getStaff(id);
    if (!s) return res.status(404).json({ message: "직원을 찾을 수 없습니다." });
    await staffStorage.deleteStaff(id);
    await logIfPossible(req, storage, "staff.delete", "staff", id, `직원 '${s.name}' 계정 삭제`);
    res.json({ ok: true });
  });

  // ============================================================
  // 관리자 — 근태
  // ============================================================
  app.get("/api/admin/staff/attendance", requireAdmin, async (req, res) => {
    const { from, to } = rangeOf(req);
    const staffId = req.query.staffId ? Number(req.query.staffId) : undefined;
    const rows = await staffStorage.listAttendance(from, to, staffId);
    const people = await staffStorage.listStaff();
    const nameOf = new Map(people.map((p) => [p.id, p.name]));
    res.json({
      rows: rows.map((r) => ({ ...r, minutes: workedMinutes(r), staffName: nameOf.get(r.staffId) ?? "" })),
      summary: await staffStorage.attendanceSummary(from, to),
      staff: people,
      from,
      to,
    });
  });

  app.post("/api/admin/staff/attendance", requireAdmin, async (req, res) => {
    const parsed = upsertAttendanceSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const row = await staffStorage.upsertAttendance(parsed.data);
    await logIfPossible(
      req,
      storage,
      "staff.attendance.upsert",
      "attendance",
      row.id,
      `${parsed.data.workDate} 근태 수정`,
    );
    res.json(row);
  });

  app.delete("/api/admin/staff/attendance/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    await staffStorage.deleteAttendance(id);
    res.json({ ok: true });
  });

  // ============================================================
  // 관리자 — 스케줄
  // ============================================================
  app.get("/api/admin/staff/shifts", requireAdmin, async (req, res) => {
    const { from, to } = rangeOf(req);
    res.json({
      shifts: await staffStorage.listShifts(from, to),
      staff: await staffStorage.listStaff(),
      from,
      to,
    });
  });

  app.post("/api/admin/staff/shifts", requireAdmin, async (req, res) => {
    const parsed = insertShiftSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    res.json(await staffStorage.createShift(parsed.data));
  });

  app.post("/api/admin/staff/shifts/assign", requireAdmin, async (req, res) => {
    const parsed = assignShiftSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    res.json(await staffStorage.assignShift(parsed.data));
  });

  app.post("/api/admin/staff/shifts/clear", requireAdmin, async (req, res) => {
    const parsed = clearShiftSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    await staffStorage.clearShift(parsed.data.workDate, parsed.data.slot);
    res.json({ ok: true });
  });

  app.patch("/api/admin/staff/shifts/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const allowed = ["staffId", "workDate", "startTime", "endTime", "position", "memo"] as const;
    const patch: Record<string, any> = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    const row = await staffStorage.updateShift(id, patch);
    if (!row) return res.status(404).json({ message: "스케줄을 찾을 수 없습니다." });
    res.json(row);
  });

  app.delete("/api/admin/staff/shifts/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    await staffStorage.deleteShift(id);
    res.json({ ok: true });
  });

  // ============================================================
  // 관리자 — 공지사항
  // ============================================================
  app.get("/api/admin/staff/announcements", requireAdmin, async (_req, res) => {
    const list = await staffStorage.listAnnouncements();
    const counts = await staffStorage.announcementReadCounts();
    const total = (await staffStorage.listStaff()).filter((s) => s.active === 1).length;
    res.json(list.map((a) => ({ ...a, readCount: counts[a.id] ?? 0, staffCount: total })));
  });

  app.post("/api/admin/staff/announcements", requireAdmin, async (req, res) => {
    const parsed = insertAnnouncementSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const user = req.session.userId ? await storage.getCustomer(req.session.userId) : null;
    const row = await staffStorage.createAnnouncement(user?.managerName || "관리자", parsed.data);
    await logIfPossible(req, storage, "staff.announcement.create", "announcement", row.id, `공지 '${row.title}' 등록`);
    res.json(row);
  });

  app.patch("/api/admin/staff/announcements/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const allowed = ["title", "body", "pinned", "important"] as const;
    const patch: Record<string, any> = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    const row = await staffStorage.updateAnnouncement(id, patch);
    if (!row) return res.status(404).json({ message: "공지를 찾을 수 없습니다." });
    res.json(row);
  });

  app.delete("/api/admin/staff/announcements/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    await staffStorage.deleteAnnouncement(id);
    res.json({ ok: true });
  });

  // ============================================================
  // 관리자 — 기록 조회
  // ============================================================
  app.get("/api/admin/staff/espresso-logs", requireAdmin, async (req, res) => {
    const { from, to } = rangeOf(req);
    const staffId = req.query.staffId ? Number(req.query.staffId) : undefined;
    res.json(await staffStorage.listEspressoLogs(from, to, staffId));
  });

  app.get("/api/admin/staff/dessert-items", requireAdmin, async (_req, res) => {
    res.json(await staffStorage.listDessertItems(true));
  });

  // ============================================================
  // 인수인계 · 준비 작업 — 관리자
  // ============================================================
  app.get("/api/admin/staff/handover", requireAdmin, async (req, res) => {
    const { from, to } = rangeOf(req);
    res.json({ rows: await staffStorage.listHandovers(from, to), from, to });
  });

  app.delete("/api/admin/staff/handover/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    await staffStorage.deleteHandover(id);
    res.json({ ok: true });
  });

  app.get("/api/admin/staff/prep-presets", requireAdmin, async (_req, res) => {
    res.json(await staffStorage.listPrepPresets(true));
  });

  app.post("/api/admin/staff/prep-presets", requireAdmin, async (req, res) => {
    const parsed = insertPrepPresetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    res.json(await staffStorage.createPrepPreset(parsed.data));
  });

  app.patch("/api/admin/staff/prep-presets/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const parsed = updatePrepPresetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    const row = await staffStorage.updatePrepPreset(id, parsed.data as any);
    if (!row) return res.status(404).json({ message: "찾을 수 없습니다." });
    res.json(row);
  });

  app.post("/api/admin/staff/prep-presets/:id/move", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const dir = Number(req.body?.dir) < 0 ? -1 : 1;
    await staffStorage.movePrepPreset(id, dir);
    res.json({ ok: true });
  });

  app.delete("/api/admin/staff/prep-presets/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    await staffStorage.deletePrepPreset(id);
    res.json({ ok: true });
  });

  app.get("/api/admin/staff/prep-tasks", requireAdmin, async (req, res) => {
    const { from, to } = rangeOf(req);
    res.json({ rows: await staffStorage.listPrepTasks(from, to), from, to });
  });

  app.post("/api/admin/staff/prep-tasks", requireAdmin, async (req, res) => {
    const parsed = createPrepTaskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    const row = await staffStorage.createPrepTask({
      workDate: parsed.data.workDate,
      title: parsed.data.title,
      memo: parsed.data.memo,
      staffId: 0,
      staffName: req.session.adminRole === "owner" ? "대표" : "관리자",
    });
    res.json(row);
  });

  app.delete("/api/admin/staff/prep-tasks/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    await staffStorage.deletePrepTask(id);
    res.json({ ok: true });
  });

  app.post("/api/admin/staff/dessert-items", requireOwner, async (req, res) => {
    const parsed = insertDessertItemSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    res.json(await staffStorage.createDessertItem(parsed.data));
  });

  app.patch("/api/admin/staff/dessert-items/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const parsed = updateDessertItemSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const row = await staffStorage.updateDessertItem(id, parsed.data as any);
    if (!row) return res.status(404).json({ message: "품목을 찾을 수 없습니다." });
    res.json(row);
  });

  app.delete("/api/admin/staff/dessert-items/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    await staffStorage.deleteDessertItem(id);
    res.json({ ok: true });
  });

  app.post("/api/admin/staff/dessert-items/reorder", requireOwner, async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
    await staffStorage.reorderDessertItems(ids);
    res.json({ ok: true });
  });

  app.get("/api/admin/staff/dessert-logs", requireAdmin, async (req, res) => {
    const { from, to } = rangeOf(req);
    const staffId = req.query.staffId ? Number(req.query.staffId) : undefined;
    res.json(await staffStorage.listDessertLogs(from, to, staffId));
  });
}

async function logIfPossible(
  req: Request,
  storage: IStorage,
  action: string,
  targetType: string,
  targetId: number,
  summary: string,
) {
  try {
    const user = req.session.userId ? await storage.getCustomer(req.session.userId) : null;
    await storage.logActivity({
      actorUserId: req.session.userId ?? 0,
      actorEmail: user?.email ?? "",
      actorRole: req.session.adminRole ?? "owner",
      action,
      targetType,
      targetId: String(targetId),
      summary,
    });
  } catch {
    /* 로그 실패는 무시 */
  }
}
