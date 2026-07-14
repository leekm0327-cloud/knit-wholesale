import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ===== 비밀번호 재설정 토큰 (#26) =====
export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  createdAt: integer("created_at").notNull(),
});

// ===== 거래처(도매 고객) + 관리자 통합 사용자 =====
export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  password: text("password").notNull(),
  role: text("role").notNull().default("customer"), // "customer" | "admin"
  // 관리자 서브 역할: "owner" | "manager" (role="admin"인 경우만 사용)
  adminRole: text("admin_role").notNull().default("owner"),
  businessName: text("business_name").notNull(), // 상호
  managerName: text("manager_name").notNull(), // 담당자명
  phone: text("phone").notNull(), // 연락처
  bizRegNo: text("biz_reg_no").notNull().default(""), // 사업자등록번호
  taxEmail: text("tax_email").notNull().default(""), // 세금계산서 이메일
  defaultAddress: text("default_address").notNull().default(""), // 기본 배송지
  paymentMethod: text("payment_method").notNull().default("transfer"), // transfer | card | deferred
  // B-3: 사업자번호 검증/승인 여부 (1=승인, 0=승인대기). 샘플 신청 가능 조건.
  bizVerified: integer("biz_verified").notNull().default(0),
  // B-3: 샘플 사용 여부 (1=이미 샘플 주문함). 승인 고객당 1회 제한.
  sampleUsed: integer("sample_used").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

// ===== 상품 =====
// 원칙: ECOUNT는 1품목 1코드 → 중량별로 별도 상품으로 등록 (예: "코튼 블렌드 1kg", "코튼 블렌드 200g")
export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // 중량 포함 전체 상품명 (예: "코튼 블렌드 1kg")
  category: text("category").notNull(), // blend | decaf | single
  origin: text("origin").notNull().default(""), // 산지 / 설명
  price: integer("price").notNull().default(0), // 단가 (원)
  costPrice: integer("cost_price").notNull().default(0), // 매입금 (클라리멘토 원가) — 관리자 전용, 발주 단가 기본값
  available: integer("available").notNull().default(1), // 1 판매중 / 0 품절
  sortOrder: integer("sort_order").notNull().default(0),
  // ECOUNT 품목코드 (ECOUNT 마스터의 PROD_CD와 일치해야 매칭됨). 비어있으면 ECOUNT 전송 불가.
  ecountCode: text("ecount_code").notNull().default(""),
  // 상세페이지 양식: "blend" | "single". 비어있으면 category에서 자동 유추 ("blend"->blend, 그 외 single).
  detailTemplate: text("detail_template").notNull().default(""),
  // 상세페이지 필드 JSON — 양식별 키 다름
  detailJson: text("detail_json").notNull().default(""),
  // 상세페이지 이미지 (base64 data URL 배열 JSON)
  detailImages: text("detail_images").notNull().default("[]"),
});

// ===== 상품 카테고리 (관리자가 생성·수정·삭제·순서변경) =====
// 상품의 category 필드는 이 테이블의 key 를 참조한다. (예: blend / decaf / single / dripbag ...)
export const productCategories = sqliteTable("product_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(), // 상품에 저장되는 코드값 (영문 슬러그)
  label: text("label").notNull(), // 화면 표시명 (예: "싱글 오리진 에스프레소")
  sortOrder: integer("sort_order").notNull().default(0), // 카탈로그 노출 순서 (작을수록 먼저)
  isBean: integer("is_bean").notNull().default(1), // 1이면 원두 — 5kg 최소주문 수량에 포함
  sampleEligible: integer("sample_eligible").notNull().default(0), // 1이면 무료 샘플 신청 대상
  active: integer("active").notNull().default(1), // 1 노출 / 0 숨김
  createdAt: integer("created_at").notNull().default(0),
});

// ===== 거래처별 상품 가격 오버라이드 =====
// 거래처가 특정 상품을 보는 가격. 행이 없는 상품은 products.price 그대로 적용.
export const customerPrices = sqliteTable("customer_prices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  productId: integer("product_id").notNull(),
  price: integer("price").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ===== 즐겨찾기 (거래처별 상품 즐겨찾기) =====
// 거래처가 별표한 상품. 카탈로그에서 즐겨찾기 품목을 최상단에 노출.
export const favorites = sqliteTable("favorites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  productId: integer("product_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

// ===== 게시판 =====
export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull(), // notice | inquiry | free
  title: text("title").notNull(),
  body: text("body").notNull(),
  images: text("images").notNull().default("[]"), // base64 data URL 배열 JSON
  authorId: integer("author_id"), // 관리자 작성 시 null
  authorBusinessName: text("author_business_name").notNull(),
  authorManagerName: text("author_manager_name").notNull(),
  isAdmin: integer("is_admin").notNull().default(0),
  pinned: integer("pinned").notNull().default(0),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id").notNull(),
  body: text("body").notNull(),
  authorId: integer("author_id"), // 관리자 작성 시 null
  authorBusinessName: text("author_business_name").notNull(),
  authorManagerName: text("author_manager_name").notNull(),
  isAdmin: integer("is_admin").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

// ===== 주문 =====
export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderNo: text("order_no").notNull().unique(), // 주문번호 KC-YYMMDD-XXXX
  customerId: integer("customer_id").notNull(),
  // 주문 시점 거래처 스냅샷 (JSON)
  customerSnapshot: text("customer_snapshot").notNull(),
  // 품목 라인 JSON 배열: [{productId,name,category,unitPrice,qty,amount}]
  items: text("items").notNull(),
  supplyAmount: integer("supply_amount").notNull(), // 공급가액
  vat: integer("vat").notNull(), // 부가세
  totalAmount: integer("total_amount").notNull(), // 합계
  desiredDate: text("desired_date").notNull().default(""), // 희망 납품일
  ecountDate: text("ecount_date").notNull().default(""), // 관리자 지정 주문 일자(YYYY-MM-DD). ECOUNT IO_DATE로 사용, 비면 createdAt 기준
  note: text("note").notNull().default(""), // 요청사항
  status: text("status").notNull().default("pending"), // pending | done | cancelled
  isSample: integer("is_sample").notNull().default(0), // B-2: 샘플 주문 여부 (1=샘플, 무료·5kg검증 제외)
  trackingNo: text("tracking_no").notNull().default(""), // 송장번호
  adminMemo: text("admin_memo").notNull().default(""), // 관리자 메모
  quickRequest: integer("quick_request").notNull().default(0), // 퀵 요청 여부 (#6)
  cancelledAt: integer("cancelled_at"), // 취소 시각 (nullable)
  cancelledBy: integer("cancelled_by"), // 취소한 사용자 customer.id (관리자/거래처, nullable)
  // 처리완료(done) 전환 시 클라리멘토 자동발주로 생성된 purchase.id (중복 자동발주 방지, nullable)
  autoPurchaseId: integer("auto_purchase_id"),
  createdAt: integer("created_at").notNull(),
});

// ===== ECOUNT 연동 설정 (단일 레코드, id=1) =====
export const ecountSettings = sqliteTable("ecount_settings", {
  id: integer("id").primaryKey(),
  comCode: text("com_code").notNull().default(""),
  userId: text("user_id").notNull().default(""),
  apiCertKeyEnc: text("api_cert_key_enc").notNull().default(""), // AES 암호화된 인증키
  zone: text("zone").notNull().default(""),
  warehouseCode: text("warehouse_code").notNull().default(""),
  useTestEndpoint: integer("use_test_endpoint").notNull().default(1), // 1=sboapi, 0=oapi
  autoSendSales: integer("auto_send_sales").notNull().default(0),
  autoSendPayments: integer("auto_send_payments").notNull().default(0),
  autoSendCustomer: integer("auto_send_customer").notNull().default(1),
  autoSendProduct: integer("auto_send_product").notNull().default(1),
  lastVerifiedAt: integer("last_verified_at"),
  verificationLog: text("verification_log").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
});

// ===== ECOUNT 호출 로그 =====
export const ecountLogs = sqliteTable("ecount_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at").notNull(),
  // 작업 종류: customer | product | sale | payment | invoice_auto | verify | login
  action: text("action").notNull(),
  // 한글 표시용 레이블 (예: "판매전표 등록")
  label: text("label").notNull(),
  // 관련 주문번호 / 거래처ID 등 조회 키 (선택)
  refKind: text("ref_kind").notNull().default(""), // order | customer | payment | verify
  refId: text("ref_id").notNull().default(""),
  // 요청 요약 (사람이 읽기 좋게)
  summary: text("summary").notNull().default(""),
  // 결과
  ok: integer("ok").notNull().default(0), // 1 성공 / 0 실패
  message: text("message").notNull().default(""), // 쇼트 메시지 (성공/에러)
  // 원본 요청/응답 (JSON 문자열, 아랫바이 펼침용)
  requestJson: text("request_json").notNull().default(""),
  responseJson: text("response_json").notNull().default(""),
  durationMs: integer("duration_ms").notNull().default(0),
});

// ===== 입금(수금) 기록 =====
export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(),
  amount: integer("amount").notNull(), // 입금액 (원)
  paidAt: text("paid_at").notNull(), // 입금일 YYYY-MM-DD
  method: text("method").notNull().default("transfer"), // transfer | cash | card | other
  memo: text("memo").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

// ===== OEM 공급처(매입처) =====
// 클라리멘토 등 원두를 OEM 생산/납품받는 공장. 대부분 소수(1곳)지만 확장 가능하게 테이블화.
export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // 공급처 상호 (예: 클라리멘토)
  contact: text("contact").notNull().default(""), // 담당자명
  phone: text("phone").notNull().default(""), // 연락처
  ecountCode: text("ecount_code").notNull().default(""), // 이카운트 거래처코드 (매입전표 CUST) — 이미 이카운트에 등록된 공급처 코드
  memo: text("memo").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

// ===== 발주(매입) =====
// 공급처에 원두를 발주한 내역. 저장 시 공장에 대한 채무(외상매입금)가 증가한다.
// items JSON 배열: [{productId(nullable), name, qty, unitPrice, amount}]
//  - 기존 제품을 고르면 productId 채움, 직접 입력 품목이면 productId=null
//  - 매입단가(unitPrice)는 판매가와 별개로 직접 입력
export const purchases = sqliteTable("purchases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  supplierId: integer("supplier_id").notNull(),
  purchaseNo: text("purchase_no").notNull().unique(), // 발주번호 PO-YYMMDD-XXXX
  purchaseDate: text("purchase_date").notNull(), // 발주일 YYYY-MM-DD
  items: text("items").notNull(), // 품목 라인 JSON 배열
  totalAmount: integer("total_amount").notNull(), // 발주 합계 금액 (원)
  memo: text("memo").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

// ===== 공급처 지급(공장에 송금) =====
// 공장에 지급한 내역. 저장 시 채무가 감소한다. (거래처 입금(payments)의 매입 버전)
export const supplierPayments = sqliteTable("supplier_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  supplierId: integer("supplier_id").notNull(),
  amount: integer("amount").notNull(), // 지급액 (원)
  paidAt: text("paid_at").notNull(), // 지급일 YYYY-MM-DD
  method: text("method").notNull().default("transfer"), // transfer | cash | card | other
  memo: text("memo").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

// ===== 경영 대시보드 (C): 매장매출 / 고정비 항목 / 지출 =====
// 매장(오프라인) 일별 매출. 같은 날짜는 하나만 유지(upsert).
export const storeSales = sqliteTable("store_sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  saleDate: text("sale_date").notNull().unique(), // 매출일 YYYY-MM-DD (고유)
  amount: integer("amount").notNull().default(0), // 당일 매장매출 (원)
  memo: text("memo").notNull().default(""),
  // D: 재무 부문. 매장매출 기본 store, 온라인 매출은 online 선택.
  sector: text("sector").notNull().default("store"),
  createdAt: integer("created_at").notNull(),
});

// 고정비 항목 정의 (지출 입력 시 카테고리 선택지)
export const fixedCostItems = sqliteTable("fixed_cost_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // 항목명 (예: 임대료)
  sortOrder: integer("sort_order").notNull().default(0),
  active: integer("active").notNull().default(1), // 1 사용 / 0 숨김
  // D: 재무 부문 (고정비도 부문 지정)
  sector: text("sector").notNull().default("common"),
  createdAt: integer("created_at").notNull(),
});

// 지출 기록 (고정비 항목 or '기타')
export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  expenseDate: text("expense_date").notNull(), // 지출일 YYYY-MM-DD
  category: text("category").notNull(), // 고정비 항목명 or '기타'
  amount: integer("amount").notNull().default(0), // 지출액 (원)
  memo: text("memo").notNull().default(""),
  // D: 재무 부문 (입력 시 선택)
  sector: text("sector").notNull().default("common"),
  createdAt: integer("created_at").notNull(),
});

// ===== E: 개인 가계부 (owner 전용, 사업 재무와 완전 분리) =====
export const personalCategories = sqliteTable("personal_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull(), // income | expense
  createdAt: integer("created_at").notNull(),
});

export const personalLedger = sqliteTable("personal_ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD
  type: text("type").notNull(), // income | expense
  categoryId: integer("category_id").notNull(),
  amount: integer("amount").notNull().default(0), // 원
  memo: text("memo").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});

// ===== F: 카카오 "나에게 보내기" 토큰 (단일 행, id=1) =====
export const kakaoTokens = sqliteTable("kakao_tokens", {
  id: integer("id").primaryKey(), // 고정 1
  accessToken: text("access_token").notNull().default(""),
  refreshToken: text("refresh_token").notNull().default(""),
  accessTokenExpiresAt: integer("access_token_expires_at").notNull().default(0), // epoch ms
  refreshTokenExpiresAt: integer("refresh_token_expires_at").notNull().default(0),
  updatedAt: integer("updated_at").notNull().default(0),
});

// ===== 에스프레소 추출 환경 (인포그래픽, 관리자 수정) =====
export const espressoSetup = sqliteTable("espresso_setup", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  icon: text("icon").notNull().default(""), // 이모지
  label: text("label").notNull(), // 카테고리 (예: ESPRESSO MACHINE)
  value: text("value").notNull().default(""), // 내용 (예: LA MARZOCCO LINEA PB)
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull().default(0),
});

// ===== ③ 니트커피 소식 (블로그형 매거진) =====
// 기존 게시판(posts)과 완전 별개. 관리자가 발행하는 콘텐츠, 로그인 거래처 모두 열람.
export const news = sqliteTable("news", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  coverImage: text("cover_image").notNull().default(""), // 대표 커버 (base64 data URL, 없을 수 있음)
  blocks: text("blocks").notNull().default("[]"), // 본문 블록 배열 JSON: {type:"paragraph",text} | {type:"image",src}
  status: text("status").notNull().default("draft"), // draft | published
  pinned: integer("pinned").notNull().default(0), // 상단고정
  viewCount: integer("view_count").notNull().default(0),
  publishedAt: integer("published_at").notNull().default(0), // 발행 시각(epoch ms). draft면 0
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ===== 활동 로그 (#10) =====
export const activityLogs = sqliteTable("activity_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorUserId: integer("actor_user_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  actorRole: text("actor_role").notNull(), // owner | manager
  action: text("action").notNull(), // e.g. order.status_change, customer.create
  targetType: text("target_type"), // order | customer | product | manager | board_post | system
  targetId: text("target_id"),
  summary: text("summary"), // 한 줄 한국어 요약
  metadata: text("metadata"), // JSON
  createdAt: integer("created_at").notNull(),
});

// ===== Insert schemas =====
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

export const insertPaymentSchema = z.object({
  customerId: z.number().int().positive(),
  amount: z.number().int().positive("입금액을 입력해 주세요."),
  paidAt: z.string().min(1, "입금일을 선택해 주세요."),
  method: z.enum(["transfer", "cash", "card", "other"]).default("transfer"),
  memo: z.string().optional().default(""),
});


export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  role: true,
  adminRole: true,
});

export const registerSchema = insertCustomerSchema.extend({
  email: z.string().email("올바른 이메일을 입력해 주세요."),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다."),
  passwordConfirm: z.string().min(1, "비밀번호 확인을 입력해 주세요."),
  businessName: z.string().min(1, "상호를 입력해 주세요."),
  managerName: z.string().min(1, "담당자명을 입력해 주세요."),
  phone: z.string().min(1, "연락처를 입력해 주세요."),
}).refine((d) => d.password === d.passwordConfirm, {
  message: "비밀번호가 일치하지 않습니다.",
  path: ["passwordConfirm"],
});

// 비밀번호 찾기 (#26)
export const forgotPasswordSchema = z.object({
  email: z.string().email("올바른 이메일을 입력해 주세요."),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "토큰이 필요합니다."),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다."),
  passwordConfirm: z.string().min(1, "비밀번호 확인을 입력해 주세요."),
}).refine((d) => d.password === d.passwordConfirm, {
  message: "비밀번호가 일치하지 않습니다.",
  path: ["passwordConfirm"],
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// 거래처 로그인: 상호명 + 비밀번호
export const loginSchema = z.object({
  businessName: z.string().min(1, "상호명을 입력해 주세요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
  // #45: 로그인 상태 유지 (체크 시 30일 쿠키, 해제 시 세션 쿠키). 기본값 true
  rememberMe: z.boolean().optional().default(true),
});

// 관리자 로그인: 이메일 + 비밀번호
export const adminLoginSchema = z.object({
  email: z.string().email("올바른 이메일을 입력해 주세요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

// 비밀번호 변경 (거래처/관리자 공용)
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, "새 비밀번호는 6자 이상이어야 합니다."),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  orderNo: true,
  createdAt: true,
  status: true,
  trackingNo: true,
  adminMemo: true,
  customerSnapshot: true,
  customerId: true,
  supplyAmount: true,
  vat: true,
  totalAmount: true,
});

// 클라이언트가 보내는 주문 페이로드
export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number(),
        name: z.string(),
        category: z.string(),
        unitPrice: z.number(),
        qty: z.number().min(1),
        amount: z.number(),
      }),
    )
    .min(1, "주문 품목을 선택해 주세요."),
  desiredDate: z.string().optional().default(""),
  note: z.string().optional().default(""),
  quickRequest: z.boolean().optional().default(false),
});

// ② 관리자 대리 주문 생성 페이로드 (requireAdmin) — 거래처 지정
export const adminCreateOrderSchema = createOrderSchema.extend({
  customerId: z.number().int().min(1, "거래처를 선택해 주세요."),
});
export type AdminCreateOrderInput = z.infer<typeof adminCreateOrderSchema>;

// 주문 수정(품목 변경) 페이로드 — 거래처/관리자 공용
export const updateOrderItemsSchema = z.object({
  items: z.array(z.object({
    productId: z.number(),
    name: z.string(),
    category: z.string(),
    unitPrice: z.number(),
    qty: z.number().min(1),
    amount: z.number(),
  })).min(1, "주문 품목을 선택해 주세요."),
  desiredDate: z.string().optional().default(""),
  note: z.string().optional().default(""),
  quickRequest: z.boolean().optional().default(false),
});
export type UpdateOrderItemsInput = z.infer<typeof updateOrderItemsSchema>;

// ===== Types =====
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type ProductCategory = typeof productCategories.$inferSelect;
export const insertProductCategorySchema = z.object({
  key: z
    .string()
    .min(1, "코드값을 입력해 주세요.")
    .regex(/^[a-z0-9_]+$/, "코드값은 영문 소문자·숫자·밑줄(_)만 사용할 수 있습니다."),
  label: z.string().min(1, "표시명을 입력해 주세요."),
  sortOrder: z.number().int().optional().default(0),
  isBean: z.boolean().optional().default(true),
  sampleEligible: z.boolean().optional().default(false),
  active: z.boolean().optional().default(true),
});
export type InsertProductCategory = z.infer<typeof insertProductCategorySchema>;

export type CustomerPrice = typeof customerPrices.$inferSelect;
// API 응답용 — 상품에 거래처별 가격 적용 여부표시
export type ProductWithPrice = Product & { effectivePrice: number; hasCustomPrice: boolean };

export type Favorite = typeof favorites.$inferSelect;

export type Post = typeof posts.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type PostWithMeta = Post & { commentCount: number };

// ===== ③ 소식(news) 타입 & 입력 스키마 =====
export type News = typeof news.$inferSelect;

// 본문 블록: 문단 또는 이미지
export const newsBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string() }),
  z.object({ type: z.literal("image"), src: z.string() }),
]);
export type NewsBlock = z.infer<typeof newsBlockSchema>;

// ===== 홀세일 납품 문의 (비회원 공개 폼) =====
export const wholesaleInquiries = sqliteTable("wholesale_inquiries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessName: text("business_name").notNull(), // 상호
  contactName: text("contact_name").notNull().default(""), // 담당자
  phone: text("phone").notNull(), // 연락처
  email: text("email").notNull().default(""),
  region: text("region").notNull().default(""), // 지역
  volume: text("volume").notNull().default(""), // 예상 월 물량
  message: text("message").notNull(), // 문의 내용
  status: text("status").notNull().default("new"), // new | done
  adminMemo: text("admin_memo").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});
export type WholesaleInquiry = typeof wholesaleInquiries.$inferSelect;
export const insertInquirySchema = z.object({
  businessName: z.string().trim().min(1, "상호(업체명)를 입력해 주세요.").max(120),
  contactName: z.string().trim().max(80).optional().default(""),
  phone: z.string().trim().min(1, "연락처를 입력해 주세요.").max(60),
  email: z.string().trim().max(120).optional().default(""),
  region: z.string().trim().max(120).optional().default(""),
  volume: z.string().trim().max(120).optional().default(""),
  message: z.string().trim().min(1, "문의 내용을 입력해 주세요.").max(3000),
});

// ===== 방문 커피 세팅 신청 (거래처 로그인 전용) =====
// 방문 목적: 신규 오픈 세팅 / 원두 변경 후 재세팅 / 추출 재점검 / 기타
export const VISIT_PURPOSES = ["open", "beanchange", "recalib", "etc"] as const;
export type VisitPurpose = (typeof VISIT_PURPOSES)[number];
export const VISIT_PURPOSE_LABELS: Record<VisitPurpose, string> = {
  open: "신규 오픈 세팅",
  beanchange: "원두 변경 후 재세팅",
  recalib: "추출 재점검",
  etc: "기타",
};
// 상태: 신규 → 일정 조율 → 방문 확정 → 완료
export const VISIT_STATUSES = ["new", "coordinating", "confirmed", "done"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const visitRequests = sqliteTable("visit_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull(), // 신청 거래처
  businessName: text("business_name").notNull(), // 신청 당시 상호 스냅샷
  contactName: text("contact_name").notNull().default(""), // 담당자(스냅샷)
  phone: text("phone").notNull().default(""), // 연락처
  purpose: text("purpose").notNull().default("open"), // VISIT_PURPOSES
  preferredDate1: text("preferred_date1").notNull().default(""), // 희망일 1지망
  preferredDate2: text("preferred_date2").notNull().default(""), // 희망일 2지망
  message: text("message").notNull().default(""), // 요청사항
  status: text("status").notNull().default("new"), // VISIT_STATUSES
  confirmedDate: text("confirmed_date").notNull().default(""), // 관리자 확정 방문일
  adminMemo: text("admin_memo").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});
export type VisitRequest = typeof visitRequests.$inferSelect;
// 신청 폼 입력 (상호·담당자는 로그인 세션에서 채움 → 폼에서 받지 않음)
export const insertVisitRequestSchema = z.object({
  purpose: z.enum(VISIT_PURPOSES).default("open"),
  preferredDate1: z.string().trim().max(40).optional().default(""),
  preferredDate2: z.string().trim().max(40).optional().default(""),
  phone: z.string().trim().max(60).optional().default(""),
  message: z.string().trim().max(3000).optional().default(""),
});

export const NEWS_STATUSES = ["draft", "published"] as const;

// 생성: blocks는 배열로 받아 서버에서 JSON 직렬화
export const createNewsSchema = z.object({
  title: z.string().min(1, "제목을 입력해 주세요."),
  coverImage: z.string().optional().default(""),
  blocks: z.array(newsBlockSchema).default([]),
  status: z.enum(NEWS_STATUSES).default("draft"),
  pinned: z.boolean().optional().default(false),
});
export type CreateNewsInput = z.infer<typeof createNewsSchema>;

// 수정: 모든 필드 선택적
export const updateNewsSchema = z.object({
  title: z.string().min(1, "제목을 입력해 주세요.").optional(),
  coverImage: z.string().optional(),
  blocks: z.array(newsBlockSchema).optional(),
  status: z.enum(NEWS_STATUSES).optional(),
  pinned: z.boolean().optional(),
});
export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;

// ===== 게시판 입력 스키마 =====
export const POST_CATEGORIES = ["notice", "inquiry", "free"] as const;
export type PostCategory = typeof POST_CATEGORIES[number];

export const createPostSchema = z.object({
  category: z.enum(POST_CATEGORIES),
  title: z.string().min(1, "제목을 입력해 주세요.").max(200, "제목은 200자 이내로 입력해 주세요."),
  body: z.string().min(1, "내용을 입력해 주세요.").max(20000, "내용은 20,000자 이내로 입력해 주세요."),
  images: z.array(z.string()).optional().default([]),
  pinned: z.number().int().min(0).max(1).optional(),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(20000).optional(),
  images: z.array(z.string()).optional(),
  pinned: z.number().int().min(0).max(1).optional(),
});
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const createCommentSchema = z.object({
  body: z.string().min(1, "댓글 내용을 입력해 주세요.").max(5000, "댓글은 5,000자 이내로 입력해 주세요."),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

// ===== 상품 상세페이지 양식 =====
export const productDetailBlendSchema = z.object({
  template: z.literal("blend"),
  tagline: z.string().optional().default(""),
  blendRatio: z.string().optional().default(""),
  flavorNotes: z.string().optional().default(""),
  roastLevel: z.string().optional().default(""),
  recommendedUse: z.string().optional().default(""),
  description: z.string().optional().default(""),
  // B-1: 원두 상세정보 강화 (문자열로 저장, acidity/body는 "1"~"5")
  tastingNotes: z.string().optional().default(""),
  acidity: z.string().optional().default(""),
  body: z.string().optional().default(""),
  brewMethods: z.string().optional().default(""),
  originProcess: z.string().optional().default(""),
});

export const productDetailSingleSchema = z.object({
  template: z.literal("single"),
  tagline: z.string().optional().default(""),
  country: z.string().optional().default(""),
  region: z.string().optional().default(""),
  farm: z.string().optional().default(""),
  variety: z.string().optional().default(""),
  process: z.string().optional().default(""),
  altitude: z.string().optional().default(""),
  flavorNotes: z.string().optional().default(""),
  roastLevel: z.string().optional().default(""),
  description: z.string().optional().default(""),
  // B-1: 원두 상세정보 강화 (문자열로 저장, acidity/body는 "1"~"5")
  tastingNotes: z.string().optional().default(""),
  acidity: z.string().optional().default(""),
  body: z.string().optional().default(""),
  brewMethods: z.string().optional().default(""),
  originProcess: z.string().optional().default(""),
});

export const productDetailSchema = z.discriminatedUnion("template", [
  productDetailBlendSchema,
  productDetailSingleSchema,
]);
export type ProductDetailBlend = z.infer<typeof productDetailBlendSchema>;
export type ProductDetailSingle = z.infer<typeof productDetailSingleSchema>;
export type ProductDetail = z.infer<typeof productDetailSchema>;

export type ProductWithDetail = Product & {
  detailParsed: ProductDetail | null;
  imageUrls: string[];
};

export type Order = typeof orders.$inferSelect;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

// ===== OEM 공장 채무: 공급처 / 발주 / 지급 =====
export type Supplier = typeof suppliers.$inferSelect;
export const insertSupplierSchema = z.object({
  name: z.string().min(1, "공급처 상호를 입력해 주세요."),
  contact: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  ecountCode: z.string().optional().default(""),
  memo: z.string().optional().default(""),
});
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;

// 발주 품목 라인 (기존 제품 선택 또는 직접 입력)
export const purchaseItemSchema = z.object({
  productId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1, "품목명을 입력해 주세요."),
  qty: z.number().positive("수량을 입력해 주세요."),
  unitPrice: z.number().int().min(0, "매입단가를 입력해 주세요."),
  amount: z.number().int().min(0),
});
export type PurchaseItem = z.infer<typeof purchaseItemSchema>;

export type Purchase = typeof purchases.$inferSelect;
export const insertPurchaseSchema = z.object({
  supplierId: z.number().int().positive("공급처를 선택해 주세요."),
  purchaseDate: z.string().min(1, "발주일을 선택해 주세요."),
  items: z.array(purchaseItemSchema).min(1, "품목을 1개 이상 추가해 주세요."),
  memo: z.string().optional().default(""),
});
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;

export type SupplierPayment = typeof supplierPayments.$inferSelect;
export const insertSupplierPaymentSchema = z.object({
  supplierId: z.number().int().positive(),
  amount: z.number().int().positive("지급액을 입력해 주세요."),
  paidAt: z.string().min(1, "지급일을 선택해 주세요."),
  method: z.enum(["transfer", "cash", "card", "other"]).default("transfer"),
  memo: z.string().optional().default(""),
});
export type InsertSupplierPayment = z.infer<typeof insertSupplierPaymentSchema>;

// 공장 채무 현황 (공급처별 요약)
export type SupplierBalance = {
  supplierId: number;
  name: string;
  contact: string;
  phone: string;
  totalPurchased: number; // 누적 발주액
  totalPaid: number; // 누적 지급액
  balance: number; // 채무 = totalPurchased - totalPaid
  lastPurchaseAt: number | null;
  lastPaidAt: string | null;
};

// 공장 채무 원장 행 (발주 또는 지급)
export type SupplierLedgerRow =
  | {
      kind: "purchase";
      id: number;
      purchaseNo: string;
      date: number;
      debit: number; // 발주액 (채무 증가, +)
      credit: 0;
      balance: number;
      memo: string;
    }
  | {
      kind: "payment";
      id: number;
      date: number;
      debit: 0;
      credit: number; // 지급액 (채무 감소, -)
      balance: number;
      method: string;
      memo: string;
    };

// 발주량 집계 (품목별 누계)
export type PurchaseQtyAgg = {
  key: string; // 품목명 (기준)
  name: string;
  totalQty: number;
  totalAmount: number;
};

// ===== D: 재무 부문(sector) =====
// 5개 고정 부문. store(매장)/wholesale(홀세일)/online(온라인)/atelier(아뜰리에)/common(공통)
export const SECTORS = ["store", "wholesale", "online", "atelier", "common"] as const;
export type Sector = (typeof SECTORS)[number];
export const sectorSchema = z.enum(SECTORS);
export const SECTOR_LABEL: Record<Sector, string> = {
  store: "매장",
  wholesale: "홀세일",
  online: "온라인",
  atelier: "아뜰리에",
  common: "공통",
};

// ===== 경영 대시보드 (C) 타입/스키마 =====
export type StoreSale = typeof storeSales.$inferSelect;
export const insertStoreSaleSchema = z.object({
  saleDate: z.string().min(1, "매출일을 선택해 주세요."),
  amount: z.number().int().min(0, "매출액을 입력해 주세요."),
  memo: z.string().optional().default(""),
  sector: sectorSchema.optional().default("store"),
});
export type InsertStoreSale = z.infer<typeof insertStoreSaleSchema>;

export type FixedCostItem = typeof fixedCostItems.$inferSelect;
export const insertFixedCostItemSchema = z.object({
  name: z.string().min(1, "항목명을 입력해 주세요."),
  sortOrder: z.number().int().optional().default(0),
  active: z.number().int().min(0).max(1).optional().default(1),
  sector: sectorSchema.optional().default("common"),
});
export type InsertFixedCostItem = z.infer<typeof insertFixedCostItemSchema>;

export type Expense = typeof expenses.$inferSelect;
export const insertExpenseSchema = z.object({
  expenseDate: z.string().min(1, "지출일을 선택해 주세요."),
  category: z.string().min(1, "지출 항목을 선택해 주세요."),
  amount: z.number().int().min(0, "지출액을 입력해 주세요."),
  memo: z.string().optional().default(""),
  sector: sectorSchema.optional().default("common"),
});
export type InsertExpense = z.infer<typeof insertExpenseSchema>;

// ===== E: 개인 가계부 타입/스키마 =====
export type PersonalCategory = typeof personalCategories.$inferSelect;
export const insertPersonalCategorySchema = z.object({
  name: z.string().min(1, "카테고리명을 입력해 주세요."),
  type: z.enum(["income", "expense"]),
});
export type InsertPersonalCategory = z.infer<typeof insertPersonalCategorySchema>;

export type PersonalLedgerEntry = typeof personalLedger.$inferSelect;
export const insertPersonalLedgerSchema = z.object({
  date: z.string().min(1, "날짜를 선택해 주세요."),
  type: z.enum(["income", "expense"]),
  categoryId: z.number().int().min(1, "카테고리를 선택해 주세요."),
  amount: z.number().int().min(0, "금액을 입력해 주세요."),
  memo: z.string().optional().default(""),
});
export type InsertPersonalLedger = z.infer<typeof insertPersonalLedgerSchema>;

export type PersonalSummary = {
  from: string;
  to: string;
  totalIncome: number;
  totalExpense: number;
  net: number;
  byCategory: { categoryId: number; name: string; type: string; amount: number }[];
};

// ===== F: 카카오 토큰 타입 =====
export type KakaoTokens = typeof kakaoTokens.$inferSelect;

// D: 부문별 손익 한 줄
export type SectorPnl = { sector: Sector; income: number; expense: number; net: number };

// 대시보드 기간 그루핑 단위
export type DashboardGranularity = "day" | "week" | "month" | "year";

// 기간별 손익 집계 결과
export type DashboardSummary = {
  from: string;
  to: string;
  granularity: DashboardGranularity;
  // D: 적용된 부문 필터 ("all" | Sector) 및 부문별 손익 비교
  sector: "all" | Sector;
  sectorBreakdown: SectorPnl[];
  // 수입
  wholesaleSales: number; // 도매매출 (취소 제외 주문 합)
  storeSales: number; // 매장매출 합
  totalIncome: number;
  // 지출 (발생주의: 공장 매입=발주액을 지출로 인식. 공장 지급/지불은 지출 아님)
  purchaseTotal: number; // 공장 매입(발주) 합
  otherExpense: number; // 기타지출(고정비 포함) 합
  totalExpense: number;
  // 손익
  netProfit: number; // 수입 - 지출
  // 지출 항목별 비중 (category → amount)
  expenseByCategory: { category: string; amount: number }[];
  // 기간 버킷 추이
  buckets: {
    key: string; // 버킷 라벨 (예: 2026-07-08, 2026-W28, 2026-07, 2026)
    income: number;
    expense: number;
    net: number;
  }[];
};

// ===== 재무제표 (내부 경영용: 손익계산서 + 채권·채무 요약) =====
// 업종/부문별 손익 라인. 매장=음식점업, 홀세일=원두도매업.
export type FinancialStatementLine = {
  sector: Sector;
  label: string; // 업종/부문 표시명
  revenue: number; // 매출액
  cogs: number; // 매출원가 (도매=공장 매입, 그 외 0)
  grossProfit: number; // 매출총이익 = 매출 - 원가
  sga: number; // 판매관리비 (수기 지출)
  operatingProfit: number; // 영업이익 = 매출총이익 - 판관비
};
export type FinancialStatement = {
  from: string;
  to: string;
  lines: FinancialStatementLine[]; // 활동 있는 부문만
  totals: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    sga: number;
    operatingProfit: number;
  };
  // 채권·채무 (현재 시점 스냅샷)
  workingCapital: {
    receivables: number; // 거래처 미수금 합 (양수 잔액)
    payables: number; // 공장 미지급금 합 (양수 잔액)
    net: number; // 순운전자본(채권-채무)
  };
};

// 에스프레소 추출 로그 집계 (구글시트 게시 데이터 기반, 공개)
export type EspressoBinRow = {
  label: string; // 구간 (예: "70–79%")
  count: number; // 표본 수 (긍정 기록)
  avgDose: number;
  avgYield: number;
  avgTime: number;
  ratio: number;
};
export type EspressoStats = {
  totalLogs: number;
  from: string;
  to: string;
  byRating: { rating: string; count: number }[];
  byDate: { date: string; count: number }[];
  byBeanRecipe: { bean: string; count: number; avgDose: number; avgYield: number; avgTime: number; ratio: number }[];
  byHumidity: EspressoBinRow[]; // 습도 구간별 성공 레시피
  byTemp: EspressoBinRow[]; // 실내온도 구간별 성공 레시피
  error?: string;
};

export type EspressoSetupItem = typeof espressoSetup.$inferSelect;
export const insertEspressoSetupSchema = z.object({
  icon: z.string().optional().default(""),
  label: z.string().min(1, "카테고리명을 입력해 주세요."),
  value: z.string().optional().default(""),
  sortOrder: z.number().int().optional().default(0),
});
export type InsertEspressoSetup = z.infer<typeof insertEspressoSetupSchema>;

// 품목별 기간 집계 (주문/발주 공용)
export type ItemSummaryRow = {
  name: string;
  category: string;
  qty: number;
  amount: number;
};

export type EcountSettings = typeof ecountSettings.$inferSelect;
export const ecountSettingsInputSchema = z.object({
  comCode: z.string().min(1, "회사코드 필수"),
  userId: z.string().min(1, "사용자 ID 필수"),
  apiCertKey: z.string().optional(), // 입력 안 하면 기존 유지
  zone: z.string().optional().default(""),
  warehouseCode: z.string().min(1, "창고코드 필수"),
  useTestEndpoint: z.boolean().optional().default(true),
  autoSendSales: z.boolean().optional().default(false),
  autoSendPayments: z.boolean().optional().default(false),
  autoSendCustomer: z.boolean().optional().default(true),
  autoSendProduct: z.boolean().optional().default(true),
});
export type EcountSettingsInput = z.infer<typeof ecountSettingsInputSchema>;

export type EcountLog = typeof ecountLogs.$inferSelect;

export type EcountVerifyResult = {
  ok: boolean;
  zone?: string;
  results: Array<{ menu: string; ok: boolean; message: string; sample?: any }>;
  finishedAt: number;
};

// 거래처 원장 행 (주문 또는 입금)
export type LedgerRow =
  | {
      kind: "order";
      id: number;
      orderNo: string;
      date: number; // createdAt epoch ms
      debit: number; // 청구액 (+)
      credit: 0;
      balance: number;
      memo: string;
      status: string;
    }
  | {
      kind: "payment";
      id: number;
      date: number; // paidAt parsed to ms
      debit: 0;
      credit: number; // 입금액 (-)
      balance: number;
      method: string;
      memo: string;
    };

export type CustomerBalance = {
  customerId: number;
  businessName: string;
  managerName: string;
  phone: string;
  totalOrdered: number;
  totalPaid: number;
  balance: number; // 미수금 = totalOrdered - totalPaid
  lastOrderAt: number | null;
  lastPaidAt: string | null;
};

// 파싱된 헬퍼 타입
export type OrderItem = {
  productId: number;
  name: string;
  category: string;
  unitPrice: number;
  qty: number;
  amount: number;
};

export type PublicCustomer = Omit<Customer, "password">;

// 활동 로그 타입 (#10)
export type ActivityLog = typeof activityLogs.$inferSelect;
export type LogActivityInput = {
  actorUserId: number;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType?: string;
  targetId?: string;
  summary?: string;
  metadata?: Record<string, any>;
};
