// 거래처 팝업 공지 — 테이블 생성(멱등) + CRUD + 라우트.
// 로그인한 거래처에게만 보이고, 노출 기간이 지나면 자동으로 사라집니다.
import type { Express, Request, Response, NextFunction } from "express";
import { db, sqlite } from "./storage";
import { and, asc, desc, eq } from "drizzle-orm";
import { popupNotices, insertPopupNoticeSchema, updatePopupNoticeSchema, type PopupNotice } from "@shared/schema";

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS popup_notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    order_until TEXT NOT NULL DEFAULT '',
    order_resume TEXT NOT NULL DEFAULT '',
    delivery_note TEXT NOT NULL DEFAULT '',
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

const KST = 9 * 60 * 60 * 1000;
function kstToday(): string {
  return new Date(Date.now() + KST).toISOString().slice(0, 10);
}

function listAll(): PopupNotice[] {
  return db.select().from(popupNotices).orderBy(desc(popupNotices.createdAt)).all();
}

/** 오늘 띄워야 하는 공지 (활성 + 기간 안) */
function listActive(): PopupNotice[] {
  const today = kstToday();
  return db
    .select()
    .from(popupNotices)
    .where(eq(popupNotices.active, 1))
    .orderBy(asc(popupNotices.createdAt))
    .all()
    .filter((n) => (!n.startDate || n.startDate <= today) && (!n.endDate || n.endDate >= today));
}

function requireLogin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) return res.status(401).json({ message: "로그인이 필요합니다." });
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
  if (req.session.adminRole !== "owner") return res.status(403).json({ message: "Owner 권한이 필요합니다." });
  next();
}

export function registerPopupNoticeRoutes(app: Express) {
  // 거래처 — 로그인 직후 띄울 공지
  app.get("/api/popup-notices/active", requireLogin, (_req, res) => {
    res.json(listActive());
  });

  // 관리자
  app.get("/api/admin/popup-notices", requireAdmin, (_req, res) => {
    res.json(listAll());
  });

  app.post("/api/admin/popup-notices", requireOwner, (req, res) => {
    const parsed = insertPopupNoticeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    const now = Date.now();
    const [row] = db
      .insert(popupNotices)
      .values({ ...parsed.data, createdAt: now, updatedAt: now })
      .returning()
      .all();
    res.json(row);
  });

  app.patch("/api/admin/popup-notices/:id", requireOwner, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const parsed = updatePopupNoticeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
    db.update(popupNotices)
      .set({ ...parsed.data, updatedAt: Date.now() })
      .where(eq(popupNotices.id, id))
      .run();
    const row = db.select().from(popupNotices).where(eq(popupNotices.id, id)).all()[0];
    if (!row) return res.status(404).json({ message: "찾을 수 없습니다." });
    res.json(row);
  });

  app.delete("/api/admin/popup-notices/:id", requireOwner, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    db.delete(popupNotices).where(eq(popupNotices.id, id)).run();
    res.json({ ok: true });
  });
}
