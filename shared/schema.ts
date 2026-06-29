import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  note: text("note").notNull().default(""), // 요청사항
  status: text("status").notNull().default("pending"), // pending | done | cancelled
  trackingNo: text("tracking_no").notNull().default(""), // 송장번호
  adminMemo: text("admin_memo").notNull().default(""), // 관리자 메모
  quickRequest: integer("quick_request").notNull().default(0), // 퀵 요청 여부 (#6)
  cancelledAt: integer("cancelled_at"), // 취소 시각 (nullable)
  cancelledBy: integer("cancelled_by"), // 취소한 사용자 customer.id (관리자/거래처, nullable)
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
  businessName: z.string().min(1, "상호를 입력해 주세요."),
  managerName: z.string().min(1, "담당자명을 입력해 주세요."),
  phone: z.string().min(1, "연락처를 입력해 주세요."),
});

// 거래처 로그인: 상호명 + 비밀번호
export const loginSchema = z.object({
  businessName: z.string().min(1, "상호명을 입력해 주세요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
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

export type CustomerPrice = typeof customerPrices.$inferSelect;
// API 응답용 — 상품에 거래처별 가격 적용 여부표시
export type ProductWithPrice = Product & { effectivePrice: number; hasCustomPrice: boolean };

export type Post = typeof posts.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type PostWithMeta = Post & { commentCount: number };

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
