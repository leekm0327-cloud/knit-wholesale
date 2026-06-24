import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ===== 거래처(도매 고객) + 관리자 통합 사용자 =====
export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("customer"), // "customer" | "admin"
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
export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(), // blend | decaf | single
  origin: text("origin").notNull().default(""), // 산지 / 설명
  // 중량옵션별 가격을 JSON으로 저장: {"200":12000,"500":28000,"1000":52000}
  prices: text("prices").notNull(),
  available: integer("available").notNull().default(1), // 1 판매중 / 0 품절
  sortOrder: integer("sort_order").notNull().default(0),
});

// ===== 주문 =====
export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderNo: text("order_no").notNull().unique(), // 주문번호 KC-YYMMDD-XXXX
  customerId: integer("customer_id").notNull(),
  // 주문 시점 거래처 스냅샷 (JSON)
  customerSnapshot: text("customer_snapshot").notNull(),
  // 품목 라인 JSON 배열: [{productId,name,category,weight,unitPrice,qty,amount}]
  items: text("items").notNull(),
  supplyAmount: integer("supply_amount").notNull(), // 공급가액
  vat: integer("vat").notNull(), // 부가세
  totalAmount: integer("total_amount").notNull(), // 합계
  desiredDate: text("desired_date").notNull().default(""), // 희망 납품일
  note: text("note").notNull().default(""), // 요청사항
  status: text("status").notNull().default("pending"), // pending | done
  trackingNo: text("tracking_no").notNull().default(""), // 송장번호
  adminMemo: text("admin_memo").notNull().default(""), // 관리자 메모
  createdAt: integer("created_at").notNull(),
});

// ===== Insert schemas =====
export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  role: true,
});

export const registerSchema = insertCustomerSchema.extend({
  email: z.string().email("올바른 이메일을 입력해 주세요."),
  password: z.string().min(6, "비밀번호는 6자 이상이어야 합니다."),
  businessName: z.string().min(1, "상호를 입력해 주세요."),
  managerName: z.string().min(1, "담당자명을 입력해 주세요."),
  phone: z.string().min(1, "연락처를 입력해 주세요."),
});

export const loginSchema = z.object({
  email: z.string().email("올바른 이메일을 입력해 주세요."),
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
});

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
        weight: z.number(),
        unitPrice: z.number(),
        qty: z.number().min(1),
        amount: z.number(),
      }),
    )
    .min(1, "주문 품목을 선택해 주세요."),
  desiredDate: z.string().optional().default(""),
  note: z.string().optional().default(""),
});

// ===== Types =====
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type Order = typeof orders.$inferSelect;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// 파싱된 헬퍼 타입
export type OrderItem = {
  productId: number;
  name: string;
  category: string;
  weight: number;
  unitPrice: number;
  qty: number;
  amount: number;
};

export type ProductPrices = Record<string, number>; // weight(g) -> price

export type PublicCustomer = Omit<Customer, "password">;
