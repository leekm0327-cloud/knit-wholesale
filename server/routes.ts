import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import session from "express-session";
import SqliteStoreFactory from "better-sqlite3-session-store";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { storage, seed, db, DB_PATH } from "./storage";
import { registerBoardRoutes } from "./board-routes";
import { sendNewOrderEmail, sendOrderProcessedEmail, sendOrderUpdatedEmail, sendOrderMergedEmail, sendPasswordResetEmail } from "./email";
import { encrypt, fetchZone, runVerification, sendOrderToEcount, sendPaymentToEcount, sendCustomerToEcount, __ecountLogDebug } from "./ecount";
import path from "node:path";
import fs from "node:fs";
import multer from "multer";
import {
  registerSchema,
  loginSchema,
  adminLoginSchema,
  changePasswordSchema,
  createOrderSchema,
  updateOrderItemsSchema,
  insertProductSchema,
  insertPaymentSchema,
  ecountSettingsInputSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  customers,
  type Customer,
  type PublicCustomer,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    role?: string;
    adminRole?: string; // owner | manager
  }
}

function toPublic(c: Customer): PublicCustomer {
  const { password, ...rest } = c;
  return rest;
}

function genOrderNo(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `KC-${yy}${mm}${dd}-${rnd}`;
}

// multer: 메모리에 임시 저장 (백업 파일용)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// 주문 수정 시 품목 가격을 거래처별 단가로 재계산 (POST /api/orders 와 동일 로직)
// 반환: { items, supplyAmount, vat, totalAmount } 또는 에러 메시지
async function recomputeOrderItems(
  customerId: number,
  rawItems: Array<{ productId: number; name: string; category: string; unitPrice: number; qty: number; amount: number }>,
): Promise<
  | { ok: true; items: any[]; supplyAmount: number; vat: number; totalAmount: number }
  | { ok: false; message: string }
> {
  const overrides = await storage.listCustomerPrices(customerId);
  const overrideMap = new Map(overrides.map((o) => [o.productId, o.price]));
  const items: any[] = [];
  for (const it of rawItems) {
    const prod = await storage.getProduct(it.productId);
    if (!prod) return { ok: false, message: `상품을 찾을 수 없습니다: ${it.productId}` };
    const unitPrice = overrideMap.get(it.productId) ?? prod.price;
    items.push({
      productId: it.productId,
      name: prod.name,
      productName: prod.name,
      category: prod.category,
      unitPrice,
      qty: it.qty,
      amount: unitPrice * it.qty,
    });
  }
  const supplyAmount = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const vat = Math.round(supplyAmount * 0.1);
  return { ok: true, items, supplyAmount, vat, totalAmount: supplyAmount + vat };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  await seed();

  // 샌드박스 iframe 쿠키 동작을 위한 설정
  app.set("trust proxy", 1);
  const isProd = process.env.NODE_ENV === "production";

  // pplx.app 프록시는 X-Forwarded-Proto를 보내지 않아 req.secure=false로 인식됨.
  if (isProd) {
    app.use((req, _res, next) => {
      (req as any).connection.encrypted = true;
      next();
    });
  }

  const SqliteStore = SqliteStoreFactory(session);
  const sessionDb = new Database(DB_PATH);
  app.use(
    session({
      name: isProd ? "__Host-knit-sid" : "knit-sid",
      secret: process.env.SESSION_SECRET || "knit-coffee-wholesale-dev-secret",
      resave: false,
      saveUninitialized: false,
      proxy: true,
      store: new SqliteStore({
        client: sessionDb,
        expired: { clear: true, intervalMs: 900000 },
      }),
      cookie: {
        httpOnly: true,
        sameSite: isProd ? "none" : "lax",
        secure: isProd,
        path: "/",
        maxAge: 1000 * 60 * 60 * 24 * 30,
      },
    }),
  );

  // ===== 인증 미들웨어 =====
  function requireAuth(req: Request, res: Response, next: NextFunction) {
    if (!req.session.userId) return res.status(401).json({ message: "로그인이 필요합니다." });
    next();
  }
  function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.session.userId || req.session.role !== "admin")
      return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    next();
  }
  // Owner 전용 미들웨어 (#9)
  function requireOwner(req: Request, res: Response, next: NextFunction) {
    if (!req.session.userId || req.session.role !== "admin")
      return res.status(403).json({ message: "관리자 권한이 필요합니다." });
    if (req.session.adminRole !== "owner")
      return res.status(403).json({ message: "Owner 권한이 필요합니다." });
    next();
  }

  // actor 정보 추출 헬퍼
  async function getActor(req: Request) {
    const user = req.session.userId ? await storage.getCustomer(req.session.userId) : null;
    return {
      actorUserId: req.session.userId ?? 0,
      actorEmail: user?.email ?? "",
      actorRole: req.session.adminRole ?? "owner",
    };
  }

  // ===== Auth =====
  app.post("/api/auth/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const dupName = await storage.getCustomerByBusinessName(parsed.data.businessName);
    if (dupName)
      return res.status(400).json({ message: "이미 등록된 상호명입니다. 지점명을 추가하는 등 구분되는 상호명으로 입력해 주세요." });
    // #28: 비밀번호 확인 (zod refine에서 이미 검증되지만 서버에서도 재검증)
    if (parsed.data.password !== parsed.data.passwordConfirm)
      return res.status(400).json({ message: "비밀번호가 일치하지 않습니다." });
    const hashed = bcrypt.hashSync(parsed.data.password, 10);
    // #24: taxEmail을 email과 동일하게 세팅
    const { passwordConfirm: _pc, ...restData } = parsed.data;
    const customer = await storage.createCustomer({ ...restData, taxEmail: parsed.data.email, password: hashed, role: "customer" });
    req.session.userId = customer.id;
    req.session.role = customer.role;
    req.session.adminRole = customer.adminRole;
    req.session.save((err) => {
      if (err) return res.status(500).json({ message: "세션 저장 실패" });
      res.json(toPublic(customer));
    });
  });

  // 거래처 로그인 (상호명 + 비밀번호). body에 email이 있으면 관리자 로그인으로 분기 (방어적).
  app.post("/api/auth/login", async (req, res) => {
    // 관리자가 이 라우트로 email을 보낼 경우에도 동작하도록 분기
    if (req.body && req.body.email && !req.body.businessName) {
      const parsedAdmin = adminLoginSchema.safeParse(req.body);
      if (!parsedAdmin.success)
        return res.status(400).json({ message: parsedAdmin.error.errors[0]?.message ?? "입력값 오류" });
      const admin = await storage.getCustomerByEmail(parsedAdmin.data.email);
      if (!admin || admin.role !== "admin" || !bcrypt.compareSync(parsedAdmin.data.password, admin.password))
        return res.status(401).json({ message: "이메일 또는 비밀번호가 올바르지 않습니다." });
      req.session.userId = admin.id;
      req.session.role = admin.role;
      req.session.adminRole = admin.adminRole;
      return req.session.save((err) => {
        if (err) return res.status(500).json({ message: "세션 저장 실패" });
        res.json(toPublic(admin));
      });
    }

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const customer = await storage.getCustomerByBusinessName(parsed.data.businessName);
    if (!customer || !bcrypt.compareSync(parsed.data.password, customer.password))
      return res.status(401).json({ message: "상호명 또는 비밀번호가 올바르지 않습니다." });
    req.session.userId = customer.id;
    req.session.role = customer.role;
    req.session.adminRole = customer.adminRole;
    // #45: 로그인 상태 유지. 체크(true=기본) → 30일 쿠키, 해제 → 세션 쿠키(브라우저 종료 시 만료)
    if (parsed.data.rememberMe) {
      req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30;
    } else {
      // express-session은 expires=false이면 세션 쿠키(브라우저 종료 시 만료)로 설정. 타입 상 Date만 허용하므로 캐스팅.
      (req.session.cookie as any).expires = false;
      req.session.cookie.maxAge = undefined as any;
    }
    req.session.save((err) => {
      if (err) return res.status(500).json({ message: "세션 저장 실패" });
      res.json(toPublic(customer));
    });
  });

  // 관리자 로그인 (이메일 + 비밀번호, role===admin만 허용)
  app.post("/api/admin/login", async (req, res) => {
    const parsed = adminLoginSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const admin = await storage.getCustomerByEmail(parsed.data.email);
    if (!admin || admin.role !== "admin" || !bcrypt.compareSync(parsed.data.password, admin.password))
      return res.status(401).json({ message: "이메일 또는 비밀번호가 올바르지 않습니다." });
    req.session.userId = admin.id;
    req.session.role = admin.role;
    req.session.adminRole = admin.adminRole;
    req.session.save((err) => {
      if (err) return res.status(500).json({ message: "세션 저장 실패" });
      res.json(toPublic(admin));
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "로그인되지 않음" });
    const customer = await storage.getCustomer(req.session.userId);
    if (!customer) return res.status(401).json({ message: "사용자를 찾을 수 없습니다." });
    res.json(toPublic(customer));
  });

  // 관리자 전용 me 엔드포인트 (adminRole 포함)
  app.get("/api/admin/me", requireAdmin, async (req, res) => {
    const customer = await storage.getCustomer(req.session.userId!);
    if (!customer) return res.status(401).json({ message: "사용자를 찾을 수 없습니다." });
    res.json(toPublic(customer));
  });

  // 거래처 정보 수정 (배송지/결제방식 등)
  app.patch("/api/auth/me", requireAuth, async (req, res) => {
    const allowed = [
      "businessName",
      "managerName",
      "phone",
      "bizRegNo",
      "email",
      "defaultAddress",
      "paymentMethod",
    ];
    const patch: any = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    // email을 변경하는 경우 taxEmail도 동시 업데이트 (이메일 완전 통합 #43)
    if (typeof patch.email === "string") {
      patch.email = patch.email.trim();
      patch.taxEmail = patch.email;
    }
    const updated = await storage.updateCustomer(req.session.userId!, patch);
    if (!updated) return res.status(404).json({ message: "사용자 없음" });
    res.json(toPublic(updated));
  });

  // 비밀번호 변경 (거래처/관리자 공용, #18)
  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const user = await storage.getCustomer(req.session.userId!);
    if (!user) return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    if (!bcrypt.compareSync(parsed.data.currentPassword, user.password))
      return res.status(401).json({ message: "현재 비밀번호가 일치하지 않습니다." });
    const hashed = bcrypt.hashSync(parsed.data.newPassword, 10);
    await storage.updateCustomer(user.id, { password: hashed });
    res.json({ ok: true });
  });

  // ===== Products =====
  app.get("/api/products", async (req, res) => {
    const list = await storage.listProducts();
    const userId = req.session.userId;
    const role = req.session.role;
    if (!userId || role === "admin") {
      return res.json(
        list.map((p) => ({ ...p, effectivePrice: p.price, hasCustomPrice: false })),
      );
    }
    const overrides = await storage.listCustomerPrices(userId);
    const overrideMap = new Map(overrides.map((o) => [o.productId, o.price]));
    res.json(
      list.map((p) => {
        const custom = overrideMap.get(p.id);
        return {
          ...p,
          effectivePrice: custom !== undefined ? custom : p.price,
          hasCustomPrice: custom !== undefined,
        };
      }),
    );
  });

  app.get("/api/products/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const product = await storage.getProduct(id);
    if (!product) return res.status(404).json({ message: "상품을 찾을 수 없습니다." });
    const userId = req.session.userId;
    const role = req.session.role;
    if (userId && role !== "admin") {
      const override = await storage.getCustomerPrice(userId, id);
      const effectivePrice = override ? override.price : product.price;
      return res.json({
        ...product,
        effectivePrice,
        hasCustomPrice: !!override,
      });
    }
    res.json({ ...product, effectivePrice: product.price, hasCustomPrice: false });
  });

  // ===== Orders (거래처) =====
  app.post("/api/orders", requireAuth, async (req, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const customer = await storage.getCustomer(req.session.userId!);
    if (!customer) return res.status(401).json({ message: "사용자 없음" });

    const overrides = await storage.listCustomerPrices(customer.id);
    const overrideMap = new Map(overrides.map((o) => [o.productId, o.price]));
    const rawItems = parsed.data.items;
    const newItems: any[] = [];
    for (const it of rawItems) {
      const prod = await storage.getProduct(it.productId);
      if (!prod) return res.status(400).json({ message: `상품을 찾을 수 없습니다: ${it.productId}` });
      const unitPrice = overrideMap.get(it.productId) ?? prod.price;
      newItems.push({ ...it, productName: prod.name, unitPrice, amount: unitPrice * it.qty });
    }

    // ===== V7 #23B: 같은 날(KST) pending 주문 누적 =====
    const nowUtcMs = Date.now();
    const kstOffsetMs = 9 * 60 * 60 * 1000;
    const nowKst = new Date(nowUtcMs + kstOffsetMs);
    // 오늘 KST 00:00:00 의 UTC epoch ms
    const kstTodayStart = new Date(
      Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate())
    ).getTime() - kstOffsetMs;
    const kstTodayEnd = kstTodayStart + 24 * 60 * 60 * 1000;

    // 오늘 생성된 해당 거래처의 pending 주문 찾기
    const myOrders = await storage.listOrdersByCustomer(customer.id);
    const todayPending = myOrders.find(
      (o) => o.status === "pending" && o.createdAt >= kstTodayStart && o.createdAt < kstTodayEnd
    );

    if (todayPending) {
      // 기존 주문에 항목 머지
      const existingItems: any[] = JSON.parse(todayPending.items);
      const mergedItems = [...existingItems];

      for (const ni of newItems) {
        const idx = mergedItems.findIndex((ei: any) => ei.productId === ni.productId);
        if (idx >= 0) {
          const newQty = mergedItems[idx].qty + ni.qty;
          mergedItems[idx] = {
            ...mergedItems[idx],
            qty: newQty,
            amount: mergedItems[idx].unitPrice * newQty,
          };
        } else {
          mergedItems.push(ni);
        }
      }

      const newSupplyAmount = mergedItems.reduce((s: number, i: any) => s + i.unitPrice * i.qty, 0);
      const newVat = Math.round(newSupplyAmount * 0.1);
      const newTotalAmount = newSupplyAmount + newVat;

      const updatedOrder = await storage.updateOrder(todayPending.id, {
        items: JSON.stringify(mergedItems),
        supplyAmount: newSupplyAmount,
        vat: newVat,
        totalAmount: newTotalAmount,
      });

      // 관리자에게 주문 추가 알림 메일 (추가된 항목만 요약)
      sendOrderMergedEmail({
        orderNo: todayPending.orderNo,
        businessName: customer.businessName,
        managerName: customer.managerName,
        phone: customer.phone,
        addedItems: newItems.map((i: any) => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice, amount: i.amount })),
        newSupplyAmount,
        newVat,
        newTotalAmount,
      }).catch((e) => console.error("[email] 주문 추가 알림 메일 실패:", e));

      return res.json({ ...(updatedOrder ?? todayPending), merged: true, orderId: todayPending.id });
    }

    // 신규 주문 생성
    const supplyAmount = newItems.reduce((s: number, i: any) => s + i.unitPrice * i.qty, 0);
    const vat = Math.round(supplyAmount * 0.1);
    const order = await storage.createOrder({
      orderNo: genOrderNo(),
      customerId: customer.id,
      customerSnapshot: JSON.stringify({
        businessName: customer.businessName,
        managerName: customer.managerName,
        phone: customer.phone,
        bizRegNo: customer.bizRegNo,
        taxEmail: customer.taxEmail,
        defaultAddress: customer.defaultAddress,
        paymentMethod: customer.paymentMethod,
      }),
      items: JSON.stringify(newItems),
      supplyAmount,
      vat,
      totalAmount: supplyAmount + vat,
      desiredDate: parsed.data.desiredDate ?? "",
      note: parsed.data.note ?? "",
      status: "pending",
      trackingNo: "",
      adminMemo: "",
      quickRequest: parsed.data.quickRequest ? 1 : 0,
      createdAt: Date.now(),
    });

    // 관리자 이메일 알림 — 응답을 막지 않고 비동기 발송
    sendNewOrderEmail({
      orderNo: order.orderNo,
      businessName: customer.businessName,
      managerName: customer.managerName,
      phone: customer.phone,
      supplyAmount,
      vat,
      totalAmount: supplyAmount + vat,
      items: newItems,
      desiredDate: parsed.data.desiredDate ?? "",
      note: parsed.data.note ?? "",
      createdAt: order.createdAt,
    }).catch((e) => console.error("[email] 알림 메일 실패:", e));

    res.json({ ...order, merged: false, orderId: order.id });
  });

  // 거래처 본인 주문 목록
  app.get("/api/orders/mine", requireAuth, async (req, res) => {
    res.json(await storage.listOrdersByCustomer(req.session.userId!));
  });

  // 단일 주문 조회 (본인 또는 관리자)
  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    const order = await storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
    if (req.session.role !== "admin" && order.customerId !== req.session.userId)
      return res.status(403).json({ message: "권한이 없습니다." });
    res.json(order);
  });

  // 거래처용 — 주문 수정 (#11)
  app.patch("/api/orders/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const order = await storage.getOrder(id);
    if (!order) return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
    if (order.customerId !== req.session.userId)
      return res.status(403).json({ message: "권한이 없습니다." });
    if (order.status !== "pending")
      return res.status(400).json({ message: "이미 처리 중인 주문은 수정할 수 없습니다." });

    const parsed = updateOrderItemsSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });

    const recomputed = await recomputeOrderItems(order.customerId, parsed.data.items);
    if (!recomputed.ok) return res.status(400).json({ message: recomputed.message });

    const updated = await storage.updateOrder(id, {
      items: JSON.stringify(recomputed.items),
      supplyAmount: recomputed.supplyAmount,
      vat: recomputed.vat,
      totalAmount: recomputed.totalAmount,
      desiredDate: parsed.data.desiredDate ?? "",
      note: parsed.data.note ?? "",
      quickRequest: parsed.data.quickRequest ? 1 : 0,
    });
    if (!updated) return res.status(404).json({ message: "주문 없음" });

    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "order.customer_update",
      targetType: "order",
      targetId: String(updated.id),
      summary: `거래처가 주문 #${updated.orderNo} 수정`,
    });

    res.json(updated);
  });

  // 거래처용 — 주문 취소 (#11)
  app.post("/api/orders/:id/cancel", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const order = await storage.getOrder(id);
    if (!order) return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
    if (order.customerId !== req.session.userId)
      return res.status(403).json({ message: "권한이 없습니다." });
    if (order.status !== "pending")
      return res.status(400).json({ message: "이미 처리 중인 주문은 취소할 수 없습니다." });

    const updated = await storage.updateOrder(id, {
      status: "cancelled",
      cancelledAt: Date.now(),
      cancelledBy: req.session.userId!,
    });
    if (!updated) return res.status(404).json({ message: "주문 없음" });

    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "order.customer_cancel",
      targetType: "order",
      targetId: String(updated.id),
      summary: `거래처가 주문 #${updated.orderNo} 취소`,
    });

    res.json(updated);
  });

  // ===== Admin =====
  app.get("/api/admin/orders", requireAdmin, async (req, res) => {
    const since = req.query.since ? Number(req.query.since) : undefined;
    const orders = since ? await storage.listOrdersSince(since) : await storage.listOrders();
    res.json(orders);
  });

  // 공개 cron 엔드포인트
  app.get("/api/cron/new-orders", async (req, res) => {
    const expected = process.env.CRON_TOKEN;
    if (!expected || req.query.token !== expected) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const since = req.query.since
      ? Number(req.query.since)
      : Date.now() - 10 * 60 * 1000;
    const orders = await storage.listOrdersSince(since);
    const allCustomers = await storage.listCustomers();
    const customerMap = new Map(allCustomers.map((c) => [c.id, c.businessName]));
    res.json({
      now: Date.now(),
      since,
      count: orders.length,
      orders: orders.map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        customerId: o.customerId,
        businessName: customerMap.get(o.customerId) ?? "?",
        totalAmount: o.totalAmount,
        status: o.status,
        createdAt: o.createdAt,
      })),
    });
  });

  app.get("/api/admin/stats", requireAdmin, async (_req, res) => {
    const allOrders = await storage.listOrders();
    const allCustomers = await storage.listCustomers();
    const pending = allOrders.filter((o) => o.status === "pending").length;
    const totalRevenue = allOrders.reduce((s, o) => s + o.totalAmount, 0);

    const monthly: Record<string, number> = {};
    for (const o of allOrders) {
      const d = new Date(o.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly[key] = (monthly[key] ?? 0) + o.totalAmount;
    }

    const byCustomer: Record<number, { orders: number; revenue: number }> = {};
    for (const o of allOrders) {
      byCustomer[o.customerId] = byCustomer[o.customerId] ?? { orders: 0, revenue: 0 };
      byCustomer[o.customerId].orders += 1;
      byCustomer[o.customerId].revenue += o.totalAmount;
    }
    const customerStats = allCustomers.map((c) => ({
      id: c.id,
      businessName: c.businessName,
      managerName: c.managerName,
      orders: byCustomer[c.id]?.orders ?? 0,
      revenue: byCustomer[c.id]?.revenue ?? 0,
    }));

    res.json({
      totalOrders: allOrders.length,
      pendingOrders: pending,
      totalCustomers: allCustomers.length,
      totalRevenue,
      monthly: Object.entries(monthly)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, revenue]) => ({ month, revenue })),
      customerStats: customerStats.sort((a, b) => b.revenue - a.revenue),
    });
  });

  app.get("/api/admin/customers", requireAdmin, async (_req, res) => {
    const allCustomers = await storage.listCustomers();
    res.json(allCustomers.map(toPublic));
  });

  app.get("/api/admin/customers/:id", requireAdmin, async (req, res) => {
    const c = await storage.getCustomer(Number(req.params.id));
    if (!c) return res.status(404).json({ message: "거래처를 찾을 수 없습니다." });
    const customerOrders = await storage.listOrdersByCustomer(c.id);
    res.json({ customer: toPublic(c), orders: customerOrders });
  });

  // 거래처 생성 (Owner+Manager)
  app.post("/api/admin/customers", requireAdmin, async (req, res) => {
    const { email, businessName, managerName, phone, bizRegNo, defaultAddress, paymentMethod } = req.body;
    let { password } = req.body;
    if (!email || !businessName || !managerName || !phone)
      return res.status(400).json({ message: "필수 입력값이 없습니다." });
    const dupName = await storage.getCustomerByBusinessName(businessName);
    if (dupName)
      return res.status(400).json({ message: "이미 등록된 상호명입니다. 지점명을 추가하는 등 구분되는 상호명으로 입력해 주세요." });
    // 비밀번호가 비어있으면 사업자등록번호를 초기 비밀번호로 사용
    if (!password || String(password).trim() === "") {
      if (bizRegNo && String(bizRegNo).trim() !== "") {
        password = String(bizRegNo).trim();
      } else {
        return res.status(400).json({ message: "사업자등록번호 또는 비밀번호 중 하나는 반드시 입력해 주세요." });
      }
    }
    const hashed = bcrypt.hashSync(password, 10);
    const actor = await getActor(req);
    const customer = await storage.createCustomer({
      email,
      password: hashed,
      role: "customer",
      businessName,
      managerName,
      phone,
      bizRegNo: bizRegNo ?? "",
      taxEmail: email ?? "", // #43 이메일 통합: taxEmail = email
      defaultAddress: defaultAddress ?? "",
      paymentMethod: paymentMethod ?? "transfer",
    });
    await storage.logActivity({
      ...actor,
      action: "customer.create",
      targetType: "customer",
      targetId: String(customer.id),
      summary: `거래처 '${customer.businessName}' 등록`,
      metadata: { email: customer.email },
    });

    // ECOUNT 자동 등록 (autoSendCustomer가 1이고 사업자번호가 있을 때) — 응답을 막지 않고 비동기 처리
    try {
      const settings = await storage.getEcountSettings();
      const cleanBizNo = (customer.bizRegNo || "").replace(/[^0-9]/g, "");
      if (settings && settings.autoSendCustomer && cleanBizNo) {
        sendCustomerToEcount(customer.id).catch((e) =>
          console.error("[ecount] 거래처 자동 등록 실패:", e),
        );
      }
    } catch (e) {
      console.error("[ecount] 거래처 자동 등록 설정 확인 실패:", e);
    }

    res.json(toPublic(customer));
  });

  // 거래처 수정
  app.patch("/api/admin/customers/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    // password 는 절대 이 라우트에서 받지 않음
    const allowed = ["businessName", "ownerName", "managerName", "phone", "bizRegNo", "email", "defaultAddress", "paymentMethod"];
    const patch: any = {};
    for (const k of allowed) if (k in req.body && k !== "password") patch[k] = req.body[k];
    // email 변경 시 taxEmail도 동시 업데이트 (이메일 완전 통합 #43)
    if (typeof patch.email === "string") {
      patch.email = patch.email.trim();
      patch.taxEmail = patch.email;
    }
    // 상호명 변경 시 중복 체크
    if (patch.businessName) {
      const dup = await storage.getCustomerByBusinessName(patch.businessName);
      if (dup && dup.id !== id) {
        return res.status(409).json({ message: "이미 사용 중인 상호명입니다." });
      }
    }
    const updated = await storage.updateCustomer(id, patch);
    if (!updated) return res.status(404).json({ message: "거래처 없음" });
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "customer.update",
      targetType: "customer",
      targetId: String(id),
      summary: `거래처 '${updated.businessName}' 수정`,
    });
    res.json(toPublic(updated));
  });

  // 거래처 삭제
  app.delete("/api/admin/customers/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const customer = await storage.getCustomer(id);
    if (!customer) return res.status(404).json({ message: "거래처 없음" });
    const actor = await getActor(req);
    await storage.deleteCustomer(id);
    await storage.logActivity({
      ...actor,
      action: "customer.delete",
      targetType: "customer",
      targetId: String(id),
      summary: `거래처 '${customer.businessName}' 삭제`,
    });
    res.json({ ok: true });
  });

  // ===== 채권(미수금) 관리 =====
  app.get("/api/admin/balances", requireAdmin, async (_req, res) => {
    const balances = await storage.getCustomerBalances();
    const totalOutstanding = balances.reduce((s, b) => s + Math.max(0, b.balance), 0);
    const totalOrdered = balances.reduce((s, b) => s + b.totalOrdered, 0);
    const totalPaid = balances.reduce((s, b) => s + b.totalPaid, 0);
    const overdue = balances
      .filter((b) => b.balance > 0)
      .sort((a, b) => b.balance - a.balance);
    res.json({
      totalOutstanding,
      totalOrdered,
      totalPaid,
      balances: balances.sort((a, b) => b.balance - a.balance),
      topOverdue: overdue.slice(0, 5),
    });
  });

  app.get("/api/admin/customers/:id/prices", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const prices = await storage.listCustomerPrices(id);
    res.json(prices);
  });

  app.put("/api/admin/customers/:id/prices", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const customer = await storage.getCustomer(id);
    if (!customer) return res.status(404).json({ message: "거래처를 찾을 수 없습니다." });
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    for (const it of items) {
      const productId = Number(it.productId);
      if (!Number.isFinite(productId)) continue;
      if (it.price === null || it.price === undefined || it.price === "") {
        await storage.deleteCustomerPrice(id, productId);
        continue;
      }
      const price = Number(it.price);
      if (!Number.isFinite(price) || price < 0) continue;
      await storage.upsertCustomerPrice(id, productId, Math.round(price));
    }
    const updated = await storage.listCustomerPrices(id);
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "customer_prices.update",
      targetType: "customer",
      targetId: String(id),
      summary: `거래처 '${customer.businessName}' 전용가 수정`,
    });
    res.json(updated);
  });

  app.get("/api/admin/customers/:id/ledger", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const ledger = await storage.getCustomerLedger(id);
    if (!ledger.balance) return res.status(404).json({ message: "거래처 없음" });
    const customerPayments = await storage.listPaymentsByCustomer(id);
    res.json({ ...ledger, payments: customerPayments });
  });

  app.post("/api/admin/payments", requireAdmin, async (req, res) => {
    const parsed = insertPaymentSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const customer = await storage.getCustomer(parsed.data.customerId);
    if (!customer) return res.status(404).json({ message: "거래처를 찾을 수 없습니다." });
    const payment = await storage.createPayment(parsed.data);
    res.json(payment);
  });

  app.delete("/api/admin/payments/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const p = await storage.getPayment(id);
    if (!p) return res.status(404).json({ message: "입금 내역을 찾을 수 없습니다." });
    await storage.deletePayment(id);
    res.json({ ok: true });
  });

  app.get("/api/account/ledger", requireAuth, async (req, res) => {
    const ledger = await storage.getCustomerLedger(req.session.userId!);
    if (!ledger.balance) return res.status(404).json({ message: "거래처 없음" });
    const customerPayments = await storage.listPaymentsByCustomer(req.session.userId!);
    res.json({ ...ledger, payments: customerPayments });
  });

  app.patch("/api/admin/orders/:id", requireAdmin, async (req, res) => {
    const allowed = ["status", "trackingNo", "adminMemo", "desiredDate", "note", "quickRequest"];
    const patch: any = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    const order = await storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ message: "주문 없음" });

    // body에 items가 있으면 가격 재계산 후 공급가/부가세/합계를 patch에 자동 세팅 (#11)
    let itemsChanged = false;
    if (req.body.items !== undefined) {
      const parsed = updateOrderItemsSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
      const recomputed = await recomputeOrderItems(order.customerId, parsed.data.items);
      if (!recomputed.ok) return res.status(400).json({ message: recomputed.message });
      patch.items = JSON.stringify(recomputed.items);
      patch.supplyAmount = recomputed.supplyAmount;
      patch.vat = recomputed.vat;
      patch.totalAmount = recomputed.totalAmount;
      patch.desiredDate = parsed.data.desiredDate ?? "";
      patch.note = parsed.data.note ?? "";
      patch.quickRequest = parsed.data.quickRequest ? 1 : 0;
      itemsChanged = true;
    }
    // quickRequest 가 boolean 으로 들어온 경우 (items 없이 단독 수정) 1/0 변환
    if (!itemsChanged && typeof patch.quickRequest === "boolean") {
      patch.quickRequest = patch.quickRequest ? 1 : 0;
    }

    const updated = await storage.updateOrder(Number(req.params.id), patch);
    if (!updated) return res.status(404).json({ message: "주문 없음" });

    // items 변경 시 활동 로그 + 거래처 알림 메일 (#11)
    if (itemsChanged) {
      const actor = await getActor(req);
      await storage.logActivity({
        ...actor,
        action: "order.admin_update",
        targetType: "order",
        targetId: String(updated.id),
        summary: `관리자가 주문 #${updated.orderNo} 수정`,
      });
      const cust = await storage.getCustomer(updated.customerId);
      if (cust) {
        // #31 동적 도메인 처리
        const baseUrl = process.env.PUBLIC_URL ||
          (req.headers.origin as string) ||
          `${req.protocol}://${req.headers.host}`;
        sendOrderUpdatedEmail({
          orderId: updated.id,
          orderNo: updated.orderNo,
          businessName: cust.businessName,
          taxEmail: cust.taxEmail || cust.email,
        }, baseUrl).catch((e) => console.error("[email] 주문 수정 메일 실패:", e));
      }
    }

    // 상태 변경 시 활동 로그 + 처리완료 메일 (#7, #10)
    if (patch.status && patch.status !== order.status) {
      const actor = await getActor(req);
      await storage.logActivity({
        ...actor,
        action: "order.status_change",
        targetType: "order",
        targetId: String(updated.id),
        summary: `주문 #${updated.orderNo} 상태 → ${patch.status}`,
        metadata: { from: order.status, to: patch.status },
      });

      // 처리완료(done) 시 거래처에게 메일 발송 (#7)
      if (patch.status === "done") {
        const customer = await storage.getCustomer(updated.customerId);
        if (customer) {
          // #31 동적 도메인 처리
          const baseUrl = process.env.PUBLIC_URL ||
            (req.headers.origin as string) ||
            `${req.protocol}://${req.headers.host}`;
          sendOrderProcessedEmail({
            orderId: updated.id,
            orderNo: updated.orderNo,
            businessName: customer.businessName,
            taxEmail: customer.taxEmail || customer.email,
            items: JSON.parse(updated.items),
          }, baseUrl).catch((e) => console.error("[email] 처리완료 메일 실패:", e));
        }
      }
    }

    res.json(updated);
  });

  // 관리자용 — 주문 취소 (#11)
  app.post("/api/admin/orders/:id/cancel", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const order = await storage.getOrder(id);
    if (!order) return res.status(404).json({ message: "주문을 찾을 수 없습니다." });
    if (order.status === "cancelled")
      return res.status(400).json({ message: "이미 취소된 주문입니다." });

    const updated = await storage.updateOrder(id, {
      status: "cancelled",
      cancelledAt: Date.now(),
      cancelledBy: req.session.userId!,
    });
    if (!updated) return res.status(404).json({ message: "주문 없음" });

    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "order.admin_cancel",
      targetType: "order",
      targetId: String(updated.id),
      summary: `관리자가 주문 #${updated.orderNo} 취소`,
    });

    res.json(updated);
  });

  // 상품 관리
  app.post("/api/admin/products", requireAdmin, async (req, res) => {
    const parsed = insertProductSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const product = await storage.createProduct(parsed.data);
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "product.create",
      targetType: "product",
      targetId: String(product.id),
      summary: `상품 '${product.name}' 생성`,
    });
    res.json(product);
  });

  app.patch("/api/admin/products/:id", requireAdmin, async (req, res) => {
    const allowed = ["name", "category", "origin", "price", "available", "sortOrder", "ecountCode", "detailTemplate", "detailJson", "detailImages"];
    const patch: any = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    const updated = await storage.updateProduct(Number(req.params.id), patch);
    if (!updated) return res.status(404).json({ message: "상품 없음" });
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "product.update",
      targetType: "product",
      targetId: String(updated.id),
      summary: `상품 '${updated.name}' 수정`,
    });
    res.json(updated);
  });

  app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const product = await storage.getProduct(id);
    if (!product) return res.status(404).json({ message: "상품 없음" });
    await storage.deleteProduct(id);
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "product.delete",
      targetType: "product",
      targetId: String(id),
      summary: `상품 '${product.name}' 삭제`,
    });
    res.json({ ok: true });
  });

  // ===== 매니저 관리 (#9) =====
  app.get("/api/admin/managers", requireAdmin, async (_req, res) => {
    const admins = await storage.listAdmins();
    res.json(admins.map(toPublic));
  });

  app.post("/api/admin/managers", requireOwner, async (req, res) => {
    const { email, name, password, phone } = req.body;
    if (!email || !name || !password)
      return res.status(400).json({ message: "이메일, 이름, 비밀번호는 필수입니다." });
    const existing = await storage.getCustomerByEmail(email);
    if (existing) return res.status(409).json({ message: "이미 사용 중인 이메일입니다." });
    const hashed = bcrypt.hashSync(password, 10);
    const actor = await getActor(req);
    const manager = await storage.createCustomer({
      email,
      password: hashed,
      role: "admin",
      adminRole: "manager",
      businessName: "니트커피",
      managerName: name,
      phone: phone ?? "",
      bizRegNo: "",
      taxEmail: "",
      defaultAddress: "",
      paymentMethod: "transfer",
    });
    await storage.logActivity({
      ...actor,
      action: "manager.create",
      targetType: "manager",
      targetId: String(manager.id),
      summary: `매니저 '${manager.managerName}' (${manager.email}) 추가`,
    });
    res.json(toPublic(manager));
  });

  app.patch("/api/admin/managers/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    const target = await storage.getCustomer(id);
    if (!target || target.role !== "admin") return res.status(404).json({ message: "매니저를 찾을 수 없습니다." });
    const patch: any = {};
    if (req.body.name) patch.managerName = req.body.name;
    if (req.body.phone !== undefined) patch.phone = req.body.phone;
    if (req.body.password) patch.password = bcrypt.hashSync(req.body.password, 10);
    const updated = await storage.updateCustomer(id, patch);
    if (!updated) return res.status(404).json({ message: "매니저 없음" });
    res.json(toPublic(updated));
  });

  app.delete("/api/admin/managers/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    // Owner 자기 자신 삭제 불가
    if (id === req.session.userId)
      return res.status(400).json({ message: "자기 자신은 삭제할 수 없습니다." });
    const target = await storage.getCustomer(id);
    if (!target || target.role !== "admin") return res.status(404).json({ message: "매니저를 찾을 수 없습니다." });
    const actor = await getActor(req);
    await storage.deleteCustomer(id);
    await storage.logActivity({
      ...actor,
      action: "manager.delete",
      targetType: "manager",
      targetId: String(id),
      summary: `매니저 '${target.managerName}' (${target.email}) 삭제`,
    });
    res.json({ ok: true });
  });

  // ===== 활동 로그 (#10) =====
  app.get("/api/admin/activity-logs", requireAdmin, async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const action = typeof req.query.action === "string" && req.query.action ? req.query.action : undefined;
    const actorEmail = typeof req.query.actor === "string" && req.query.actor ? req.query.actor : undefined;
    const targetType = typeof req.query.targetType === "string" && req.query.targetType ? req.query.targetType : undefined;
    const from = req.query.from ? Number(req.query.from) : undefined;
    const to = req.query.to ? Number(req.query.to) : undefined;

    const result = await storage.listActivityLogs({ action, actorEmail, targetType, from, to, page, limit });
    res.json(result);
  });

  // ===== #32 거래내역서 =====
  app.get("/api/admin/transactions", requireAdmin, async (req, res) => {
    const customerId = Number(req.query.customerId);
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : "";
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : "";

    if (!Number.isFinite(customerId) || customerId <= 0)
      return res.status(400).json({ message: "거래처 ID가 필요합니다." });
    if (!startDate || !endDate)
      return res.status(400).json({ message: "시작일과 종료일이 필요합니다." });

    const customer = await storage.getCustomer(customerId);
    if (!customer || customer.role !== "customer")
      return res.status(404).json({ message: "거래처를 찾을 수 없습니다." });

    const result = await storage.listTransactions(customerId, startDate, endDate);
    res.json({
      customer: { id: customer.id, businessName: customer.businessName, managerName: customer.managerName, phone: customer.phone },
      startDate,
      endDate,
      ...result,
    });
  });

  // ===== 백업 (#4) =====
  app.get("/api/admin/backup/export", requireOwner, async (_req, res) => {
    const dbPath = DB_PATH;
    if (!fs.existsSync(dbPath)) return res.status(404).json({ message: "DB 파일 없음" });
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const hm = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const filename = `knit-backup-${ymd}-${hm}.db`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/octet-stream");
    res.sendFile(dbPath);
  });

  app.post("/api/admin/backup/import", requireOwner, upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "파일이 없습니다." });
    const dbPath = DB_PATH;
    const backupPath = path.join(path.dirname(DB_PATH), `data.db.bak.${Date.now()}`);
    try {
      // 현재 DB 백업
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, backupPath);
      }
      // 업로드 파일로 교체
      fs.writeFileSync(dbPath, req.file.buffer);
      const actor = await getActor(req);
      // 로그는 새 DB에 쓰지 않고 콘솔에만 (복원 직후라 DB 상태 불확실)
      console.log(`[backup] 복원 완료. actor=${actor.actorEmail}`);
      res.json({ ok: true, message: "복원 완료. 페이지를 새로고침해 주세요." });
    } catch (e: any) {
      // 실패 시 백업 복원 시도
      if (fs.existsSync(backupPath)) {
        try { fs.copyFileSync(backupPath, dbPath); } catch {}
      }
      res.status(500).json({ message: `복원 실패: ${e?.message ?? e}` });
    }
  });

  // ===== ECOUNT 연동 설정 =====
  app.get("/api/admin/ecount/settings", requireAdmin, async (_req, res) => {
    const s = await storage.getEcountSettings();
    if (!s) {
      return res.json({
        comCode: "",
        userId: "",
        zone: "",
        warehouseCode: "",
        useTestEndpoint: true,
        autoSendSales: false,
        autoSendPayments: false,
        autoSendCustomer: true,
        autoSendProduct: true,
        hasKey: false,
        lastVerifiedAt: null,
        verificationLog: "",
      });
    }
    res.json({
      comCode: s.comCode,
      userId: s.userId,
      zone: s.zone,
      warehouseCode: s.warehouseCode,
      useTestEndpoint: !!s.useTestEndpoint,
      autoSendSales: !!s.autoSendSales,
      autoSendPayments: !!s.autoSendPayments,
      autoSendCustomer: !!s.autoSendCustomer,
      autoSendProduct: !!s.autoSendProduct,
      hasKey: !!s.apiCertKeyEnc,
      lastVerifiedAt: s.lastVerifiedAt,
      verificationLog: s.verificationLog,
    });
  });

  app.put("/api/admin/ecount/settings", requireAdmin, async (req, res) => {
    const parsed = ecountSettingsInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    }
    const d = parsed.data;
    const patch: any = {
      comCode: d.comCode,
      userId: d.userId,
      zone: d.zone ?? "",
      warehouseCode: d.warehouseCode,
      useTestEndpoint: d.useTestEndpoint ? 1 : 0,
      autoSendSales: d.autoSendSales ? 1 : 0,
      autoSendPayments: d.autoSendPayments ? 1 : 0,
      autoSendCustomer: d.autoSendCustomer ? 1 : 0,
      autoSendProduct: d.autoSendProduct ? 1 : 0,
    };
    if (d.apiCertKey && d.apiCertKey.trim().length > 0) {
      patch.apiCertKeyEnc = encrypt(d.apiCertKey.trim());
    }
    if (!patch.zone) {
      try {
        patch.zone = await fetchZone(d.comCode, d.useTestEndpoint ?? true);
      } catch (e: any) {
        return res.status(400).json({ message: `Zone 자동 조회 실패: ${e?.message ?? e}` });
      }
    }
    const saved = await storage.updateEcountSettings(patch);
    res.json({
      ok: true,
      zone: saved.zone,
      hasKey: !!saved.apiCertKeyEnc,
    });
  });

  app.post("/api/admin/ecount/verify", requireAdmin, async (_req, res) => {
    try {
      const result = await runVerification();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({
        ok: false,
        message: e?.message ?? String(e),
      });
    }
  });

  app.post("/api/admin/ecount/orders/:id/send", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "잘못된 주문 ID" });
      const result = await sendOrderToEcount(id);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ ok: false, steps: [], message: e?.message ?? String(e) });
    }
  });

  app.post("/api/admin/ecount/payments/:id/send", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "잘못된 입금 ID" });
      const result = await sendPaymentToEcount(id);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ ok: false, steps: [], message: e?.message ?? String(e) });
    }
  });

  app.get("/api/admin/ecount/logs", requireAdmin, async (req, res) => {
    const action = typeof req.query.action === "string" && req.query.action !== "all" ? req.query.action : undefined;
    const refKind = typeof req.query.refKind === "string" && req.query.refKind !== "all" ? req.query.refKind : undefined;
    const refId = typeof req.query.refId === "string" && req.query.refId ? req.query.refId : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const sinceTs = typeof req.query.sinceTs === "string" ? Number(req.query.sinceTs) : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
    const logs = await storage.listEcountLogs({
      action,
      refKind,
      refId,
      okOnly: status === "ok",
      failOnly: status === "fail",
      sinceTs: sinceTs && !Number.isNaN(sinceTs) ? sinceTs : undefined,
      limit: Number.isFinite(limit) ? limit : 200,
    });
    res.json(logs);
  });

  app.get("/api/admin/ecount/logs/__debug", requireAdmin, async (_req, res) => {
    let rowCount = -1;
    let tableError: string | null = null;
    try {
      const all = await storage.listEcountLogs({ limit: 1 });
      const all2 = await storage.listEcountLogs({ limit: 10000 });
      rowCount = all2.length;
      void all;
    } catch (e: any) {
      tableError = e?.message ?? String(e);
    }
    res.json({
      counter: __ecountLogDebug,
      tableRowCount: rowCount,
      tableError,
    });
  });

  app.get("/api/admin/ecount/logs/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const log = await storage.getEcountLog(id);
    if (!log) return res.status(404).json({ message: "로그를 찾을 수 없습니다." });
    res.json(log);
  });

  app.delete("/api/admin/ecount/logs/old", requireAdmin, async (req, res) => {
    const days = Number(req.query.days) || 90;
    const beforeTs = Date.now() - days * 24 * 60 * 60 * 1000;
    const deleted = await storage.deleteOldEcountLogs(beforeTs);
    res.json({ deleted });
  });

  // ===== V8 #26: 비밀번호 찾기 =====
  app.post("/api/auth/forgot-password", async (req, res) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    }

    // 등록되지 않은 이메일이어도 동일 메시지 (이메일 존재 여부 누출 방지)
    // 관리자가 같은 이메일을 쓸 수 있으므로, 명시적으로 customer만 조회
    const customer = await storage.getCustomerOnlyByEmail(parsed.data.email);
    if (customer && customer.role === "customer") {
      const token = crypto.randomBytes(32).toString("hex"); // 64자 hex
      const expiresAt = Date.now() + 60 * 60 * 1000; // 1시간
      await storage.createPasswordResetToken(customer.id, token, expiresAt);

      // #31 동적 도메인 처리
      const origin = process.env.PUBLIC_URL ||
        (req.headers.origin as string) ||
        `${req.protocol}://${req.headers.host}`;
      const resetUrl = `${origin}/#/reset-password/${token}`;

      sendPasswordResetEmail(parsed.data.email, resetUrl)
        .catch((e) => console.error("[forgot-password] 메일 발송 실패", e));
    }
    // 등록 여부 상관없이 동일 응답
    res.json({ message: "메일을 보냈습니다. 받은편지함을 확인하세요." });
  });

  // ===== V8 #26: 비밀번호 재설정 =====
  app.post("/api/auth/reset-password", async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });

    const tokenRow = await storage.getPasswordResetToken(parsed.data.token);
    if (!tokenRow)
      return res.status(400).json({ message: "유효하지 않은 토큰입니다." });
    if (tokenRow.usedAt !== null)
      return res.status(400).json({ message: "이미 사용된 토큰입니다." });
    if (Date.now() > tokenRow.expiresAt)
      return res.status(400).json({ message: "만료된 토큰입니다. 비밀번호 찾기를 다시 시도해 주세요." });

    const hashed = bcrypt.hashSync(parsed.data.password, 10);
    await storage.updateCustomerPassword(tokenRow.customerId, hashed);
    await storage.markPasswordResetTokenUsed(tokenRow.id);

    res.json({ message: "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요." });
  });

  // ===== V8 #29: 관리자 거래처 비밀번호 재설정 메일 발송 =====
  app.post("/api/admin/customers/:id/reset-password", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const customer = await storage.getCustomer(id);
    if (!customer || customer.role !== "customer")
      return res.status(404).json({ message: "거래처를 찾을 수 없습니다." });
    if (!customer.email || customer.email.trim() === "")
      return res.status(400).json({ message: "등록된 이메일이 없습니다." });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 60 * 60 * 1000;
    await storage.createPasswordResetToken(customer.id, token, expiresAt);

    const origin = process.env.PUBLIC_URL ||
      (req.headers.origin as string) ||
      `${req.protocol}://${req.headers.host}`;
    const resetUrl = `${origin}/#/reset-password/${token}`;

    sendPasswordResetEmail(customer.email, resetUrl).catch((e) =>
      console.error("[admin/reset-password] 메일 발송 실패", e),
    );

    res.json({ message: "재설정 메일을 발송했습니다." });
  });

  // ===== Board (게시판) =====
  registerBoardRoutes(app, storage);

  return httpServer;
}
