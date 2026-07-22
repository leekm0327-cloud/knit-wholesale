import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import session from "express-session";
import SqliteStoreFactory from "better-sqlite3-session-store";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { storage, seed, seedFixedCostItems, seedPersonalCategories, seedProductCategories, seedEspressoSetup, db, DB_PATH } from "./storage";
import { registerBoardRoutes } from "./board-routes";
import { sendNewOrderEmail, sendOrderProcessedEmail, sendOrderUpdatedEmail, sendOrderMergedEmail, sendPasswordResetEmail, sendWholesaleInquiryEmail, sendVisitRequestEmail, sendNewCustomerEmail } from "./email";
import { isKakaoConfigured, getKakaoAuthUrl, exchangeCodeForToken, getKakaoStatus, sendKakaoMemo } from "./kakao";
import { fetchWebAnalytics, isWebAnalyticsConfigured } from "./cloudflare";
import { fetchEspressoStats } from "./espressoLog";
import { encrypt, fetchZone, runVerification, sendOrderToEcount, sendPaymentToEcount, sendCustomerToEcount, sendPurchaseToEcount, __ecountLogDebug } from "./ecount";
import path from "node:path";
import fs from "node:fs";
import multer from "multer";
import {
  registerSchema,
  loginSchema,
  adminLoginSchema,
  changePasswordSchema,
  createOrderSchema,
  adminCreateOrderSchema,
  createNewsSchema,
  insertInquirySchema,
  insertVisitRequestSchema,
  VISIT_PURPOSE_LABELS,
  VISIT_STATUSES,
  updateNewsSchema,
  updateOrderItemsSchema,
  insertProductSchema,
  insertProductCategorySchema,
  insertEspressoSetupSchema,
  insertPaymentSchema,
  ecountSettingsInputSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  insertSupplierSchema,
  insertPurchaseSchema,
  insertSupplierPaymentSchema,
  purchaseItemSchema,
  insertStoreSaleSchema,
  insertFixedCostItemSchema,
  insertExpenseSchema,
  insertPersonalCategorySchema,
  insertPersonalLedgerSchema,
  SECTORS,
  customers,
  type Customer,
  type PublicCustomer,
  type PurchaseItem,
} from "@shared/schema";
import { isValidBizRegNo } from "@shared/bizRegNo";
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
  const customer = await storage.getCustomer(customerId);
  const isStore = !!(customer as any)?.isStore;
  const overrides = await storage.listCustomerPrices(customerId);
  const overrideMap = new Map(overrides.map((o) => [o.productId, o.price]));
  const items: any[] = [];
  for (const it of rawItems) {
    const prod = await storage.getProduct(it.productId);
    if (!prod) return { ok: false, message: `상품을 찾을 수 없습니다: ${it.productId}` };
    // 매장 내부 계정은 상품별 최소수량 검증도 생략(내부 소비용)
    if (!isStore) {
      const minQ = (prod as any).minOrderQty ?? 0;
      if (minQ > 0 && it.qty > 0 && it.qty < minQ) {
        return { ok: false, message: `'${prod.name}'은(는) 최소 ${minQ}개부터 주문 가능합니다. (현재 ${it.qty}개)` };
      }
    }
    // 매장 내부 계정 = 매입원가(costPrice)로 계상, 그 외 = 거래처 등록단가(override) ?? 기본가
    const unitPrice = isStore
      ? ((prod as any).costPrice ?? 0)
      : (overrideMap.get(it.productId) ?? prod.price);
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
  seedFixedCostItems();
  seedPersonalCategories();
  seedProductCategories();
  seedEspressoSetup();

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
    // B-3: 사업자등록번호 형식+체크섬 검증. 유효하면 자동승인(biz_verified=1), 아니면 승인대기(0).
    const bizVerified = isValidBizRegNo(parsed.data.bizRegNo ?? "") ? 1 : 0;
    const customer = await storage.createCustomer({ ...restData, taxEmail: parsed.data.email, password: hashed, role: "customer", bizVerified });
    // B-3: 승인 상태를 활동 로그로 기록.
    // F: 승인대기 고객 발생 시 사장님 카카오톡으로 실시간 통지 (실패해도 가입 흐름은 정상 진행).
    if (!bizVerified) {
      try {
        await sendKakaoMemo(
          `[니트커피] 새 거래처 가입 신청이 있습니다.\n상호: ${customer.businessName}\n사업자번호 미검증 → 승인 대기 중입니다.`,
          "https://wholesale.knitcoffee.co.kr/#/admin/customers",
        );
      } catch (e: any) {
        console.warn("[kakao] 가입 알림 발송 실패:", e?.message ?? e);
      }
    }
    await storage.logActivity({
      actorUserId: customer.id,
      actorEmail: customer.email,
      actorRole: "customer",
      action: "customer_register",
      targetType: "customer",
      targetId: String(customer.id),
      summary: bizVerified
        ? `신규 거래처 가입(사업자번호 검증 통과, 자동승인): ${customer.businessName}`
        : `신규 거래처 가입(사업자번호 미검증, 승인대기): ${customer.businessName}`,
    });
    // 관리자 알림 센터 + 이메일 (실패해도 가입 흐름은 정상 진행)
    storage.createNotification({
      type: "customer_register",
      title: `새 거래처 가입 · ${customer.businessName}`,
      body: bizVerified ? "자동 승인됨" : "승인 대기 (사업자번호 확인 필요)",
      link: "/admin/customers",
    }).catch((e) => console.error("[notif] 가입 알림 저장 실패:", e));
    sendNewCustomerEmail({
      businessName: customer.businessName,
      managerName: customer.managerName,
      phone: customer.phone,
      email: customer.email,
      bizRegNo: customer.bizRegNo,
      bizVerified: !!bizVerified,
    }).catch((e) => console.error("[email] 거래처 가입 알림 메일 실패:", e));
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
    // 매입금(costPrice)은 관리자만 노출. 비로그인/거래처 응답에서는 제거한다.
    const stripCost = (p: any) => {
      const { costPrice, ...rest } = p;
      return rest;
    };
    if (userId && role === "admin") {
      return res.json(
        list.map((p) => ({ ...p, effectivePrice: p.price, hasCustomPrice: false, isFavorite: false })),
      );
    }
    if (!userId) {
      return res.json(
        list.map((p) => ({ ...stripCost(p), effectivePrice: p.price, hasCustomPrice: false, isFavorite: false })),
      );
    }
    const overrides = await storage.listCustomerPrices(userId);
    const overrideMap = new Map(overrides.map((o) => [o.productId, o.price]));
    // #1 즐겨찾기 플래그
    const favs = await storage.listFavorites(userId);
    const favSet = new Set(favs.map((f) => f.productId));
    res.json(
      list.map((p) => {
        const custom = overrideMap.get(p.id);
        return {
          ...stripCost(p),
          effectivePrice: custom !== undefined ? custom : p.price,
          hasCustomPrice: custom !== undefined,
          isFavorite: favSet.has(p.id),
        };
      }),
    );
  });

  // ===== 즐겨찾기 (#1) =====
  // 내 즐겨찾기 품목 ID 목록
  app.get("/api/favorites", requireAuth, async (req, res) => {
    const favs = await storage.listFavorites(req.session.userId!);
    res.json(favs.map((f) => f.productId));
  });
  // 즐겨찾기 추가
  app.post("/api/favorites/:productId", requireAuth, async (req, res) => {
    const productId = Number(req.params.productId);
    if (!Number.isFinite(productId)) return res.status(400).json({ message: "잘못된 상품 ID" });
    const product = await storage.getProduct(productId);
    if (!product) return res.status(404).json({ message: "상품을 찾을 수 없습니다." });
    await storage.addFavorite(req.session.userId!, productId);
    res.json({ ok: true });
  });
  // 즐겨찾기 해제
  app.delete("/api/favorites/:productId", requireAuth, async (req, res) => {
    const productId = Number(req.params.productId);
    if (!Number.isFinite(productId)) return res.status(400).json({ message: "잘못된 상품 ID" });
    await storage.removeFavorite(req.session.userId!, productId);
    res.json({ ok: true });
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
      const { costPrice, ...pub } = product as any; // 매입금은 거래처에 노출하지 않음
      return res.json({
        ...pub,
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
    // A-4: 원두 카테고리 수량 합 (최소 5kg 검증용) — 카테고리 관리의 '원두(isBean)' 기준
    const beanKeys = new Set((await storage.listProductCategories()).filter((c) => c.isBean).map((c) => c.key));
    if (beanKeys.size === 0) ["blend", "decaf", "single"].forEach((k) => beanKeys.add(k)); // 방어적 폴백
    let beanQtyTotal = 0;
    const isSampleOrder = !!(parsed.data as any).isSample;
    for (const it of rawItems) {
      const prod = await storage.getProduct(it.productId);
      if (!prod) return res.status(400).json({ message: `상품을 찾을 수 없습니다: ${it.productId}` });
      const unitPrice = overrideMap.get(it.productId) ?? prod.price;
      if (beanKeys.has(prod.category)) beanQtyTotal += it.qty;
      // 상품별 최소 주문 수량 검증 (샘플 제외)
      const minQ = (prod as any).minOrderQty ?? 0;
      if (!isSampleOrder && minQ > 0 && it.qty > 0 && it.qty < minQ) {
        return res.status(400).json({ message: `'${prod.name}'은(는) 최소 ${minQ}개부터 주문 가능합니다. (현재 ${it.qty}개)` });
      }
      newItems.push({ ...it, category: prod.category, productName: prod.name, unitPrice, amount: unitPrice * it.qty });
    }

    // A-4: 도매 원두 최소 5kg(수량 5개) 검증. 샘플 주문(isSample)이면 스킵.
    //  주의: is_sample 컬럼은 B에서 추가 예정 — 아직 없을 수 있으므로 truthy일 때만 스킵(방어적).
    const isSample = (parsed.data as any).isSample;
    if (!isSample && beanQtyTotal > 0 && beanQtyTotal < 5) {
      return res.status(400).json({ message: "원두는 최소 5kg(수량 5개)부터 주문 가능합니다." });
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

      storage.createNotification({
        type: "order_merged",
        title: `주문 추가 · ${customer.businessName}`,
        body: `${todayPending.orderNo} · 총 ${newTotalAmount.toLocaleString("ko-KR")}원`,
        link: `/admin/orders/${todayPending.id}`,
      }).catch((e) => console.error("[notif] 주문추가 알림 저장 실패:", e));

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

    // F: 새 도매 주문 발생 시 사장님 카카오톡 알림 (이메일 알림과 병행, 실패해도 흐름 정상 진행)
    sendKakaoMemo(
      `[니트커피] 새 도매 주문이 접수되었습니다.\n주문번호: ${order.orderNo}\n거래처: ${customer.businessName}\n금액: ${(supplyAmount + vat).toLocaleString("ko-KR")}원`,
      "https://wholesale.knitcoffee.co.kr/#/admin",
    ).catch((e) => console.warn("[kakao] 주문 알림 발송 실패:", e?.message ?? e));

    storage.createNotification({
      type: "order_new",
      title: `새 주문 · ${customer.businessName}`,
      body: `${order.orderNo} · 총 ${(supplyAmount + vat).toLocaleString("ko-KR")}원`,
      link: `/admin/orders/${order.id}`,
    }).catch((e) => console.error("[notif] 신규주문 알림 저장 실패:", e));

    res.json({ ...order, merged: false, orderId: order.id });
  });

  // ② 관리자 대리 주문 생성 (requireAdmin: owner + manager)
  //  - 거래처(customerId)를 지정해 관리자가 대신 주문 생성. 거래처 등록단가(customerPrices) 자동 적용.
  //  - 신규 주문과 동일하게 'pending'(접수)로 생성. 처리완료→자동발주 훅은 여기서 연동하지 않음(수동 전환 시 동작).
  //  - 고객 세션 기반 POST /api/orders 흐름은 건드리지 않는 별도 엔드포인트.
  app.post("/api/admin/orders", requireAdmin, async (req, res) => {
    const parsed = adminCreateOrderSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const customer = await storage.getCustomer(parsed.data.customerId);
    if (!customer) return res.status(404).json({ message: "거래처를 찾을 수 없습니다." });

    // 거래처 등록단가로 금액 재계산 (기존 서버 로직 재사용, 중복 구현 금지)
    const recomputed = await recomputeOrderItems(customer.id, parsed.data.items);
    if (!recomputed.ok) return res.status(400).json({ message: recomputed.message });

    // A-4: 도매 원두 최소 5kg(수량 5개) 검증 — 카테고리 관리의 '원두(isBean)' 기준
    const beanKeys2 = new Set((await storage.listProductCategories()).filter((c) => c.isBean).map((c) => c.key));
    if (beanKeys2.size === 0) ["blend", "decaf", "single"].forEach((k) => beanKeys2.add(k));
    const beanQtyTotal = recomputed.items
      .filter((i: any) => beanKeys2.has(i.category))
      .reduce((s: number, i: any) => s + i.qty, 0);
    // 매장 내부 계정은 도매 최소주문(5kg) 규칙에서 제외 (내부 소비용)
    if (!(customer as any).isStore && beanQtyTotal > 0 && beanQtyTotal < 5)
      return res.status(400).json({ message: "원두는 최소 5kg(수량 5개)부터 주문 가능합니다." });

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
      items: JSON.stringify(recomputed.items),
      supplyAmount: recomputed.supplyAmount,
      vat: recomputed.vat,
      totalAmount: recomputed.totalAmount,
      desiredDate: parsed.data.desiredDate ?? "",
      note: parsed.data.note ?? "",
      status: "pending",
      trackingNo: "",
      adminMemo: "",
      quickRequest: parsed.data.quickRequest ? 1 : 0,
      createdAt: Date.now(),
    });

    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "order.admin_create",
      targetType: "order",
      targetId: String(order.id),
      summary: `관리자 대리 주문 생성 (거래처: ${customer.businessName})`,
    });

    res.json({ ...order, orderId: order.id });
  });

  // ===== B-2: 샘플 신청 =====
  // 샘플 신청 자격 조회. eligible=true면 신청 가능.
  app.get("/api/sample/eligibility", requireAuth, async (req, res) => {
    const customer = await storage.getCustomer(req.session.userId!);
    if (!customer) return res.status(401).json({ message: "사용자 없음" });
    const bizVerified = customer.bizVerified === 1;
    // 이미 샘플 주문이 있는지 확인 (sampleUsed 플래그 + 실제 주문 이중 확인)
    const myOrders = await storage.listOrdersByCustomer(customer.id);
    const alreadyUsed = customer.sampleUsed === 1 || myOrders.some((o) => o.isSample === 1);
    let reason = "";
    if (!bizVerified) reason = "사업자 승인 후 샘플 신청이 가능합니다.";
    else if (alreadyUsed) reason = "이미 샘플을 신청하셨습니다. 샘플은 1회만 제공됩니다.";
    res.json({ eligible: bizVerified && !alreadyUsed, bizVerified, alreadyUsed, reason });
  });

  // 샘플 신청 — 원두 최대 2종, 각 1kg 고정, 무료(total 0). 승인+미사용 고객만.
  app.post("/api/sample/request", requireAuth, async (req, res) => {
    const customer = await storage.getCustomer(req.session.userId!);
    if (!customer) return res.status(401).json({ message: "사용자 없음" });
    if (customer.bizVerified !== 1)
      return res.status(403).json({ message: "사업자 승인 후 샘플 신청이 가능합니다." });

    const myOrders = await storage.listOrdersByCustomer(customer.id);
    if (customer.sampleUsed === 1 || myOrders.some((o) => o.isSample === 1))
      return res.status(400).json({ message: "이미 샘플을 신청하셨습니다. 샘플은 1회만 제공됩니다." });

    const productIds: unknown = req.body?.productIds;
    if (!Array.isArray(productIds) || productIds.length < 1)
      return res.status(400).json({ message: "샘플 받을 원두를 1종 이상 선택해 주세요." });
    if (productIds.length > 2)
      return res.status(400).json({ message: "샘플은 최대 2종까지 신청할 수 있습니다." });

    // 중복 제거 및 샘플 대상 카테고리 검증 — 카테고리 관리의 '샘플 대상(sampleEligible)' 기준
    const sampleKeys = new Set((await storage.listProductCategories()).filter((c) => c.sampleEligible).map((c) => c.key));
    if (sampleKeys.size === 0) ["blend", "decaf"].forEach((k) => sampleKeys.add(k)); // 방어적 폴백
    const uniqueIds = Array.from(new Set(productIds.map((x) => Number(x))));
    const items: any[] = [];
    for (const pid of uniqueIds) {
      const prod = await storage.getProduct(pid);
      if (!prod) return res.status(400).json({ message: `상품을 찾을 수 없습니다: ${pid}` });
      if (!sampleKeys.has(prod.category))
        return res.status(400).json({ message: "샘플 신청이 가능한 카테고리의 상품이 아닙니다." });
      // 각 1kg(수량 1) 고정, 무료(단가 0)
      items.push({ productId: prod.id, name: prod.name, category: prod.category, unitPrice: 0, qty: 1, amount: 0 });
    }

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
      items: JSON.stringify(items),
      supplyAmount: 0,
      vat: 0,
      totalAmount: 0,
      desiredDate: "",
      note: "샘플 신청",
      status: "pending",
      isSample: 1,
      trackingNo: "",
      adminMemo: "",
      quickRequest: 0,
      createdAt: Date.now(),
    });

    // 승인 고객당 1회 제한 → sampleUsed 플래그 세팅
    await storage.updateCustomer(customer.id, { sampleUsed: 1 });

    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "sample_request",
      targetType: "order",
      targetId: String(order.id),
      summary: `샘플 신청: ${customer.businessName} (${items.map((i) => i.name).join(", ")})`,
    });

    res.json({ ...order, orderId: order.id });
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
    // 취소된 주문은 매출·집계에서 제외 (금액/건수 모두 실제 유효 주문 기준)
    const activeOrders = allOrders.filter((o) => o.status !== "cancelled");
    const pending = allOrders.filter((o) => o.status === "pending").length;
    const totalRevenue = activeOrders.reduce((s, o) => s + o.totalAmount, 0);

    const monthly: Record<string, number> = {};
    for (const o of activeOrders) {
      const d = new Date(o.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly[key] = (monthly[key] ?? 0) + o.totalAmount;
    }

    const byCustomer: Record<number, { orders: number; revenue: number }> = {};
    for (const o of activeOrders) {
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
      totalOrders: activeOrders.length,
      pendingOrders: pending,
      totalCustomers: allCustomers.length,
      totalRevenue,
      monthly: Object.entries(monthly)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, revenue]) => ({ month, revenue })),
      customerStats: customerStats.sort((a, b) => b.revenue - a.revenue),
    });
  });

  // 방문자 통계 (Cloudflare Web Analytics)
  app.get("/api/admin/web-analytics", requireOwner, async (req, res) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
    try {
      const data = await fetchWebAnalytics(days);
      res.json(data);
    } catch (e: any) {
      res.json({ configured: isWebAnalyticsConfigured(), error: e?.message ?? "통계 조회에 실패했습니다." });
    }
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
    const isStore = req.body.isStore ? 1 : 0;
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
      isStore,
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
      // 매장 내부 계정은 ECOUNT 거래처로 자동 등록하지 않음(동일 사업자 → 거래처코드 충돌 방지)
      if (settings && settings.autoSendCustomer && cleanBizNo && !isStore) {
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
    // 매장 내부 계정 토글
    if ("isStore" in req.body) patch.isStore = req.body.isStore ? 1 : 0;
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

  // B-3: 샘플(사업자) 수동 승인 — biz_verified=1 로 세팅. 직원도 가능(requireAdmin).
  app.patch("/api/admin/customers/:id/approve-sample", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const customer = await storage.getCustomer(id);
    if (!customer) return res.status(404).json({ message: "거래처 없음" });
    const updated = await storage.updateCustomer(id, { bizVerified: 1 });
    if (!updated) return res.status(404).json({ message: "거래처 없음" });
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "customer.approve_sample",
      targetType: "customer",
      targetId: String(id),
      summary: `거래처 '${updated.businessName}' 사업자 승인(샘플 신청 허용)`,
    });
    // F: 승인 완료 시 사장님 카카오톡 알림 (실패해도 흐름 정상 진행)
    sendKakaoMemo(
      `[니트커피] 거래처 사업자 승인 완료\n상호: ${updated.businessName}\n이제 정상 주문/샘플 신청이 가능합니다.`,
      "https://wholesale.knitcoffee.co.kr/#/admin/customers",
    ).catch((e) => console.warn("[kakao] 승인 알림 발송 실패:", e?.message ?? e));
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

  // ===== OEM 공장 채무: 공급처 / 발주 / 지급 (모두 requireAdmin — 직원도 입력 가능) =====
  app.get("/api/admin/suppliers", requireAdmin, async (_req, res) => {
    res.json(await storage.listSuppliers());
  });

  app.post("/api/admin/suppliers", requireAdmin, async (req, res) => {
    const parsed = insertSupplierSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const supplier = await storage.createSupplier(parsed.data);
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "supplier.create",
      targetType: "supplier",
      targetId: String(supplier.id),
      summary: `공급처 '${supplier.name}' 등록`,
    });
    res.json(supplier);
  });

  app.patch("/api/admin/suppliers/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const allowed = ["name", "contact", "phone", "ecountCode", "memo"];
    const patch: any = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    const updated = await storage.updateSupplier(id, patch);
    if (!updated) return res.status(404).json({ message: "공급처를 찾을 수 없습니다." });
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "supplier.update",
      targetType: "supplier",
      targetId: String(id),
      summary: `공급처 '${updated.name}' 수정`,
    });
    res.json(updated);
  });

  app.delete("/api/admin/suppliers/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const supplier = await storage.getSupplier(id);
    if (!supplier) return res.status(404).json({ message: "공급처를 찾을 수 없습니다." });
    const actor = await getActor(req);
    await storage.deleteSupplier(id);
    await storage.logActivity({
      ...actor,
      action: "supplier.delete",
      targetType: "supplier",
      targetId: String(id),
      summary: `공급처 '${supplier.name}' 삭제`,
    });
    res.json({ ok: true });
  });

  app.get("/api/admin/purchases", requireAdmin, async (req, res) => {
    const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
    const list = await storage.listPurchases(Number.isFinite(supplierId!) ? supplierId : undefined);
    // 자동발주의 출처(어떤 거래처 주문에서 생성됐는지) 부착 — order.autoPurchaseId 로 매칭
    const orders = await storage.listOrders();
    const byAutoPurchase = new Map<number, (typeof orders)[number]>();
    for (const o of orders) {
      if (o.autoPurchaseId) byAutoPurchase.set(o.autoPurchaseId, o);
    }
    const enriched = list.map((p) => {
      const o = byAutoPurchase.get(p.id);
      let sourceCustomer = "";
      let sourceOrderNo = "";
      if (o) {
        sourceOrderNo = o.orderNo;
        try {
          sourceCustomer = JSON.parse(o.customerSnapshot)?.businessName ?? "";
        } catch {}
      }
      return { ...p, sourceCustomer, sourceOrderNo };
    });
    res.json(enriched);
  });

  // 매입단가 자동채움용
  app.get("/api/admin/purchases/last-price", requireAdmin, async (req, res) => {
    const supplierId = Number(req.query.supplierId);
    const productId = req.query.productId ? Number(req.query.productId) : null;
    const name = typeof req.query.name === "string" ? req.query.name : "";
    if (!Number.isFinite(supplierId)) return res.status(400).json({ message: "공급처 ID가 필요합니다." });
    const unitPrice = await storage.lastPurchaseUnitPrice(supplierId, {
      productId: productId != null && Number.isFinite(productId) ? productId : null,
      name,
    });
    res.json({ unitPrice });
  });

  app.post("/api/admin/purchases", requireAdmin, async (req, res) => {
    const parsed = insertPurchaseSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const supplier = await storage.getSupplier(parsed.data.supplierId);
    if (!supplier) return res.status(404).json({ message: "공급처를 찾을 수 없습니다." });
    // amount는 신뢰하지 않고 서버에서 재계산
    const items: PurchaseItem[] = parsed.data.items.map((it) => ({
      productId: it.productId ?? null,
      name: it.name,
      qty: it.qty,
      unitPrice: it.unitPrice,
      amount: Math.round(it.qty * it.unitPrice),
    }));
    const totalAmount = items.reduce((s, i) => s + i.amount, 0);
    const purchase = await storage.createPurchase({
      supplierId: parsed.data.supplierId,
      purchaseDate: parsed.data.purchaseDate,
      memo: parsed.data.memo ?? "",
      items,
      totalAmount,
      segment: parsed.data.segment ?? "wholesale",
    });
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "purchase.create",
      targetType: "purchase",
      targetId: String(purchase.id),
      summary: `${supplier.name} 발주 ${purchase.purchaseNo} 등록 (${totalAmount}원)`,
    });
    res.json(purchase);
  });

  // 발주 수정 (품목/공급처/발주일/메모 전체 교체 — 채무는 발주 합계에서 자동 파생되므로 재계산 불필요)
  app.patch("/api/admin/purchases/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const existing = await storage.getPurchase(id);
    if (!existing) return res.status(404).json({ message: "발주 내역을 찾을 수 없습니다." });
    const parsed = insertPurchaseSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const supplier = await storage.getSupplier(parsed.data.supplierId);
    if (!supplier) return res.status(404).json({ message: "공급처를 찾을 수 없습니다." });
    // amount는 신뢰하지 않고 서버에서 재계산
    const items: PurchaseItem[] = parsed.data.items.map((it) => ({
      productId: it.productId ?? null,
      name: it.name,
      qty: it.qty,
      unitPrice: it.unitPrice,
      amount: Math.round(it.qty * it.unitPrice),
    }));
    const totalAmount = items.reduce((s, i) => s + i.amount, 0);
    const updated = await storage.updatePurchase(id, {
      supplierId: parsed.data.supplierId,
      purchaseDate: parsed.data.purchaseDate,
      memo: parsed.data.memo ?? "",
      items,
      totalAmount,
    });
    if (!updated) return res.status(404).json({ message: "발주 내역을 찾을 수 없습니다." });
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "purchase.update",
      targetType: "purchase",
      targetId: String(id),
      summary: `발주 ${existing.purchaseNo} 수정 (${totalAmount}원)`,
    });
    res.json(updated);
  });

  app.delete("/api/admin/purchases/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const purchase = await storage.getPurchase(id);
    if (!purchase) return res.status(404).json({ message: "발주 내역을 찾을 수 없습니다." });
    const actor = await getActor(req);
    await storage.deletePurchase(id);
    await storage.logActivity({
      ...actor,
      action: "purchase.delete",
      targetType: "purchase",
      targetId: String(id),
      summary: `발주 ${purchase.purchaseNo} 삭제`,
    });
    res.json({ ok: true });
  });

  app.get("/api/admin/supplier-payments", requireAdmin, async (req, res) => {
    const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
    res.json(await storage.listSupplierPayments(Number.isFinite(supplierId!) ? supplierId : undefined));
  });

  app.post("/api/admin/supplier-payments", requireAdmin, async (req, res) => {
    const parsed = insertSupplierPaymentSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const supplier = await storage.getSupplier(parsed.data.supplierId);
    if (!supplier) return res.status(404).json({ message: "공급처를 찾을 수 없습니다." });
    const payment = await storage.createSupplierPayment(parsed.data);
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "supplier_payment.create",
      targetType: "supplier",
      targetId: String(supplier.id),
      summary: `${supplier.name} 지급 ${parsed.data.amount}원 등록`,
    });
    res.json(payment);
  });

  app.delete("/api/admin/supplier-payments/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const actor = await getActor(req);
    await storage.deleteSupplierPayment(id);
    await storage.logActivity({
      ...actor,
      action: "supplier_payment.delete",
      targetType: "supplier_payment",
      targetId: String(id),
      summary: `공장 지급 내역 #${id} 삭제`,
    });
    res.json({ ok: true });
  });

  app.get("/api/admin/supplier-balances", requireAdmin, async (_req, res) => {
    const balances = await storage.getSupplierBalances();
    const totalOutstanding = balances.reduce((s, b) => s + Math.max(0, b.balance), 0);
    const totalPurchased = balances.reduce((s, b) => s + b.totalPurchased, 0);
    const totalPaid = balances.reduce((s, b) => s + b.totalPaid, 0);
    // 이번 달(KST) 발주/지급 집계
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const allPurchases = await storage.listPurchases();
    const allPayments = await storage.listSupplierPayments();
    const monthPurchased = allPurchases
      .filter((p) => p.createdAt >= monthStart)
      .reduce((s, p) => s + p.totalAmount, 0);
    const monthPaid = allPayments
      .filter((p) => (p.paidAt ?? "").slice(0, 7) === ym)
      .reduce((s, p) => s + p.amount, 0);
    res.json({
      totalOutstanding,
      totalPurchased,
      totalPaid,
      monthPurchased,
      monthPaid,
      balances: balances.sort((a, b) => b.balance - a.balance),
    });
  });

  app.get("/api/admin/suppliers/:id/ledger", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const ledger = await storage.getSupplierLedger(id);
    if (!ledger.balance) return res.status(404).json({ message: "공급처를 찾을 수 없습니다." });
    const supplierPaymentRows = await storage.listSupplierPayments(id);
    res.json({ ...ledger, payments: supplierPaymentRows });
  });

  // ===== 경영 대시보드 (C) =====
  // 매장매출 (직원도 입력 가능 — requireAdmin)
  app.get("/api/admin/store-sales", requireOwner, async (req, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    res.json(await storage.listStoreSales(from, to));
  });

  app.post("/api/admin/store-sales", requireOwner, async (req, res) => {
    const parsed = insertStoreSaleSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const sale = await storage.upsertStoreSale(parsed.data);
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "store_sale.upsert",
      targetType: "store_sale",
      targetId: String(sale.id),
      summary: `매장매출 ${sale.saleDate} ${sale.amount}원 등록/수정`,
    });
    res.json(sale);
  });

  app.delete("/api/admin/store-sales/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const actor = await getActor(req);
    await storage.deleteStoreSale(id);
    await storage.logActivity({
      ...actor,
      action: "store_sale.delete",
      targetType: "store_sale",
      targetId: String(id),
      summary: `매장매출 #${id} 삭제`,
    });
    res.json({ ok: true });
  });

  // 고정비 항목: 경영·재무 전용이므로 조회·정의 모두 requireOwner
  app.get("/api/admin/fixed-cost-items", requireOwner, async (req, res) => {
    const includeInactive = req.query.includeInactive === "true";
    res.json(await storage.listFixedCostItems(includeInactive));
  });

  app.post("/api/admin/fixed-cost-items", requireOwner, async (req, res) => {
    const parsed = insertFixedCostItemSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const item = await storage.createFixedCostItem(parsed.data);
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "fixed_cost_item.create",
      targetType: "fixed_cost_item",
      targetId: String(item.id),
      summary: `고정비 항목 '${item.name}' 추가`,
    });
    res.json(item);
  });

  app.patch("/api/admin/fixed-cost-items/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    const patch: any = {};
    if (typeof req.body.name === "string") patch.name = req.body.name;
    if (typeof req.body.sortOrder === "number") patch.sortOrder = req.body.sortOrder;
    if (typeof req.body.active === "number") patch.active = req.body.active;
    const item = await storage.updateFixedCostItem(id, patch);
    if (!item) return res.status(404).json({ message: "항목을 찾을 수 없습니다." });
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "fixed_cost_item.update",
      targetType: "fixed_cost_item",
      targetId: String(id),
      summary: `고정비 항목 '${item.name}' 수정`,
    });
    res.json(item);
  });

  app.delete("/api/admin/fixed-cost-items/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const actor = await getActor(req);
    await storage.deleteFixedCostItem(id);
    await storage.logActivity({
      ...actor,
      action: "fixed_cost_item.delete",
      targetType: "fixed_cost_item",
      targetId: String(id),
      summary: `고정비 항목 #${id} 삭제`,
    });
    res.json({ ok: true });
  });

  // 지출 (직원도 입력 가능 — requireAdmin)
  app.get("/api/admin/expenses", requireOwner, async (req, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    res.json(await storage.listExpenses(from, to));
  });

  app.post("/api/admin/expenses", requireOwner, async (req, res) => {
    const parsed = insertExpenseSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const expense = await storage.createExpense(parsed.data);
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "expense.create",
      targetType: "expense",
      targetId: String(expense.id),
      summary: `지출 ${expense.category} ${expense.amount}원 등록`,
    });
    res.json(expense);
  });

  app.patch("/api/admin/expenses/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const parsed = insertExpenseSchema.partial().safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const expense = await storage.updateExpense(id, parsed.data);
    if (!expense) return res.status(404).json({ message: "지출 내역을 찾을 수 없습니다." });
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "expense.update",
      targetType: "expense",
      targetId: String(id),
      summary: `지출 #${id} 수정 → ${expense.category} ${expense.amount}원`,
    });
    res.json(expense);
  });

  app.delete("/api/admin/expenses/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const actor = await getActor(req);
    await storage.deleteExpense(id);
    await storage.logActivity({
      ...actor,
      action: "expense.delete",
      targetType: "expense",
      targetId: String(id),
      summary: `지출 #${id} 삭제`,
    });
    res.json({ ok: true });
  });

  // 손익 대시보드 요약 — 사장님(owner) 전용
  app.get("/api/admin/dashboard/summary", requireOwner, async (req, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    const g = typeof req.query.granularity === "string" ? req.query.granularity : "day";
    if (!from || !to) return res.status(400).json({ message: "기간(from, to)이 필요합니다." });
    const granularity = (["day", "week", "month", "year"].includes(g) ? g : "day") as
      | "day"
      | "week"
      | "month"
      | "year";
    const s = typeof req.query.sector === "string" ? req.query.sector : "all";
    const sector = (s === "all" || (SECTORS as readonly string[]).includes(s) ? s : "all") as
      | "all"
      | (typeof SECTORS)[number];
    res.json(await storage.getDashboardSummary(from, to, granularity, sector));
  });

  // 재무제표 (업종별 손익계산서 + 채권·채무 요약) — 소유자 전용
  app.get("/api/admin/financial-statement", requireOwner, async (req, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    if (!from || !to) return res.status(400).json({ message: "기간(from, to)이 필요합니다." });
    res.json(await storage.getFinancialStatement(from, to));
  });

  // 에스프레소 추출 로그 집계 (공개) — 게시된 구글시트 기반
  app.get("/api/espresso-log-stats", async (_req, res) => {
    res.json(await fetchEspressoStats());
  });

  // 에스프레소 추출 환경 (공개 조회, 관리자 수정)
  app.get("/api/espresso-setup", async (_req, res) => {
    res.json(await storage.listEspressoSetup());
  });
  app.post("/api/admin/espresso-setup", requireAdmin, async (req, res) => {
    const parsed = insertEspressoSetupSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const existing = await storage.listEspressoSetup();
    const maxOrder = existing.reduce((m, c) => Math.max(m, c.sortOrder), -1);
    const item = await storage.createEspressoSetup({ ...parsed.data, sortOrder: parsed.data.sortOrder ?? maxOrder + 1 });
    res.json(item);
  });
  app.patch("/api/admin/espresso-setup/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const patch: Record<string, any> = {};
    if (typeof req.body.icon === "string") patch.icon = req.body.icon;
    if (typeof req.body.label === "string") patch.label = req.body.label.trim();
    if (typeof req.body.value === "string") patch.value = req.body.value;
    if (typeof req.body.sortOrder === "number") patch.sortOrder = req.body.sortOrder;
    if (patch.label === "") return res.status(400).json({ message: "카테고리명을 입력해 주세요." });
    const item = await storage.updateEspressoSetup(id, patch);
    if (!item) return res.status(404).json({ message: "항목을 찾을 수 없습니다." });
    res.json(item);
  });
  app.delete("/api/admin/espresso-setup/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    await storage.deleteEspressoSetup(id);
    res.json({ ok: true });
  });
  app.post("/api/admin/espresso-setup/reorder", requireAdmin, async (req, res) => {
    const ids = req.body?.orderedIds;
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== "number"))
      return res.status(400).json({ message: "orderedIds 배열이 필요합니다." });
    await storage.reorderEspressoSetup(ids);
    res.json({ ok: true });
  });

  // 품목별 기간 집계 (주문/발주) — 직원도 조회 가능
  app.get("/api/admin/orders/item-summary", requireAdmin, async (req, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    if (!from || !to) return res.status(400).json({ message: "기간(from, to)이 필요합니다." });
    res.json(await storage.getOrderItemSummary(from, to));
  });
  app.get("/api/admin/purchases/item-summary", requireAdmin, async (req, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    if (!from || !to) return res.status(400).json({ message: "기간(from, to)이 필요합니다." });
    res.json(await storage.getPurchaseItemSummary(from, to));
  });

  // ===== E: 개인 가계부 (owner 전용, 사업 재무와 완전 분리) =====
  app.get("/api/personal-categories", requireOwner, async (_req, res) => {
    res.json(await storage.listPersonalCategories());
  });

  app.post("/api/personal-categories", requireOwner, async (req, res) => {
    const parsed = insertPersonalCategorySchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const cat = await storage.createPersonalCategory(parsed.data);
    res.json(cat);
  });

  app.delete("/api/personal-categories/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    await storage.deletePersonalCategory(id);
    res.json({ ok: true });
  });

  app.get("/api/personal-ledger", requireOwner, async (req, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    res.json(await storage.listPersonalLedger(from, to));
  });

  app.post("/api/personal-ledger", requireOwner, async (req, res) => {
    const parsed = insertPersonalLedgerSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const entry = await storage.createPersonalLedger(parsed.data);
    res.json(entry);
  });

  app.patch("/api/personal-ledger/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const parsed = insertPersonalLedgerSchema.partial().safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const entry = await storage.updatePersonalLedger(id, parsed.data);
    if (!entry) return res.status(404).json({ message: "항목을 찾을 수 없습니다." });
    res.json(entry);
  });

  app.delete("/api/personal-ledger/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    await storage.deletePersonalLedger(id);
    res.json({ ok: true });
  });

  app.get("/api/personal-ledger/summary", requireOwner, async (req, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    if (!from || !to) return res.status(400).json({ message: "기간(from, to)이 필요합니다." });
    res.json(await storage.getPersonalSummary(from, to));
  });

  // ===== F: 카카오톡 "나에게 보내기" 알림 연동 =====
  // OAuth 인가 시작 — 사장님을 카카오 로그인으로 리다이렉트
  app.get("/oauth/kakao/login", requireOwner, (_req, res) => {
    if (!isKakaoConfigured())
      return res.status(400).json({ message: "카카오 환경변수가 설정되지 않았습니다." });
    res.redirect(getKakaoAuthUrl());
  });

  // OAuth 콜백 — 인가 코드로 토큰 발급 후 관리자 화면으로 이동
  // 주의: wouter useHashLocation은 해시경로에 쿼리스트링이 붙으면 라우트 매칭에 실패(404)하므로
  // 성공·실패 모두 쿼리 없이 `/#/admin/kakao` 로만 리다이렉트한다. 연동 상태는 화면에서 status 재조회로 표시.
  app.get("/oauth/kakao/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (code) {
      try {
        await exchangeCodeForToken(code);
      } catch (e: any) {
        console.warn("[kakao] 콜백 토큰 발급 실패:", e?.message ?? e);
      }
    }
    res.redirect("/#/admin/kakao");
  });

  app.get("/api/admin/kakao/status", requireOwner, async (_req, res) => {
    res.json(await getKakaoStatus());
  });

  app.post("/api/admin/kakao/test", requireOwner, async (_req, res) => {
    const ok = await sendKakaoMemo(
      "[니트커피] 카카오톡 알림 연동 테스트입니다. 이 메시지가 보이면 정상 연동되었습니다.",
    );
    res.json({ ok });
  });

  app.patch("/api/admin/orders/:id", requireAdmin, async (req, res) => {
    const allowed = ["status", "trackingNo", "adminMemo", "desiredDate", "note", "quickRequest", "ecountDate"];
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

        // A-3: pending → done 전환 시 클라리멘토(대표 공급처)에 원두 자동발주 등록
        //  - skipAutoPurchase=true 이면 생략, 이미 자동발주된 주문(autoPurchaseId 존재)이면 재생성 안 함
        const skipAutoPurchase = req.body.skipAutoPurchase === true;
        if (!skipAutoPurchase && order.status === "pending" && !updated.autoPurchaseId) {
          try {
            const supplier = await storage.getPrimarySupplier();
            if (supplier) {
              let orderItems: any[] = [];
              try { orderItems = JSON.parse(updated.items); } catch { /* noop */ }
              const autoBeanKeys = new Set((await storage.listProductCategories()).filter((c) => c.isBean).map((c) => c.key));
              if (autoBeanKeys.size === 0) ["blend", "decaf", "single"].forEach((k) => autoBeanKeys.add(k));
              const beanItems = orderItems.filter((it) => autoBeanKeys.has(it.category));
              if (beanItems.length > 0) {
                const purchaseItems: PurchaseItem[] = [];
                for (const it of beanItems) {
                  const productId = typeof it.productId === "number" ? it.productId : null;
                  const name = it.productName ?? it.name ?? "";
                  const lastPrice = await storage.lastPurchaseUnitPrice(supplier.id, { productId, name });
                  const unitPrice = lastPrice ?? 0;
                  const qty = it.qty;
                  purchaseItems.push({
                    productId,
                    name,
                    qty,
                    unitPrice,
                    amount: Math.round(qty * unitPrice),
                  });
                }
                const totalAmount = purchaseItems.reduce((s, i) => s + i.amount, 0);
                const today = new Date();
                const purchaseDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                // 매장 내부 계정의 주문이면 발주 부문을 'store'(매장 매출원가)로 태그
                const orderCust = await storage.getCustomer(updated.customerId);
                const purchaseSegment = (orderCust as any)?.isStore ? "store" : "wholesale";
                const purchase = await storage.createPurchase({
                  supplierId: supplier.id,
                  purchaseDate,
                  items: purchaseItems,
                  totalAmount,
                  memo: `거래처주문 ${updated.orderNo} 자동발주`,
                  segment: purchaseSegment,
                });
                await storage.updateOrder(updated.id, { autoPurchaseId: purchase.id });
                const actor = await getActor(req);
                await storage.logActivity({
                  ...actor,
                  action: "purchase.auto_create",
                  targetType: "purchase",
                  targetId: String(purchase.id),
                  summary: `주문 #${updated.orderNo} 처리완료 → ${supplier.name} 자동발주 ${purchase.purchaseNo}`,
                });
              }
            }
          } catch (e) {
            console.error("[auto-purchase] 자동발주 실패:", e);
          }
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

    // 발생주의 연동: 이 주문으로 자동 생성된 공장 발주가 있으면 함께 삭제한다.
    //  → 발주가 사라지면 대시보드의 홀세일 지출(공장 매입)에서도 자동으로 빠진다.
    let removedPurchaseNo = "";
    if (order.autoPurchaseId) {
      try {
        const linked = await storage.getPurchase(order.autoPurchaseId);
        removedPurchaseNo = linked?.purchaseNo ?? "";
        await storage.deletePurchase(order.autoPurchaseId);
      } catch { /* 이미 삭제된 발주면 무시 */ }
      await storage.updateOrder(id, { autoPurchaseId: null });
    }

    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "order.admin_cancel",
      targetType: "order",
      targetId: String(updated.id),
      summary: `관리자가 주문 #${updated.orderNo} 취소${removedPurchaseNo ? ` (연결 발주 ${removedPurchaseNo} 삭제)` : ""}`,
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
    const allowed = ["name", "category", "origin", "price", "costPrice", "available", "minOrderQty", "sortOrder", "ecountCode", "detailTemplate", "detailJson", "detailImages"];
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

  // ===== 상품 카테고리 (조회는 공개, 관리는 소유자 전용) =====
  app.get("/api/product-categories", async (_req, res) => {
    res.json(await storage.listProductCategories());
  });

  app.post("/api/admin/product-categories", requireOwner, async (req, res) => {
    const parsed = insertProductCategorySchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const existing = await storage.listProductCategories();
    if (existing.some((c) => c.key === parsed.data.key))
      return res.status(400).json({ message: "이미 존재하는 코드값입니다." });
    // 새 카테고리는 기본적으로 맨 뒤 순서로
    const maxOrder = existing.reduce((m, c) => Math.max(m, c.sortOrder), -1);
    const cat = await storage.createProductCategory({ ...parsed.data, sortOrder: parsed.data.sortOrder ?? maxOrder + 1 });
    res.json(cat);
  });

  app.patch("/api/admin/product-categories/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const patch: Record<string, any> = {};
    if (typeof req.body.label === "string") patch.label = req.body.label.trim();
    if (typeof req.body.sortOrder === "number") patch.sortOrder = req.body.sortOrder;
    if (typeof req.body.isBean === "boolean") patch.isBean = req.body.isBean ? 1 : 0;
    if (typeof req.body.sampleEligible === "boolean") patch.sampleEligible = req.body.sampleEligible ? 1 : 0;
    if (typeof req.body.active === "boolean") patch.active = req.body.active ? 1 : 0;
    if (patch.label === "") return res.status(400).json({ message: "표시명을 입력해 주세요." });
    // 코드값(key)은 상품이 참조하므로 수정 불가
    const cat = await storage.updateProductCategory(id, patch);
    if (!cat) return res.status(404).json({ message: "카테고리를 찾을 수 없습니다." });
    res.json(cat);
  });

  app.delete("/api/admin/product-categories/:id", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const cats = await storage.listProductCategories();
    const target = cats.find((c) => c.id === id);
    if (!target) return res.status(404).json({ message: "카테고리를 찾을 수 없습니다." });
    // 해당 카테고리를 쓰는 상품이 있으면 삭제 차단 (상품을 먼저 다른 카테고리로 옮겨야 함)
    const products = await storage.listProducts();
    const inUse = products.filter((p) => p.category === target.key).length;
    if (inUse > 0)
      return res.status(400).json({
        message: `이 카테고리를 쓰는 상품이 ${inUse}개 있습니다. 상품을 먼저 다른 카테고리로 바꾼 뒤 삭제해 주세요. (임시로 숨기려면 '표시'를 꺼주세요.)`,
      });
    await storage.deleteProductCategory(id);
    res.json({ ok: true });
  });

  app.post("/api/admin/product-categories/reorder", requireOwner, async (req, res) => {
    const ids = req.body?.orderedIds;
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== "number"))
      return res.status(400).json({ message: "orderedIds 배열이 필요합니다." });
    await storage.reorderProductCategories(ids);
    res.json({ ok: true });
  });

  // ===== 매니저 관리 (#9) =====
  app.get("/api/admin/managers", requireAdmin, async (_req, res) => {
    const admins = await storage.listAdmins();
    res.json(admins.map(toPublic));
  });

  app.post("/api/admin/managers", requireOwner, async (req, res) => {
    const { email, password, phone } = req.body;
    const name = req.body.name ?? req.body.managerName; // 클라이언트가 managerName으로 보냄
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
    const nm = req.body.name ?? req.body.managerName; // 생성/수정 모두 managerName 사용
    if (nm) patch.managerName = nm;
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

  // ===== 관리자 알림 센터 =====
  app.get("/api/admin/notifications", requireAdmin, async (_req, res) => {
    const items = await storage.listNotifications(30);
    const unread = await storage.countUnreadNotifications();
    res.json({ items, unread });
  });
  app.post("/api/admin/notifications/:id/read", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    await storage.markNotificationRead(id);
    res.json({ ok: true });
  });
  app.post("/api/admin/notifications/read-all", requireAdmin, async (_req, res) => {
    await storage.markAllNotificationsRead();
    res.json({ ok: true });
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

  // 발주(매입) → ECOUNT 구매입력 전송
  app.post("/api/admin/ecount/purchases/:id/send", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "잘못된 발주 ID" });
      const result = await sendPurchaseToEcount(id);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ ok: false, steps: [], message: e?.message ?? String(e) });
    }
  });

  app.post("/api/admin/ecount/orders/:id/send", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "잘못된 주문 ID" });
      // 매장 내부 주문은 자기거래(동일 사업자)라 세금계산서(ECOUNT 판매전표) 대상이 아님
      const ord = await storage.getOrder(id);
      if (ord) {
        const cust = await storage.getCustomer(ord.customerId);
        if ((cust as any)?.isStore) {
          return res.status(400).json({ ok: false, message: "매장 내부 주문은 세금계산서(ECOUNT) 전송 대상이 아닙니다." });
        }
      }
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

  // ===== ③ 니트커피 소식 (블로그형) =====
  // 거래처용: 발행(published)된 소식만 노출
  app.get("/api/news", requireAuth, async (_req, res) => {
    const list = await storage.listNews({ publishedOnly: true });
    // 카드용 요약 (본문 blocks 제외)
    res.json(
      list.map((n) => ({
        id: n.id,
        title: n.title,
        coverImage: n.coverImage,
        pinned: n.pinned,
        publishedAt: n.publishedAt,
      })),
    );
  });
  app.get("/api/news/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const item = await storage.getNews(id);
    if (!item || item.status !== "published")
      return res.status(404).json({ message: "소식을 찾을 수 없습니다." });
    await storage.incrementNewsView(id);
    res.json({ ...item, blocks: JSON.parse(item.blocks || "[]") });
  });

  // 관리자용: 전체(draft 포함) CRUD
  app.get("/api/admin/news", requireAdmin, async (_req, res) => {
    const list = await storage.listNews();
    res.json(list.map((n) => ({ ...n, blocks: JSON.parse(n.blocks || "[]") })));
  });
  app.post("/api/admin/news", requireAdmin, async (req, res) => {
    const parsed = createNewsSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const { title, coverImage, blocks, status, pinned } = parsed.data;
    const item = await storage.createNews({
      title,
      coverImage: coverImage ?? "",
      blocks: JSON.stringify(blocks ?? []),
      status,
      pinned: pinned ? 1 : 0,
      publishedAt: status === "published" ? Date.now() : 0,
    });
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "news.create",
      targetType: "news",
      targetId: String(item.id),
      summary: `소식 작성 (${item.title})`,
    });
    res.json({ ...item, blocks: JSON.parse(item.blocks || "[]") });
  });
  app.patch("/api/admin/news/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const existing = await storage.getNews(id);
    if (!existing) return res.status(404).json({ message: "소식을 찾을 수 없습니다." });
    const parsed = updateNewsSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const patch: any = {};
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.coverImage !== undefined) patch.coverImage = parsed.data.coverImage;
    if (parsed.data.blocks !== undefined) patch.blocks = JSON.stringify(parsed.data.blocks);
    if (parsed.data.pinned !== undefined) patch.pinned = parsed.data.pinned ? 1 : 0;
    if (parsed.data.status !== undefined) {
      patch.status = parsed.data.status;
      // 초안→발행 전환 시점에만 발행시각 기록. 이미 발행된 건은 유지.
      if (parsed.data.status === "published" && existing.status !== "published") {
        patch.publishedAt = Date.now();
      }
      if (parsed.data.status === "draft") patch.publishedAt = 0;
    }
    const item = await storage.updateNews(id, patch);
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "news.update",
      targetType: "news",
      targetId: String(id),
      summary: `소식 수정 (${item?.title ?? id})`,
    });
    res.json(item ? { ...item, blocks: JSON.parse(item.blocks || "[]") } : {});
  });
  app.delete("/api/admin/news/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const existing = await storage.getNews(id);
    if (!existing) return res.status(404).json({ message: "소식을 찾을 수 없습니다." });
    await storage.deleteNews(id);
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "news.delete",
      targetType: "news",
      targetId: String(id),
      summary: `소식 삭제 (${existing.title})`,
    });
    res.json({ ok: true });
  });

  // ===== 홀세일 납품 문의 =====
  // 공개(비회원) 제출
  app.post("/api/inquiry", async (req, res) => {
    const parsed = insertInquirySchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const d = parsed.data;
    const item = await storage.createInquiry({
      businessName: d.businessName,
      contactName: d.contactName ?? "",
      phone: d.phone,
      email: d.email ?? "",
      region: d.region ?? "",
      volume: d.volume ?? "",
      message: d.message,
    });
    // 관리자 이메일 알림 (실패해도 접수는 정상 처리)
    try {
      await sendWholesaleInquiryEmail(d);
    } catch (e: any) {
      console.warn("[inquiry] 알림 메일 실패:", e?.message ?? e);
    }
    storage.createNotification({
      type: "inquiry",
      title: `홀세일 납품 문의 · ${d.businessName}`,
      body: `${d.contactName || "-"} · ${d.phone}`,
      link: "/admin/inquiries",
    }).catch((e) => console.error("[notif] 문의 알림 저장 실패:", e));
    res.json({ ok: true, id: item.id });
  });
  // 관리자 목록
  app.get("/api/admin/inquiries", requireAdmin, async (_req, res) => {
    res.json(await storage.listInquiries());
  });
  // 관리자 상태/메모 수정
  app.patch("/api/admin/inquiries/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const patch: any = {};
    if (req.body.status === "new" || req.body.status === "done") patch.status = req.body.status;
    if (typeof req.body.adminMemo === "string") patch.adminMemo = req.body.adminMemo;
    const updated = await storage.updateInquiry(id, patch);
    if (!updated) return res.status(404).json({ message: "문의를 찾을 수 없습니다." });
    res.json(updated);
  });

  // ===== 방문 커피 세팅 신청 (거래처 로그인 전용) =====
  app.post("/api/visit-request", requireAuth, async (req, res) => {
    const parsed = insertVisitRequestSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const d = parsed.data;
    const customer = await storage.getCustomer(req.session.userId!);
    if (!customer) return res.status(401).json({ message: "로그인이 필요합니다." });
    const item = await storage.createVisitRequest({
      customerId: customer.id,
      businessName: customer.businessName,
      contactName: customer.managerName ?? "",
      phone: (d.phone && d.phone.trim()) || customer.phone || "",
      purpose: d.purpose,
      preferredDate1: d.preferredDate1 ?? "",
      preferredDate2: d.preferredDate2 ?? "",
      message: d.message ?? "",
    });
    // 관리자 이메일 알림 (실패해도 접수는 정상 처리)
    try {
      await sendVisitRequestEmail({
        businessName: item.businessName,
        contactName: item.contactName,
        phone: item.phone,
        purposeLabel: VISIT_PURPOSE_LABELS[d.purpose] ?? d.purpose,
        preferredDate1: item.preferredDate1,
        preferredDate2: item.preferredDate2,
        message: item.message,
      });
    } catch (e: any) {
      console.warn("[visit-request] 알림 메일 실패:", e?.message ?? e);
    }
    storage.createNotification({
      type: "visit_request",
      title: `방문 세팅 신청 · ${item.businessName}`,
      body: `${item.contactName || "-"} · ${VISIT_PURPOSE_LABELS[d.purpose] ?? d.purpose}`,
      link: "/admin/visit-setups",
    }).catch((e) => console.error("[notif] 방문신청 알림 저장 실패:", e));
    res.json({ ok: true, id: item.id });
  });
  // 관리자 목록
  app.get("/api/admin/visit-requests", requireAdmin, async (_req, res) => {
    res.json(await storage.listVisitRequests());
  });
  // 관리자 상태/확정일/메모 수정
  app.patch("/api/admin/visit-requests/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const patch: any = {};
    if (typeof req.body.status === "string" && (VISIT_STATUSES as readonly string[]).includes(req.body.status))
      patch.status = req.body.status;
    if (typeof req.body.confirmedDate === "string") patch.confirmedDate = req.body.confirmedDate;
    if (typeof req.body.adminMemo === "string") patch.adminMemo = req.body.adminMemo;
    const updated = await storage.updateVisitRequest(id, patch);
    if (!updated) return res.status(404).json({ message: "신청을 찾을 수 없습니다." });
    res.json(updated);
  });

  // ===== Board (게시판) =====
  registerBoardRoutes(app, storage);

  return httpServer;
}
