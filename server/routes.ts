import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "node:http";
import session from "express-session";
import SqliteStoreFactory from "better-sqlite3-session-store";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { storage, seed, seedFixedCostItems, seedPersonalCategories, seedProductCategories, seedEspressoSetup, backfillPurchaseEcountSent, backfillOrderEcountSent, db, sqlite, DB_PATH } from "./storage";
import { registerBoardRoutes } from "./board-routes";
import { registerStaffRoutes } from "./staff-routes";
import { registerPopupNoticeRoutes } from "./popup-notice";
import { registerCustomerActivityRoutes } from "./customer-activity";
import { registerAutomationRoutes, startAutomation, createBackupFile } from "./automation";
import { registerAlimtalkRoutes, sendOrderReceived, sendOrderAlertSms } from "./alimtalk";
import { registerExpenseImportRoutes } from "./expense-import";
import { mailStatus, sendNewOrderEmail, sendOrderProcessedEmail, sendOrderUpdatedEmail, sendOrderMergedEmail, sendPasswordResetEmail, sendWholesaleInquiryEmail, sendVisitRequestEmail, sendNewCustomerEmail } from "./email";
import { isKakaoConfigured, getKakaoAuthUrl, exchangeCodeForToken, getKakaoStatus, sendKakaoMemo, sendKakaoMemoDetailed } from "./kakao";
import { fetchWebAnalytics, isWebAnalyticsConfigured } from "./cloudflare";
import { aggregateLogs, type EspressoLogRow } from "./espressoLog";
import { staffStorage } from "./staff-storage";
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
  INQUIRY_TYPE_LABELS,
  insertVisitRequestSchema,
  VISIT_PURPOSE_LABELS,
  VISIT_STATUSES,
  updateNewsSchema,
  updateOrderItemsSchema,
  adminUpdateOrderItemsSchema,
  insertProductSchema,
  insertProductCategorySchema,
  insertEspressoSetupSchema,
  insertPaymentSchema,
  ecountSettingsInputSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  insertSupplierSchema,
  insertPurchaseSchema,
  insertQuoteSchema,
  insertSupplierPaymentSchema,
  purchaseItemSchema,
  insertStoreSaleSchema,
  insertFixedCostItemSchema,
  insertExpenseSchema,
  posImportSchema,
  insertPersonalCategorySchema,
  insertPersonalLedgerSchema,
  SECTORS,
  COST_TYPES,
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
  // productId 가 null/undefined 면 단발성(직접입력) 품목 — 상품 마스터를 안 거치고 적어 넣은 이름·단가를 그대로 쓴다.
  rawItems: Array<{ productId?: number | null; name: string; category?: string; unitPrice: number; qty: number; amount: number }>,
  // 정액 할인(양수). 공급가액에서 빼고 부가세를 다시 계산한다.
  discountAmount = 0,
  // true면 할인이 품목 합계보다 클 때 거절하지 않고 합계까지 줄여서 맞춘다.
  // (거래처가 품목을 줄여 재저장하는 경우처럼, 관리자가 넣은 할인을 이유로 저장을 막으면 안 되는 곳에서 쓴다.)
  clampDiscount = false,
  // 관리자가 직접 넣거나 고치는 주문은 최소 주문 수량 규칙을 적용하지 않는다.
  // (대표가 사정을 알고 넣는 주문이라 시스템이 막을 이유가 없다. 거래처 본인 주문에는 그대로 적용된다.)
  skipMinQty = false,
): Promise<
  | { ok: true; items: any[]; supplyAmount: number; vat: number; totalAmount: number; discountAmount: number }
  | { ok: false; message: string }
> {
  const customer = await storage.getCustomer(customerId);
  const isStore = !!(customer as any)?.isStore;
  const overrides = await storage.listCustomerPrices(customerId);
  const overrideMap = new Map(overrides.map((o) => [o.productId, o.price]));
  const items: any[] = [];
  for (const it of rawItems) {
    // 단발성 품목 — 이름과 단가를 그대로 쓴다.
    // 카테고리를 비워 두므로 원두 최소주문(5kg) 계산과 공장 자동발주에서 자연히 빠진다.
    if (it.productId == null) {
      const name = (it.name || "").trim();
      if (!name) return { ok: false, message: "단발성 품목의 이름을 입력해 주세요." };
      const unitPrice = Math.round(it.unitPrice || 0);
      if (!Number.isFinite(unitPrice) || unitPrice < 0)
        return { ok: false, message: `'${name}'의 단가를 0원 이상으로 입력해 주세요.` };
      items.push({
        productId: null,
        name,
        productName: name,
        category: "",
        unitPrice,
        qty: it.qty,
        amount: unitPrice * it.qty,
      });
      continue;
    }
    const prod = await storage.getProduct(it.productId);
    if (!prod) return { ok: false, message: `상품을 찾을 수 없습니다: ${it.productId}` };
    // 매장 내부 계정과 관리자 입력은 상품별 최소수량 검증을 생략
    if (!isStore && !skipMinQty) {
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
  const itemsTotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  let discount = Math.max(0, Math.round(discountAmount || 0));
  if (discount > itemsTotal) {
    if (!clampDiscount) {
      return {
        ok: false,
        message: `할인 금액(${discount.toLocaleString("ko-KR")}원)이 품목 합계(${itemsTotal.toLocaleString("ko-KR")}원)보다 큽니다.`,
      };
    }
    discount = itemsTotal;
  }
  // 할인은 공급가액에서 뺀다 → 부가세도 줄어든 공급가액 기준으로 다시 계산
  const supplyAmount = itemsTotal - discount;
  const vat = Math.round(supplyAmount * 0.1);
  return { ok: true, items, supplyAmount, vat, totalAmount: supplyAmount + vat, discountAmount: discount };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  await seed();
  // 전송 이력 컬럼이 생기기 전에 이카운트로 보낸 발주들을 호출 로그에서 복원 (멱등)
  backfillPurchaseEcountSent();
  backfillOrderEcountSent();
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
      // 접속할 때마다 만료 시각을 늘린다. 이게 없으면 로그인한 지 30일이 되는 순간
      // 매일 쓰고 있었더라도 갑자기 로그아웃된다.
      rolling: true,
      store: new SqliteStore({
        client: sessionDb,
        expired: { clear: true, intervalMs: 900000 },
      }),
      cookie: {
        httpOnly: true,
        // 같은 사이트 안에서만 쓰는 로그인 쿠키다. "none" 은 브라우저가 서드파티 쿠키로 취급해
        // 크롬의 서드파티 쿠키 차단이나 사파리 ITP 에 걸려 조용히 사라질 수 있다.
        // 카카오 로그인 콜백처럼 외부에서 돌아오는 것도 최상위 이동이라 lax 로 정상 동작한다.
        sameSite: "lax",
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
  // 로그인 무차별 대입 완화 — 같은 키(IP+아이디)로 연속 실패가 쌓이면 잠시 막는다.
  const loginFails = new Map<string, { n: number; until: number }>();
  const LOGIN_MAX = 8;              // 허용 실패 횟수
  const LOGIN_BLOCK_MS = 10 * 60 * 1000; // 초과 시 차단 시간
  function loginKey(req: Request, id: string) {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";
    return `${ip}|${String(id || "").toLowerCase()}`;
  }
  function loginBlocked(key: string): number {
    const rec = loginFails.get(key);
    if (!rec) return 0;
    if (Date.now() > rec.until) { loginFails.delete(key); return 0; }
    return rec.n >= LOGIN_MAX ? Math.ceil((rec.until - Date.now()) / 60000) : 0;
  }
  function loginFailed(key: string) {
    const rec = loginFails.get(key) ?? { n: 0, until: 0 };
    rec.n += 1;
    rec.until = Date.now() + LOGIN_BLOCK_MS;
    loginFails.set(key, rec);
    if (loginFails.size > 5000) loginFails.clear(); // 메모리 방어
  }
  function loginOk(key: string) { loginFails.delete(key); }

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
    // isStore/bizVerified/sampleUsed 는 스키마에서도 제외했지만, 스프레드 뒤에 다시 못박아 이중으로 차단한다.
    const customer = await storage.createCustomer({
      ...restData,
      taxEmail: parsed.data.email,
      password: hashed,
      role: "customer",
      isStore: 0,
      bizVerified,
    });
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
      const kA = loginKey(req, parsedAdmin.data.email);
      const waitA = loginBlocked(kA);
      if (waitA) return res.status(429).json({ message: `로그인 시도가 많습니다. ${waitA}분 후 다시 시도해 주세요.` });
      const admin = await storage.getCustomerByEmail(parsedAdmin.data.email);
      if (!admin || admin.role !== "admin" || !bcrypt.compareSync(parsedAdmin.data.password, admin.password)) {
        loginFailed(kA);
        return res.status(401).json({ message: "이메일 또는 비밀번호가 올바르지 않습니다." });
      }
      loginOk(kA);
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
    const kC = loginKey(req, parsed.data.businessName);
    const waitC = loginBlocked(kC);
    if (waitC) return res.status(429).json({ message: `로그인 시도가 많습니다. ${waitC}분 후 다시 시도해 주세요.` });
    const customer = await storage.getCustomerByBusinessName(parsed.data.businessName);
    if (!customer || !bcrypt.compareSync(parsed.data.password, customer.password)) {
      loginFailed(kC);
      return res.status(401).json({ message: "상호명 또는 비밀번호가 올바르지 않습니다." });
    }
    loginOk(kC);
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
    const k = loginKey(req, parsed.data.email);
    const wait = loginBlocked(k);
    if (wait) return res.status(429).json({ message: `로그인 시도가 많습니다. ${wait}분 후 다시 시도해 주세요.` });
    const admin = await storage.getCustomerByEmail(parsed.data.email);
    if (!admin || admin.role !== "admin" || !bcrypt.compareSync(parsed.data.password, admin.password)) {
      loginFailed(k);
      return res.status(401).json({ message: "이메일 또는 비밀번호가 올바르지 않습니다." });
    }
    loginOk(k);
    req.session.userId = admin.id;
    req.session.role = admin.role;
    req.session.adminRole = admin.adminRole;
    // 관리자는 본인 기기(휴대폰 홈 화면 아이콘 등)에서 계속 쓰는 경우가 많아 길게 잡는다.
    // rolling 설정과 함께라 접속할 때마다 이 기간이 다시 늘어난다.
    req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 180;
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
    // 문자열 값만 허용 (객체·배열이 그대로 DB로 흘러가지 않도록)
    for (const k of allowed) if (k in req.body && typeof req.body[k] === "string") patch[k] = req.body[k].trim();

    // 상호명은 로그인 ID이자 고유값 — 빈 값·중복을 막는다 (관리자 수정 경로와 동일 규칙)
    if ("businessName" in patch) {
      if (!patch.businessName) return res.status(400).json({ message: "상호명을 입력해 주세요." });
      const dup = await storage.getCustomerByBusinessName(patch.businessName);
      if (dup && dup.id !== req.session.userId)
        return res.status(400).json({ message: "이미 등록된 상호명입니다. 다른 상호명을 사용해 주세요." });
    }
    // 이메일 형식 검증 (가입 시와 동일 기준). 변경 시 taxEmail도 함께 갱신 (#43)
    if ("email" in patch) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email))
        return res.status(400).json({ message: "이메일 형식이 올바르지 않습니다." });
      patch.taxEmail = patch.email;
    }
    // 사업자등록번호를 바꾸면 체크섬을 다시 검증해 승인 상태를 갱신
    if ("bizRegNo" in patch && patch.bizRegNo) {
      if (!isValidBizRegNo(patch.bizRegNo))
        return res.status(400).json({ message: "사업자등록번호 형식이 올바르지 않습니다." });
      patch.bizVerified = 1;
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

  // ===== 공개 소개 페이지용 =====
  // 도매 소개(랜딩) 페이지의 원두 소개 섹션이 읽는 통로.
  // 로그인하지 않은 방문자도 보는 화면이라 단가는 절대 내려주지 않고,
  // 소개에 필요한 항목만 골라서 내려준다. 상품 관리에서 고치면 이 값도 함께 바뀐다.
  app.get("/api/public/blends", async (_req, res) => {
    const list = (await storage.listProducts())
      .filter((p) => p.category === "blend" && p.available === 1)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    const out = list.map((p) => {
      let d: any = {};
      try { d = JSON.parse(p.detailJson || "{}"); } catch { /* noop */ }
      let components: Array<{ name: string; ratio: string }> = [];
      try {
        const raw = d.blendComponents;
        if (raw) components = (JSON.parse(raw) as any[]).map((c) => ({ name: String(c.name ?? ""), ratio: String(c.ratio ?? "") }));
      } catch { /* noop */ }
      return {
        id: p.id,
        name: p.name,
        tagline: String(d.tagline ?? ""),
        flavorNotes: String(d.flavorNotes ?? ""),
        roastLevel: String(d.roastLevel ?? ""),
        components: components.filter((c) => c.name),
      };
    });
    // 소개 내용은 자주 바뀌지 않으므로 잠깐 캐시해 방문자마다 DB를 다시 읽지 않게 한다
    res.set("Cache-Control", "public, max-age=60");
    res.json(out);
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

      // 합쳐질 주문에 관리자가 걸어둔 정액 할인이 있으면 그대로 이어간다
      const mergedItemsTotal = mergedItems.reduce((s: number, i: any) => s + i.unitPrice * i.qty, 0);
      const keptDiscount = Math.min(Math.max(0, (todayPending as any).discountAmount ?? 0), mergedItemsTotal);
      const newSupplyAmount = mergedItemsTotal - keptDiscount;
      const newVat = Math.round(newSupplyAmount * 0.1);
      const newTotalAmount = newSupplyAmount + newVat;

      const updatedOrder = await storage.updateOrder(todayPending.id, {
        items: JSON.stringify(mergedItems),
        discountAmount: keptDiscount,
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

      sendOrderAlertSms({
        businessName: customer.businessName,
        orderNo: todayPending.orderNo,
        totalAmount: newTotalAmount,
        added: true,
      }).catch((e) => console.warn("[alert] 주문 추가 문자 알림 실패:", e?.message ?? e));

      // 합쳐진 주문도 대표님께는 알린다. 새 주문서가 생기지 않을 뿐 실제로는 주문이 늘어난 것이다.
      sendKakaoMemo(
        `[니트커피] 주문이 추가되었습니다.\n주문번호: ${todayPending.orderNo}\n거래처: ${customer.businessName}\n총액: ${newTotalAmount.toLocaleString("ko-KR")}원`,
        "https://wholesale.knitcoffee.co.kr/#/admin/orders",
      ).catch((e) => console.warn("[kakao] 주문 추가 알림 실패:", e?.message ?? e));

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
      // 매장 내부 계정 여부를 주문에 고정 기록 — 이후 거래처를 지우거나 설정을 바꿔도 과거 손익이 흔들리지 않게
      isStoreOrder: (customer as any).isStore ? 1 : 0,
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

    // 새 주문 문자 알림 — 카카오톡 나와의 채팅은 알림이 잘 울리지 않아 놓치기 쉽다.
    sendOrderAlertSms({
      businessName: customer.businessName,
      orderNo: order.orderNo,
      totalAmount: supplyAmount + vat,
    }).catch((e) => console.warn("[alert] 주문 문자 알림 실패:", e?.message ?? e));

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
    // 관리자 대리 주문에는 최소 주문 규칙(원두 5kg, 상품별 최소수량)을 적용하지 않는다.
    // 거래처 사정에 맞춰 대표가 직접 넣는 주문이라 거래처 종류를 가리지 않고 자유롭게 입력할 수 있어야 한다.
    // 거래처가 직접 넣는 주문(POST /api/orders)에는 규칙이 그대로 살아 있다.
    const recomputed = await recomputeOrderItems(
      customer.id,
      parsed.data.items,
      parsed.data.discountAmount,
      false,
      true, // skipMinQty
    );
    if (!recomputed.ok) return res.status(400).json({ message: recomputed.message });

    const order = await storage.createOrder({
      orderNo: genOrderNo(),
      customerId: customer.id,
      // 매장 내부 계정 여부를 주문에 고정 기록 — 이후 거래처를 지우거나 설정을 바꿔도 과거 손익이 흔들리지 않게
      isStoreOrder: (customer as any).isStore ? 1 : 0,
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
      discountAmount: recomputed.discountAmount,
      discountLabel: (parsed.data.discountLabel ?? "").trim(),
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

  // 샘플 신청 — 원두 최대 2종, 각 500g 고정, 무료(total 0). 승인+미사용 고객만.
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
      // 각 500g(수량 1) 고정, 무료(단가 0). 발송 규격을 주문/명세서에 명확히 표기.
      items.push({ productId: prod.id, name: `${prod.name} (샘플 500g)`, category: prod.category, unitPrice: 0, qty: 1, amount: 0 });
    }

    const order = await storage.createOrder({
      orderNo: genOrderNo(),
      customerId: customer.id,
      // 매장 내부 계정 여부를 주문에 고정 기록 — 이후 거래처를 지우거나 설정을 바꿔도 과거 손익이 흔들리지 않게
      isStoreOrder: (customer as any).isStore ? 1 : 0,
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
      note: "샘플 신청 (원두 각 500g)",
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

    // 관리자가 걸어둔 정액 할인은 그대로 유지한다.
    // 그냥 다시 계산하면 할인은 DB에 남은 채 금액에서만 사라져 앞뒤가 안 맞게 된다.
    const recomputed = await recomputeOrderItems(
      order.customerId,
      parsed.data.items,
      (order as any).discountAmount ?? 0,
      true,
    );
    if (!recomputed.ok) return res.status(400).json({ message: recomputed.message });

    const updated = await storage.updateOrder(id, {
      items: JSON.stringify(recomputed.items),
      discountAmount: recomputed.discountAmount,
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
      customerId: parsed.data.customerId ?? null,
      customerName: (parsed.data.customerName ?? "").trim(),
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
      customerId: parsed.data.customerId ?? null,
      customerName: (parsed.data.customerName ?? "").trim(),
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
    const allPurchases = await storage.listPurchases();
    const allPayments = await storage.listSupplierPayments();
    // '이번 달 발주'는 발주일(purchaseDate) 기준 + 부가세 포함
    const monthPurchased = allPurchases
      .filter((p) => (p.purchaseDate ?? "").slice(0, 7) === ym)
      .reduce((s, p) => s + p.totalAmount + Math.round(p.totalAmount * 0.1), 0);
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
    const from = typeof req.query.from === "string" && req.query.from ? req.query.from : undefined;
    const to = typeof req.query.to === "string" && req.query.to ? req.query.to : undefined;
    const ledger = await storage.getSupplierLedger(id, from, to);
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

  // 권장 항목 세트 추가 (없는 것만)
  app.post("/api/admin/fixed-cost-items/seed-recommended", requireOwner, async (_req, res) => {
    res.json(await storage.seedRecommendedCostItems());
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
    // 기본 부문 / 비용 구분(손익 집계 위치)도 수정 가능해야 함
    if (typeof req.body.sector === "string" && (SECTORS as readonly string[]).includes(req.body.sector)) patch.sector = req.body.sector;
    if (typeof req.body.costType === "string" && (COST_TYPES as readonly string[]).includes(req.body.costType)) patch.costType = req.body.costType;
    if (typeof req.body.vatIncluded === "number" && [0, 1].includes(req.body.vatIncluded)) patch.vatIncluded = req.body.vatIncluded;
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

  // 메모 기반 항목·부문 추천
  app.get("/api/admin/expenses/suggest", requireOwner, async (req, res) => {
    const memo = typeof req.query.memo === "string" ? req.query.memo : "";
    res.json((await storage.suggestExpenseClassification(memo)) ?? {});
  });

  // 여러 지출의 항목·부문 일괄 변경 (기존 '기타' 정리)
  app.post("/api/admin/expenses/bulk-recategorize", requireOwner, async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : [];
    const category = typeof req.body?.category === "string" && req.body.category ? req.body.category : undefined;
    const sector = typeof req.body?.sector === "string" && req.body.sector ? req.body.sector : undefined;
    if (ids.length === 0) return res.status(400).json({ message: "변경할 지출을 선택해 주세요." });
    if (!category && !sector) return res.status(400).json({ message: "변경할 항목 또는 부문을 선택해 주세요." });
    const n = await storage.bulkRecategorizeExpenses(ids, { category, sector });
    const actor = await getActor(req);
    await storage.logActivity({
      ...actor,
      action: "expense.bulkRecategorize",
      targetType: "expense",
      targetId: ids.slice(0, 20).join(","),
      summary: `지출 ${n}건 일괄 변경 (${category ?? "-"} / ${sector ?? "-"})`,
    });
    res.json({ ok: true, updated: n });
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
    const allocate = req.query.allocate !== "0"; // 기본: 공통비를 매출 비율로 배분
    res.json(await storage.getFinancialStatement(from, to, allocate));
  });

  // 재무제표 월별 추이
  app.get("/api/admin/financial-statement/monthly", requireOwner, async (req, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    if (!from || !to) return res.status(400).json({ message: "기간(from, to)이 필요합니다." });
    const allocate = req.query.allocate !== "0";
    res.json(await storage.getFinancialMonthly(from, to, allocate));
  });

  // AI(Claude) 심층 재무 분석 — 서버가 재무 데이터를 모아 Anthropic API로 분석문을 받아옵니다.
  // 대표(Owner) 전용. ANTHROPIC_API_KEY 환경변수 필요, 호출 시마다 소액 비용 발생.
  app.post("/api/admin/financial-statement/ai-analysis", requireOwner, async (req, res) => {
    const from = typeof req.body?.from === "string" ? req.body.from : "";
    const to = typeof req.body?.to === "string" ? req.body.to : "";
    if (!from || !to) return res.status(400).json({ message: "기간(from, to)이 필요합니다." });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ message: "AI 분석이 아직 설정되지 않았습니다. Railway 환경변수에 ANTHROPIC_API_KEY를 등록해 주세요." });
    }
    // 기본값은 비용이 저렴한 Haiku 4.5. 더 깊은 분석을 원하면 ANTHROPIC_MODEL=claude-sonnet-5 로 변경.
    const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

    try {
      const fs = await storage.getFinancialStatement(from, to);
      const pct = (n: number, d: number) => (d > 0 ? ((n / d) * 100).toFixed(1) + "%" : "-");
      const t = fs.totals;
      const bizName: Record<string, string> = { store: "음식점업(매장)", wholesale: "원두도매업(도매)", online: "온라인", atelier: "아뜰리에", consulting: "컨설팅", popup: "팝업", common: "공통" };
      const lineText = fs.lines
        .filter((l) => l.revenue !== 0 || l.cogs !== 0 || l.sga !== 0 || l.operatingProfit !== 0)
        .map((l) => `- ${bizName[l.sector] ?? l.label}: 매출 ${l.revenue}원, 매출원가 ${l.cogs}원(원가율 ${pct(l.cogs, l.revenue)}), 매출총이익 ${l.grossProfit}원, 판관비 ${l.sga}원, 영업이익 ${l.operatingProfit}원(영업이익률 ${pct(l.operatingProfit, l.revenue)})`)
        .join("\n");

      // 개별 지출 내역 (사용자가 직접 입력한 수기 지출) — 하나하나 뜯어보도록 그대로 제공
      const expenseRows = await storage.listExpenses(from, to); // 최신순
      const expenseTotal = expenseRows.reduce((s, e) => s + e.amount, 0);
      // 항목(category)별 소계
      const byCat = new Map<string, { sum: number; count: number }>();
      for (const e of expenseRows) {
        const k = e.category || "기타";
        const cur = byCat.get(k) || { sum: 0, count: 0 };
        cur.sum += e.amount; cur.count += 1; byCat.set(k, cur);
      }
      const catText = [...byCat.entries()]
        .sort((a, b) => b[1].sum - a[1].sum)
        .map(([k, v]) => `- ${k}: ${v.sum}원 (${v.count}건, 전체 지출의 ${pct(v.sum, expenseTotal)})`)
        .join("\n");
      // 개별 내역 (금액 큰 순). 과다 토큰 방지를 위해 최대 250건까지, 초과분은 별도 합산 표기.
      const CAP = 250;
      const sortedExp = [...expenseRows].sort((a, b) => b.amount - a.amount);
      const shown = sortedExp.slice(0, CAP);
      const rest = sortedExp.slice(CAP);
      const itemText = shown
        .map((e) => `- ${e.expenseDate} | ${bizName[(e as any).sector] ?? (e as any).sector ?? "공통"} | ${e.category || "기타"} | ${e.amount}원${e.memo ? ` | ${e.memo}` : ""}`)
        .join("\n");
      const restNote = rest.length > 0 ? `\n(그 외 소액 지출 ${rest.length}건 합계 ${rest.reduce((s, e) => s + e.amount, 0)}원 — 지면상 개별 생략)` : "";

      const dataBlock = [
        `[분석 기간] ${fs.from} ~ ${fs.to}`,
        ``,
        `[전체 손익]`,
        `- 매출액: ${t.revenue}원`,
        `- 매출원가: ${t.cogs}원 (매출원가율 ${pct(t.cogs, t.revenue)})`,
        `- 매출총이익: ${t.grossProfit}원 (매출총이익률 ${pct(t.grossProfit, t.revenue)})`,
        `- 판매관리비(수기 지출): ${t.sga}원 (판관비율 ${pct(t.sga, t.revenue)})`,
        `- 영업이익: ${t.operatingProfit}원 (영업이익률 ${pct(t.operatingProfit, t.revenue)})`,
        `- 영업외비용(이자 등): ${t.nonOperating}원`,
        `- 순이익: ${t.netProfit}원`,
        fs.allocated && fs.allocatedCommon > 0 ? `※ 공통 부문 비용 ${fs.allocatedCommon}원은 부문별 매출 비율로 배분되어 각 부문에 포함돼 있습니다.` : ``,
        fs.excluded > 0 ? `※ 부가세 납부·자산 취득 등 ${fs.excluded}원은 비용이 아니므로 손익에서 제외했습니다.` : ``,
        ``,
        `[부문별 손익]`,
        lineText || "(부문별 데이터 없음)",
        ``,
        `[지출 항목별 소계] (수기 입력 지출 총 ${expenseRows.length}건, 합계 ${expenseTotal}원)`,
        catText || "(입력된 지출 없음)",
        ``,
        `[개별 지출 내역] 형식: 날짜 | 부문 | 항목 | 금액 | 메모`,
        itemText || "(입력된 지출 없음)",
        restNote,
        ``,
        `[채권·채무 현재 잔액]`,
        `- 거래처 미수금(채권): ${fs.workingCapital.receivables}원`,
        `- 공장 미지급금(채무): ${fs.workingCapital.payables}원`,
        `- 순운전자본(채권-채무): ${fs.workingCapital.net}원`,
      ].join("\n");

      const systemPrompt =
        "당신은 한국의 소규모 사업체를 돕는 노련한 회계·경영 컨설턴트입니다. " +
        "분석 대상은 '니트커피'라는 개인사업자로, 원두 도매(OEM 공장 클라리멘토를 통한 납품)와 카페 매장을 함께 운영합니다. " +
        "매출원가는 주로 공장 발주(매입)이며, 매장과 도매는 같은 사업자라 매장용 원두 이동은 내부거래로 처리됩니다. " +
        "제공된 숫자만 근거로 삼고 임의로 수치를 지어내지 마세요. 정중한 한국어 존댓말로, 실무적으로 도움이 되게 작성하세요.";

      const userPrompt =
        `아래는 니트커피의 내부 경영용 재무 데이터입니다. 특히 [개별 지출 내역]을 하나하나 꼼꼼히 뜯어보며 회계 전문가 관점에서 분석해 주세요.\n\n` +
        dataBlock +
        `\n\n다음 순서로 마크다운(##, 굵게, - 목록)으로 작성해 주세요:\n` +
        `## 종합 진단 (2~3문장, 흑자/적자와 수익성 핵심)\n` +
        `## 지출 심층 분석 (개별 지출 내역을 근거로: 금액이 큰 지출, 반복·정기 지출, 과다하거나 이상해 보이는 지출, 절감 여지가 있는 항목을 구체적인 날짜·항목·금액을 인용해 짚어주세요. 필요하면 항목을 그룹지어 설명)\n` +
        `## 부문별 코멘트 (부문별 이익 기여와 문제 지점)\n` +
        `## 리스크 및 주의점 (원가율·판관비·이자부담·채권채무 유동성 관점)\n` +
        `## 개선 제안 (구체적이고 실행 가능한 3~5가지, 가능하면 예상 절감액 포함)\n\n` +
        `수치는 원 단위 그대로 쓰되 읽기 쉽게 천단위 콤마를 넣어주세요. 지출 심층 분석은 실제 입력된 개별 내역을 반드시 근거로 삼고, 데이터에 없는 항목은 지어내지 마세요.`;

      // 출력이 길어 max_tokens에 걸리면(=글이 아래에서 잘림) 자동으로 이어받아 붙인다.
      const MAX_TOKENS = 16000;
      const MAX_ROUNDS = 3; // 최초 1회 + 이어쓰기 최대 2회
      const messages: any[] = [{ role: "user", content: userPrompt }];
      let full = "";
      let truncated = false;

      for (let round = 0; round < MAX_ROUNDS; round++) {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system: systemPrompt, messages }),
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          console.error("[ai-analysis] Anthropic API error", resp.status, errText);
          if (full) break; // 이어쓰기 중 실패면 지금까지 받은 내용이라도 반환
          const msg = resp.status === 401 ? "AI 인증에 실패했습니다. ANTHROPIC_API_KEY를 확인해 주세요." : `AI 분석 요청이 실패했습니다. (오류 ${resp.status})`;
          return res.status(502).json({ message: msg });
        }

        const json: any = await resp.json();
        // text 블록만 추출 (thinking 등 비-text 블록은 무시)
        const chunk = Array.isArray(json?.content)
          ? json.content.filter((b: any) => b?.type === "text").map((b: any) => b?.text || "").join("")
          : "";

        if (!chunk && !full) {
          console.error("[ai-analysis] empty text. stop_reason=", json?.stop_reason, "blockTypes=", Array.isArray(json?.content) ? json.content.map((b: any) => b?.type) : json);
          const hint = json?.stop_reason === "max_tokens" ? " (모델이 생각 과정에 출력 한도를 모두 사용했습니다)" : "";
          return res.status(502).json({ message: `AI 응답 본문이 비어 있습니다${hint}. 잠시 후 다시 시도해 주세요.` });
        }

        full += chunk;

        if (json?.stop_reason !== "max_tokens") { truncated = false; break; }
        // 아직 덜 썼음 → 이어쓰기 요청
        truncated = true;
        if (round === MAX_ROUNDS - 1) break;
        messages.push({ role: "assistant", content: chunk });
        messages.push({
          role: "user",
          content: "분량 제한으로 답변이 중간에 끊겼습니다. 끊긴 바로 그 지점부터 이어서 계속 작성해 주세요. 인사말이나 서두, 이미 쓴 내용의 반복 없이 곧바로 이어서 쓰고, 마지막 섹션까지 마무리해 주세요.",
        });
      }

      const text = full.trim();
      if (!text) return res.status(502).json({ message: "AI 응답 본문이 비어 있습니다. 잠시 후 다시 시도해 주세요." });
      res.json({ analysis: text, model, truncated });
    } catch (e: any) {
      console.error("[ai-analysis] error", e);
      res.status(500).json({ message: "AI 분석 중 오류가 발생했습니다." });
    }
  });

  // 과거 회계자료 일괄 이관 (1회성). 같은 파일을 다시 올려도 중복되지 않는다.
  app.post("/api/admin/migrate/legacy", requireOwner, async (req, res) => {
    const b = req.body ?? {};
    if (!Array.isArray(b.sales) && !Array.isArray(b.expenses) && !Array.isArray(b.personal))
      return res.status(400).json({ message: "이관할 데이터가 없습니다. (sales / expenses / personal)" });
    const r = await storage.bulkImportLegacy(b);
    const actor = await getActor(req);
    await storage.logActivity({ ...actor, action: "migrate.legacy", targetType: "system", targetId: "-",
      summary: `과거 자료 이관 — 매출 ${r.sales} · 지출 ${r.expenses} · 가계부 ${r.personal}` });
    res.json(r);
  });

  // ===== POS 매출 (엑셀 업로드 → 집계 저장 · 분석) =====
  app.post("/api/admin/pos-sales/import", requireOwner, async (req, res) => {
    const parsed = posImportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    if (parsed.data.products.length === 0 && parsed.data.hourly.length === 0) {
      return res.status(400).json({ message: "업로드할 판매 데이터를 찾지 못했습니다. 올바른 POS 매출리포트 파일인지 확인해 주세요." });
    }
    const r = await storage.importPosSales(parsed.data);
    res.json(r);
  });
  // 업로드 시 교체될 기존 데이터 규모 (덮어쓰기 전 확인용)
  app.get("/api/admin/pos-sales/range-info", requireOwner, async (req, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    if (!from || !to) return res.status(400).json({ message: "기간(from, to)이 필요합니다." });
    res.json(await storage.getPosRangeInfo(from, to));
  });
  app.get("/api/admin/pos-sales/summary", requireOwner, async (req, res) => {
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    if (!from || !to) return res.status(400).json({ message: "기간(from, to)이 필요합니다." });
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const groupOrigin = req.query.groupOrigin !== "0"; // 기본: 산지 원두를 Filter Coffee로 묶음
    res.json(await storage.getPosSummary(from, to, category, groupOrigin));
  });
  // 월별 비교 (a=이전 달, b=기준 달, 미지정 시 최근 2개월 자동)
  app.get("/api/admin/pos-sales/compare", requireOwner, async (req, res) => {
    const a = typeof req.query.a === "string" ? req.query.a : undefined;
    const b = typeof req.query.b === "string" ? req.query.b : undefined;
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const groupOrigin = req.query.groupOrigin !== "0";
    const q = (k: string) => (typeof req.query[k] === "string" ? (req.query[k] as string) : undefined);
    const range = { aFrom: q("aFrom"), aTo: q("aTo"), bFrom: q("bFrom"), bTo: q("bTo") };
    res.json(await storage.getPosCompare(a, b, category, groupOrigin, range));
  });

  // 에스프레소 추출 로그 집계 (공개) — 직원 앱에 쌓인 기록으로 집계한다.
  // 공개 페이지라 조회가 잦아, 30초 동안은 계산 결과를 재사용한다.
  let espressoStatsCache: { at: number; value: any } | null = null;
  app.get("/api/espresso-log-stats", async (_req, res) => {
    try {
      if (espressoStatsCache && Date.now() - espressoStatsCache.at < 30_000) {
        return res.json(espressoStatsCache.value);
      }
      const logs = await staffStorage.listEspressoLogs("0000-01-01", "9999-12-31");
      const rows: EspressoLogRow[] = logs.map((l) => {
        let tags: string[] = [];
        try { tags = JSON.parse(l.flavorTags); } catch { tags = []; }
        return {
          date: l.logDate,
          bean: l.beanName,
          dose: l.doseG,
          yield: l.yieldG,
          time: l.timeSec,
          roomTemp: l.roomTemp,
          roomHumidity: l.roomHumidity,
          rating: l.rating,
          note: [l.memo, tags.join(", ")].filter(Boolean).join(" · "),
          staff: l.staffName,
        };
      });
      const value = aggregateLogs(rows);
      espressoStatsCache = { at: Date.now(), value };
      res.json(value);
    } catch (e: any) {
      res.json({
        totalLogs: 0, from: "", to: "", byRating: [], byDate: [], byBeanRecipe: [],
        byHumidity: [], byTemp: [], error: e?.message ?? String(e),
      });
    }
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
  // 품목별 집계 드릴다운 — 특정 품목의 거래처별 발주 내역
  app.get("/api/admin/purchases/item-detail", requireAdmin, async (req, res) => {
    const name = typeof req.query.name === "string" ? req.query.name : "";
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    if (!name) return res.status(400).json({ message: "품목명이 필요합니다." });
    if (!from || !to) return res.status(400).json({ message: "기간(from, to)이 필요합니다." });
    res.json(await storage.getPurchaseItemDetail(name, from, to));
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
    const r = await sendKakaoMemoDetailed(
      "[니트커피] 카카오톡 알림 연동 테스트입니다. 이 메시지가 보이면 정상 연동되었습니다.",
    );
    // 실패 이유를 그대로 돌려준다. "확인해 주세요" 만으로는 원인을 찾을 수 없다.
    res.json({ ok: r.ok, error: r.error ?? "" });
  });

  /** 카카오 발송 시도 기록 — 왜 안 왔는지 화면에서 바로 보이게 */
  app.get("/api/admin/kakao/logs", requireOwner, (_req, res) => {
    const rows = sqlite
      .prepare(
        `SELECT action, summary, created_at FROM activity_logs
          WHERE action LIKE 'kakao.%' ORDER BY id DESC LIMIT 20`,
      )
      .all() as { action: string; summary: string; created_at: number }[];
    res.json({ logs: rows.map((r) => ({ action: r.action, summary: r.summary, createdAt: r.created_at })) });
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
      // 관리자 수정은 음수 수량(손상·반품 차감)을 허용한다
      const parsed = adminUpdateOrderItemsSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
      // 관리자 수정도 대리 주문과 같은 원칙 — 최소 주문 규칙을 적용하지 않는다.
      // (대리 주문으로 넣은 것을 나중에 고치려는데 규칙에 걸려 저장이 안 되면 앞뒤가 안 맞는다)
      const recomputed = await recomputeOrderItems(
        order.customerId,
        parsed.data.items,
        parsed.data.discountAmount,
        false,
        true, // skipMinQty
      );
      if (!recomputed.ok) return res.status(400).json({ message: recomputed.message });
      patch.items = JSON.stringify(recomputed.items);
      patch.discountAmount = recomputed.discountAmount;
      patch.discountLabel = (parsed.data.discountLabel ?? "").trim();
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

          // 거래처에게 주문 접수 확인 알림톡.
          // 주문이 들어온 순간이 아니라 확인이 끝난 이 시점에 보낸다. 같은 날 추가 주문이
          // 기존 건에 합쳐지더라도 최종 확정된 내용으로 한 번만 나간다.
          // 실패해도 상태 변경은 그대로 진행된다.
          sendOrderReceived({
            customerId: customer.id,
            businessName: customer.businessName,
            phone: customer.phone,
            orderNo: updated.orderNo,
            totalAmount: updated.totalAmount,
            orderId: updated.id,
          }).catch((e) => console.warn("[alimtalk] 처리완료 알림 실패:", e?.message ?? e));
        }

        // pending → done 전환 시 ECOUNT 판매전표 자동 전송.
        //  세금계산서는 이 판매전표를 근거로 이카운트 (세금)계산서진행단계에서 월 단위로
        //  일괄 발행하므로, 전표가 빠짐없이 넘어가 있는 것이 가장 중요하다.
        //  - ECOUNT 설정의 '판매전표 자동 전송'이 켜져 있을 때만 동작
        //  - 매장 내부 계정 주문은 동일 사업자 간 거래라 세금계산서 대상이 아니므로 제외
        //  - 이미 전송된 주문(ecountSentAt)은 다시 보내지 않는다
        //  - 실패해도 상태 변경은 그대로 두고, 목록에 '미전송'으로 남겨 나중에 손으로 보낼 수 있게 한다
        if (order.status === "pending" && !updated.ecountSentAt) {
          try {
            const ecountSettings = await storage.getEcountSettings();
            const cust = await storage.getCustomer(updated.customerId);
            const isStoreOrder = updated.isStoreOrder === 1 || (updated.isStoreOrder === -1 && !!(cust as any)?.isStore);
            if (ecountSettings?.autoSendSales && !isStoreOrder) {
              sendOrderToEcount(updated.id)
                .then((r) => {
                  if (!r.ok) {
                    const failed = r.steps.find((st) => !st.ok);
                    console.warn(`[ecount] 판매전표 자동 전송 실패 (${updated.orderNo}):`, failed?.message ?? "원인 불명");
                  }
                })
                .catch((e) => console.warn(`[ecount] 판매전표 자동 전송 오류 (${updated.orderNo}):`, e?.message ?? e));
            }
          } catch (e: any) {
            console.warn("[ecount] 판매전표 자동 전송 준비 실패:", e?.message ?? e);
          }
        }

        // A-3: pending → done 전환 시 클라리멘토(대표 공급처)에 원두 자동발주 등록
        //  - skipAutoPurchase=true 이면 생략, 이미 자동발주된 주문(autoPurchaseId 존재)이면 재생성 안 함
        const skipAutoPurchase = req.body.skipAutoPurchase === true;
        //  손상·반품 차감(음수 라인)이 섞인 주문은 공장에 다시 발주할 일이 아니므로 자동발주를 건너뛴다.
        //  공급처 쪽 정산이 필요하면 발주 관리에서 따로 처리한다.
        let hasNegativeLine = false;
        try {
          hasNegativeLine = (JSON.parse(updated.items) as any[]).some((it) => Number(it.qty) < 0);
        } catch { /* noop */ }
        if (hasNegativeLine) {
          console.log(`[auto-purchase] ${updated.orderNo} 차감 라인이 있어 자동발주를 건너뜁니다.`);
        }
        if (!skipAutoPurchase && !hasNegativeLine && order.status === "pending" && !updated.autoPurchaseId) {
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
                const zeroPricedNames: string[] = [];
                for (const it of beanItems) {
                  const productId = typeof it.productId === "number" ? it.productId : null;
                  const name = it.productName ?? it.name ?? "";
                  // 단가: 최근 매입가 → 없으면 상품 매입원가(costPrice) 폴백.
                  // 둘 다 없으면 0원 발주가 되어 '매출만 있고 원가가 없는' 상태가 되므로 따로 알린다.
                  let unitPrice = await storage.lastPurchaseUnitPrice(supplier.id, { productId, name });
                  if (unitPrice == null && productId != null) {
                    const prod = await storage.getProduct(productId);
                    if (prod && prod.costPrice > 0) unitPrice = prod.costPrice;
                  }
                  if (unitPrice == null || unitPrice <= 0) {
                    unitPrice = 0;
                    zeroPricedNames.push(name || `상품#${productId ?? "?"}`);
                  }
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
                // 발주일은 서버 로컬(배포 환경 UTC)이 아니라 한국시간(KST) 기준이어야 함.
                // UTC로 계산하면 KST 00~09시 주문의 원가가 전날(=전월)로 잡혀 매출과 다른 달에 귀속된다.
                const purchaseDate = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
                // 매장 내부 계정의 주문이면 발주 부문을 'store'(매장 매출원가)로 태그
                const orderCust = await storage.getCustomer(updated.customerId);
                // 매장 여부는 주문 스냅샷을 우선 사용 (거래처가 삭제되었거나 이후 변경되어도 일관)
                const snap = (updated as any).isStoreOrder;
                const isStoreOrd = typeof snap === "number" && snap >= 0 ? snap === 1 : !!(orderCust as any)?.isStore;
                const purchaseSegment = isStoreOrd ? "store" : "wholesale";
                const purchase = await storage.createPurchase({
                  supplierId: supplier.id,
                  purchaseDate,
                  items: purchaseItems,
                  totalAmount,
                  memo: `거래처주문 ${updated.orderNo} 자동발주`,
                  segment: purchaseSegment,
                  customerId: updated.customerId ?? null,
                  customerName: orderCust?.businessName ?? "",
                });
                await storage.updateOrder(updated.id, { autoPurchaseId: purchase.id });
                // 단가를 못 찾아 0원으로 잡힌 품목이 있으면 알림센터로 통지 (매출만 있고 원가가 0인 상태 방지)
                if (zeroPricedNames.length > 0) {
                  try {
                    await storage.createNotification({
                      type: "purchase",
                      title: "자동발주 단가 확인 필요",
                      body: `${updated.orderNo} 자동발주에 매입 단가를 찾지 못한 품목이 있습니다: ${zeroPricedNames.join(", ")}. 발주 관리에서 단가를 입력해 주세요.`,
                      link: `/admin/purchases`,
                    });
                  } catch { /* 알림 실패는 주문 처리에 영향 없음 */ }
                }
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
  app.get("/api/admin/managers", requireOwner, async (_req, res) => {
    const admins = await storage.listAdmins();
    res.json(admins.map(toPublic));
  });

  app.post("/api/admin/managers", requireOwner, async (req, res) => {
    const { email, password, phone } = req.body;
    const name = req.body.name ?? req.body.managerName; // 클라이언트가 managerName으로 보냄
    if (!email || !name || !password)
      return res.status(400).json({ message: "이메일, 이름, 비밀번호는 필수입니다." });
    // 거래처 가입·비밀번호 변경과 동일하게 최소 6자 이상 요구
    if (typeof password !== "string" || password.length < 6)
      return res.status(400).json({ message: "비밀번호는 6자 이상이어야 합니다." });
    const existing = await storage.getCustomerByEmail(email);
    if (existing) return res.status(409).json({ message: "이미 사용 중인 이메일입니다." });
    // 상호명(business_name)은 유일해야 함 — 소유자가 "니트커피"를 쓰므로 매니저는 유일한 값으로.
    let bizName = `니트커피 · ${name}`;
    if (await storage.getCustomerByBusinessName(bizName)) bizName = `니트커피 · ${name} · ${email}`;
    const hashed = bcrypt.hashSync(password, 10);
    const actor = await getActor(req);
    const manager = await storage.createCustomer({
      email,
      password: hashed,
      role: "admin",
      adminRole: "manager",
      businessName: bizName,
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
    if (req.body.password) {
      if (typeof req.body.password !== "string" || req.body.password.length < 6)
        return res.status(400).json({ message: "비밀번호는 6자 이상이어야 합니다." });
      patch.password = bcrypt.hashSync(req.body.password, 10);
    }
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

  // ===== 거래처 1:1 채팅 =====
  // -- 관리자 --
  // 스레드 목록 + 전체 미읽음 (구체 경로는 :customerId 보다 먼저 정의)
  app.get("/api/admin/chat/threads", requireAdmin, async (_req, res) => {
    const threads = await storage.listChatThreads();
    const unread = await storage.countChatUnreadForAdmin();
    res.json({ threads, unread });
  });
  app.get("/api/admin/chat/unread-count", requireAdmin, async (_req, res) => {
    res.json({ unread: await storage.countChatUnreadForAdmin() });
  });
  // 특정 거래처와의 대화 조회 (열면서 관리자 읽음 처리)
  app.get("/api/admin/chat/:customerId", requireAdmin, async (req, res) => {
    const customerId = Number(req.params.customerId);
    if (!Number.isFinite(customerId)) return res.status(400).json({ message: "잘못된 거래처" });
    const customer = await storage.getCustomer(customerId);
    if (!customer || customer.role === "admin") return res.status(404).json({ message: "거래처를 찾을 수 없습니다." });
    await storage.markChatRead(customerId, "admin");
    const messages = await storage.listChatMessages(customerId);
    res.json({
      customer: { id: customer.id, businessName: customer.businessName, managerName: customer.managerName },
      messages,
    });
  });
  // 관리자 → 거래처 메시지 전송
  app.post("/api/admin/chat/:customerId", requireAdmin, async (req, res) => {
    const customerId = Number(req.params.customerId);
    if (!Number.isFinite(customerId)) return res.status(400).json({ message: "잘못된 거래처" });
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) return res.status(400).json({ message: "메시지를 입력해 주세요." });
    if (body.length > 2000) return res.status(400).json({ message: "메시지가 너무 깁니다. (최대 2000자)" });
    const customer = await storage.getCustomer(customerId);
    if (!customer || customer.role === "admin") return res.status(404).json({ message: "거래처를 찾을 수 없습니다." });
    const msg = await storage.sendChatMessage(customerId, "admin", body);
    res.json(msg);
  });
  // 대화 전체 삭제 — 관리자 계정과 잘못 생성된 스레드도 정리할 수 있도록 role 제한을 두지 않음
  app.delete("/api/admin/chat/:customerId", requireAdmin, async (req, res) => {
    const customerId = Number(req.params.customerId);
    if (!Number.isFinite(customerId)) return res.status(400).json({ message: "잘못된 거래처" });
    const deleted = await storage.deleteChatThread(customerId);
    res.json({ ok: true, deleted });
  });
  // 메시지 1건 삭제
  app.delete("/api/admin/chat/:customerId/message/:messageId", requireAdmin, async (req, res) => {
    const messageId = Number(req.params.messageId);
    if (!Number.isFinite(messageId)) return res.status(400).json({ message: "잘못된 메시지" });
    await storage.deleteChatMessage(messageId);
    res.json({ ok: true });
  });

  // -- 거래처 --
  app.get("/api/account/chat", requireAuth, async (req, res) => {
    const customerId = req.session.userId!;
    await storage.markChatRead(customerId, "customer");
    const messages = await storage.listChatMessages(customerId);
    res.json({ messages });
  });
  app.get("/api/account/chat/unread-count", requireAuth, async (req, res) => {
    const customerId = req.session.userId!;
    res.json({ unread: await storage.countChatUnreadForCustomer(customerId) });
  });
  app.post("/api/account/chat", requireAuth, async (req, res) => {
    const customerId = req.session.userId!;
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) return res.status(400).json({ message: "메시지를 입력해 주세요." });
    if (body.length > 2000) return res.status(400).json({ message: "메시지가 너무 깁니다. (최대 2000자)" });
    // 관리자 계정은 '거래처 문의' 채팅을 만들 수 없음 (자기 자신과의 대화가 생겨 열지도 지우지도 못하게 됨)
    const meCheck = await storage.getCustomer(customerId);
    if (meCheck?.role === "admin") {
      return res.status(400).json({ message: "관리자 계정에서는 문의 채팅을 보낼 수 없습니다. 거래처 채팅 메뉴에서 해당 거래처를 선택해 대화해 주세요." });
    }
    const msg = await storage.sendChatMessage(customerId, "customer", body);
    // 관리자 알림센터에 표시
    const me = await storage.getCustomer(customerId);
    const preview = body.length > 40 ? body.slice(0, 40) + "…" : body;
    await storage.createNotification({
      type: "chat",
      title: `${me?.businessName ?? "거래처"} 채팅`,
      body: preview,
      link: `/admin/chat/${customerId}`,
    });
    res.json(msg);
  });

  // ===== 예비 거래처 견적서 =====
  function parseQuote(q: any) {
    let usageHeaders: string[] = [], beans: any[] = [], consulting: string[] = [], appendix: any[] = [];
    try { usageHeaders = JSON.parse(q.usageHeaders || "[]"); } catch { /* noop */ }
    try { beans = JSON.parse(q.beans || "[]"); } catch { /* noop */ }
    try { consulting = JSON.parse(q.consulting || "[]"); } catch { /* noop */ }
    try { appendix = JSON.parse(q.appendix || "[]"); } catch { /* noop */ }
    return {
      id: q.id, quoteNo: q.quoteNo, token: q.token,
      customerName: q.customerName, customerBizNo: q.customerBizNo, customerManager: q.customerManager, customerPhone: q.customerPhone,
      managerName: q.managerName, managerPhone: q.managerPhone,
      issueDate: q.issueDate, validDays: q.validDays,
      usageHeaders, beans, consulting, consultingFee: q.consultingFee, appendix,
      createdAt: q.createdAt,
    };
  }

  app.get("/api/admin/quotes", requireAdmin, async (_req, res) => {
    const list = await storage.listQuotes();
    res.json(list.map(parseQuote));
  });
  app.get("/api/admin/quotes/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const q = await storage.getQuote(id);
    if (!q) return res.status(404).json({ message: "견적서를 찾을 수 없습니다." });
    res.json(parseQuote(q));
  });
  app.post("/api/admin/quotes", requireAdmin, async (req, res) => {
    const parsed = insertQuoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const q = await storage.createQuote(parsed.data);
    res.json(parseQuote(q));
  });
  app.patch("/api/admin/quotes/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getQuote(id);
    if (!existing) return res.status(404).json({ message: "견적서를 찾을 수 없습니다." });
    const parsed = insertQuoteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "입력값 오류" });
    const q = await storage.updateQuote(id, parsed.data);
    res.json(parseQuote(q));
  });
  app.delete("/api/admin/quotes/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    await storage.deleteQuote(id);
    res.json({ ok: true });
  });
  // 공개 조회 (로그인 불필요) — 공유 링크용
  app.get("/api/quote/public/:token", async (req, res) => {
    const token = String(req.params.token || "");
    const q = await storage.getQuoteByToken(token);
    if (!q) return res.status(404).json({ message: "견적서를 찾을 수 없습니다." });
    res.json(parseQuote(q));
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
      customer: {
        id: customer.id,
        businessName: customer.businessName,
        managerName: customer.managerName,
        phone: customer.phone,
        bizRegNo: customer.bizRegNo,
        address: customer.defaultAddress,
      },
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

    // 중요: 이 DB 는 WAL 모드라 data.db 파일을 그대로 보내면 최근 데이터가 통째로 빠진다.
    // 반드시 온전한 사본을 새로 떠서 보내고, 보낸 뒤 임시 파일을 지운다.
    const tmpPath = path.join(path.dirname(DB_PATH), `export-${Date.now()}.db`);
    try {
      await createBackupFile(tmpPath);
    } catch (e: any) {
      return res.status(500).json({ message: `백업 파일 생성 실패: ${e?.message ?? e}` });
    }
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/octet-stream");
    res.sendFile(tmpPath, () => {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* 임시 파일 정리 실패는 무시 */
      }
    });
  });

  app.post("/api/admin/backup/import", requireOwner, upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "파일이 없습니다." });
    const dbPath = DB_PATH;
    const backupPath = path.join(path.dirname(DB_PATH), `data.db.bak.${Date.now()}`);
    const stagePath = path.join(path.dirname(DB_PATH), `restore-${Date.now()}.db`);
    try {
      // ① 올린 파일이 진짜 쓸 수 있는 DB 인지 먼저 확인한다.
      //    빈 파일이나 엉뚱한 파일로 덮어써서 운영 데이터를 날리는 일을 여기서 막는다.
      fs.writeFileSync(stagePath, req.file.buffer);
      const probe = new Database(stagePath, { readonly: true, fileMustExist: true });
      let customerCount = 0;
      try {
        customerCount = (probe.prepare("SELECT COUNT(*) AS c FROM customers").get() as { c: number }).c;
      } finally {
        probe.close();
      }
      if (customerCount < 1) throw new Error("거래처 정보가 들어 있지 않은 파일입니다. 백업 파일이 맞는지 확인해 주세요.");

      // ② 지금 DB 를 온전한 사본으로 남겨 둔다 (되돌릴 길).
      await createBackupFile(backupPath);

      const actor = await getActor(req);
      console.log(`[backup] 복원 시작. actor=${actor.actorEmail}, 거래처 ${customerCount}곳`);

      // ③ 열려 있는 연결을 정리하고 파일을 바꾼다.
      //    WAL 파일을 함께 지우지 않으면 옛 DB 의 변경분이 새 DB 위에 얹혀 깨진다.
      try { sqlite.pragma("wal_checkpoint(TRUNCATE)"); } catch { /* 무시 */ }
      try { sqlite.close(); } catch { /* 무시 */ }
      for (const suffix of ["-wal", "-shm"]) {
        try { if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix); } catch { /* 무시 */ }
      }
      fs.copyFileSync(stagePath, dbPath);
      try { fs.unlinkSync(stagePath); } catch { /* 무시 */ }

      res.json({
        ok: true,
        message: `복원했습니다 (거래처 ${customerCount}곳). 서버가 스스로 다시 시작합니다. 30초쯤 뒤 새로고침해 주세요.`,
      });

      // ④ 연결을 닫았으므로 반드시 재시작해야 한다. Railway 는 비정상 종료일 때 다시 띄워 준다.
      setTimeout(() => {
        console.log("[backup] 복원 완료 — 새 DB 로 다시 시작합니다.");
        process.exit(1);
      }, 800);
    } catch (e: any) {
      try { if (fs.existsSync(stagePath)) fs.unlinkSync(stagePath); } catch { /* 무시 */ }
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
        deliverFieldCode: "",
        discountProductCode: "",
        miscProductCode: "",
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
      deliverFieldCode: s.deliverFieldCode ?? "",
      discountProductCode: s.discountProductCode ?? "",
      miscProductCode: s.miscProductCode ?? "",
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
    // 스위치는 값이 안 오면 '기존 값 유지'. 예전처럼 기본값으로 덮어쓰면
    // 테스트 서버로 되돌아가거나 판매전표 자동 전송이 조용히 꺼진다.
    const prev = await storage.getEcountSettings();
    const keep = (v: boolean | undefined, before: number | undefined, fallback: number) =>
      v === undefined ? (before ?? fallback) : v ? 1 : 0;
    const useTest = keep(d.useTestEndpoint, prev?.useTestEndpoint, 1);
    const patch: any = {
      comCode: d.comCode,
      userId: d.userId,
      zone: d.zone ?? "",
      warehouseCode: d.warehouseCode,
      deliverFieldCode: (d.deliverFieldCode ?? "").trim(),
      discountProductCode: (d.discountProductCode ?? "").trim(),
      miscProductCode: (d.miscProductCode ?? "").trim(),
      useTestEndpoint: useTest,
      autoSendSales: keep(d.autoSendSales, prev?.autoSendSales, 0),
      autoSendPayments: keep(d.autoSendPayments, prev?.autoSendPayments, 0),
      autoSendCustomer: keep(d.autoSendCustomer, prev?.autoSendCustomer, 1),
      autoSendProduct: keep(d.autoSendProduct, prev?.autoSendProduct, 1),
    };
    if (d.apiCertKey && d.apiCertKey.trim().length > 0) {
      patch.apiCertKeyEnc = encrypt(d.apiCertKey.trim());
    }
    if (!patch.zone) {
      try {
        patch.zone = await fetchZone(d.comCode, useTest === 1);
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
      // 중복 전송 방지 — 이미 성공한 발주는 force=true 없이는 다시 보내지 않는다
      const existing = await storage.getPurchase(id);
      if (existing?.ecountSentAt && req.body?.force !== true) {
        return res.status(409).json({
          ok: false,
          alreadySent: true,
          sentAt: existing.ecountSentAt,
          steps: [],
          message: `이미 ${new Date(existing.ecountSentAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}에 이카운트로 전송된 발주입니다. 다시 보내면 이카운트에 구매전표가 한 건 더 쌓입니다.`,
        });
      }
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
        // 중복 전송 방지 — 이미 성공한 주문은 force=true 없이는 다시 보내지 않는다
        if (ord.ecountSentAt && req.body?.force !== true) {
          return res.status(409).json({
            ok: false,
            alreadySent: true,
            sentAt: ord.ecountSentAt,
            steps: [],
            message: `이미 ${new Date(ord.ecountSentAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}에 이카운트로 전송된 주문입니다. 다시 보내면 이카운트에 판매전표가 한 건 더 쌓이고 세금계산서 금액이 이중으로 잡힙니다.`,
          });
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

  /** 재설정 토큰을 새로 만들고 링크를 돌려준다 (유효 1시간) */
  async function makeResetUrl(req: Request, customerId: number): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    await storage.createPasswordResetToken(customerId, token, Date.now() + 60 * 60 * 1000);
    const origin =
      process.env.PUBLIC_URL || (req.headers.origin as string) || `${req.protocol}://${req.headers.host}`;
    return `${origin}/#/reset-password/${token}`;
  }

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

      const r = await sendPasswordResetEmail(parsed.data.email, resetUrl);
      if (!r.ok) console.error("[forgot-password] 메일 발송 실패:", r.error, "| to:", parsed.data.email);
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
  // 발송 결과를 기다렸다가 그대로 돌려준다. 예전에는 결과를 안 보고 무조건 성공이라고
  // 답해서, 실제로는 메일이 안 나가도 화면에는 '발송했습니다'로 보였다.
  app.post("/api/admin/customers/:id/reset-password", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const customer = await storage.getCustomer(id);
    if (!customer || customer.role !== "customer")
      return res.status(404).json({ message: "거래처를 찾을 수 없습니다." });
    if (!customer.email || customer.email.trim() === "")
      return res.status(400).json({ message: "등록된 이메일이 없습니다." });

    const resetUrl = await makeResetUrl(req, customer.id);
    const result = await sendPasswordResetEmail(customer.email, resetUrl);
    if (!result.ok) {
      return res.status(502).json({
        message: `메일이 발송되지 않았습니다. ${result.error ?? ""}`.trim(),
        resetUrl, // 메일이 막혀도 링크는 직접 전달할 수 있게 함께 돌려준다
      });
    }
    res.json({ message: "재설정 메일을 발송했습니다.", resetUrl });
  });

  /** 재설정 링크만 만들어 준다 — 메일이 막혔을 때 카카오톡 등으로 직접 전달하는 용도 */
  app.post("/api/admin/customers/:id/reset-link", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const customer = await storage.getCustomer(id);
    if (!customer || customer.role !== "customer")
      return res.status(404).json({ message: "거래처를 찾을 수 없습니다." });
    const resetUrl = await makeResetUrl(req, customer.id);
    res.json({ resetUrl, businessName: customer.businessName, expiresInMinutes: 60 });
  });

  /**
   * 소유자가 거래처 비밀번호를 직접 새로 지정한다.
   * 메일이 막혀 있어도 대표가 바로 바꿔서 알려줄 수 있게 하는 길.
   */
  app.post("/api/admin/customers/:id/password", requireOwner, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "잘못된 ID" });
    const password = String(req.body?.password ?? "");
    if (password.length < 6) return res.status(400).json({ message: "비밀번호는 6자 이상이어야 합니다." });
    if (password.length > 72) return res.status(400).json({ message: "비밀번호가 너무 깁니다." });

    const customer = await storage.getCustomer(id);
    if (!customer || customer.role !== "customer")
      return res.status(404).json({ message: "거래처를 찾을 수 없습니다." });

    await storage.updateCustomerPassword(id, bcrypt.hashSync(password, 10));

    const actor = await storage.getCustomer(req.session.userId!);
    await storage.logActivity({
      actorUserId: req.session.userId ?? 0,
      actorEmail: actor?.email ?? "",
      actorRole: req.session.adminRole ?? "owner",
      action: "customer_password_set",
      targetType: "customer",
      targetId: String(id),
      summary: `거래처 비밀번호 직접 변경: ${customer.businessName}`,
    });

    res.json({ message: "비밀번호를 변경했습니다.", businessName: customer.businessName });
  });

  /** 메일 설정 진단 — 왜 안 나가는지 화면에서 바로 확인 */
  app.get("/api/admin/mail-status", requireAdmin, (_req, res) => {
    res.json(mailStatus());
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
      inquiryType: d.inquiryType,
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
      title: `${INQUIRY_TYPE_LABELS[d.inquiryType] ?? "문의"} · ${d.businessName}`,
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
  registerStaffRoutes(app, storage);
  registerPopupNoticeRoutes(app);
  registerCustomerActivityRoutes(app);
  registerAutomationRoutes(app);
  registerAlimtalkRoutes(app);
  registerExpenseImportRoutes(app);
  startAutomation();

  return httpServer;
}
