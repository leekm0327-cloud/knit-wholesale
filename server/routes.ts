import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import session from "express-session";
import MemoryStore from "memorystore";
import bcrypt from "bcryptjs";
import { storage, seed } from "./storage";
import {
  registerSchema,
  loginSchema,
  createOrderSchema,
  insertProductSchema,
  type Customer,
  type PublicCustomer,
} from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    role?: string;
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

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  await seed();

  // 샌드박스 iframe 쿠키 동작을 위한 설정
  app.set("trust proxy", 1);
  const isProd = process.env.NODE_ENV === "production";
  const Store = MemoryStore(session);
  app.use(
    session({
      secret: "knit-coffee-wholesale-secret-2026",
      resave: false,
      saveUninitialized: false,
      store: new Store({ checkPeriod: 86400000 }),
      cookie: {
        httpOnly: true,
        sameSite: isProd ? "none" : "lax",
        secure: isProd,
        maxAge: 1000 * 60 * 60 * 24 * 7,
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

  // ===== Auth =====
  app.post("/api/auth/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const existing = await storage.getCustomerByEmail(parsed.data.email);
    if (existing) return res.status(409).json({ message: "이미 가입된 이메일입니다." });
    const hashed = bcrypt.hashSync(parsed.data.password, 10);
    const customer = await storage.createCustomer({ ...parsed.data, password: hashed, role: "customer" });
    req.session.userId = customer.id;
    req.session.role = customer.role;
    res.json(toPublic(customer));
  });

  app.post("/api/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const customer = await storage.getCustomerByEmail(parsed.data.email);
    if (!customer || !bcrypt.compareSync(parsed.data.password, customer.password))
      return res.status(401).json({ message: "이메일 또는 비밀번호가 올바르지 않습니다." });
    req.session.userId = customer.id;
    req.session.role = customer.role;
    res.json(toPublic(customer));
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

  // 거래처 정보 수정 (배송지/결제방식 등)
  app.patch("/api/auth/me", requireAuth, async (req, res) => {
    const allowed = [
      "businessName",
      "managerName",
      "phone",
      "bizRegNo",
      "taxEmail",
      "defaultAddress",
      "paymentMethod",
    ];
    const patch: any = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    const updated = await storage.updateCustomer(req.session.userId!, patch);
    if (!updated) return res.status(404).json({ message: "사용자 없음" });
    res.json(toPublic(updated));
  });

  // ===== Products =====
  app.get("/api/products", async (_req, res) => {
    res.json(await storage.listProducts());
  });

  // ===== Orders (거래처) =====
  app.post("/api/orders", requireAuth, async (req, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const customer = await storage.getCustomer(req.session.userId!);
    if (!customer) return res.status(401).json({ message: "사용자 없음" });

    const items = parsed.data.items;
    const supplyAmount = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
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
      items: JSON.stringify(items.map((i) => ({ ...i, amount: i.unitPrice * i.qty }))),
      supplyAmount,
      vat,
      totalAmount: supplyAmount + vat,
      desiredDate: parsed.data.desiredDate ?? "",
      note: parsed.data.note ?? "",
      status: "pending",
      trackingNo: "",
      adminMemo: "",
      createdAt: Date.now(),
    });
    res.json(order);
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

  // ===== Admin =====
  // 폴링용: 새 주문 (cron 연동용 공개 형태 — 단 관리자 인증 요구)
  app.get("/api/admin/orders", requireAdmin, async (req, res) => {
    const since = req.query.since ? Number(req.query.since) : undefined;
    const orders = since ? await storage.listOrdersSince(since) : await storage.listOrders();
    res.json(orders);
  });

  app.get("/api/admin/stats", requireAdmin, async (_req, res) => {
    const orders = await storage.listOrders();
    const customers = await storage.listCustomers();
    const pending = orders.filter((o) => o.status === "pending").length;
    const totalRevenue = orders.reduce((s, o) => s + o.totalAmount, 0);

    // 월별 매출
    const monthly: Record<string, number> = {};
    for (const o of orders) {
      const d = new Date(o.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly[key] = (monthly[key] ?? 0) + o.totalAmount;
    }

    // 거래처별 누적
    const byCustomer: Record<number, { orders: number; revenue: number }> = {};
    for (const o of orders) {
      byCustomer[o.customerId] = byCustomer[o.customerId] ?? { orders: 0, revenue: 0 };
      byCustomer[o.customerId].orders += 1;
      byCustomer[o.customerId].revenue += o.totalAmount;
    }
    const customerStats = customers.map((c) => ({
      id: c.id,
      businessName: c.businessName,
      managerName: c.managerName,
      orders: byCustomer[c.id]?.orders ?? 0,
      revenue: byCustomer[c.id]?.revenue ?? 0,
    }));

    res.json({
      totalOrders: orders.length,
      pendingOrders: pending,
      totalCustomers: customers.length,
      totalRevenue,
      monthly: Object.entries(monthly)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, revenue]) => ({ month, revenue })),
      customerStats: customerStats.sort((a, b) => b.revenue - a.revenue),
    });
  });

  app.get("/api/admin/customers", requireAdmin, async (_req, res) => {
    const customers = await storage.listCustomers();
    res.json(customers.map(toPublic));
  });

  app.get("/api/admin/customers/:id", requireAdmin, async (req, res) => {
    const c = await storage.getCustomer(Number(req.params.id));
    if (!c) return res.status(404).json({ message: "거래처를 찾을 수 없습니다." });
    const orders = await storage.listOrdersByCustomer(c.id);
    res.json({ customer: toPublic(c), orders });
  });

  app.patch("/api/admin/orders/:id", requireAdmin, async (req, res) => {
    const allowed = ["status", "trackingNo", "adminMemo"];
    const patch: any = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    const updated = await storage.updateOrder(Number(req.params.id), patch);
    if (!updated) return res.status(404).json({ message: "주문 없음" });
    res.json(updated);
  });

  // 상품 관리
  app.post("/api/admin/products", requireAdmin, async (req, res) => {
    const parsed = insertProductSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    res.json(await storage.createProduct(parsed.data));
  });

  app.patch("/api/admin/products/:id", requireAdmin, async (req, res) => {
    const allowed = ["name", "category", "origin", "prices", "available", "sortOrder"];
    const patch: any = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    const updated = await storage.updateProduct(Number(req.params.id), patch);
    if (!updated) return res.status(404).json({ message: "상품 없음" });
    res.json(updated);
  });

  app.delete("/api/admin/products/:id", requireAdmin, async (req, res) => {
    await storage.deleteProduct(Number(req.params.id));
    res.json({ ok: true });
  });

  return httpServer;
}
