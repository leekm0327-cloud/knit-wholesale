import { customers, products, orders, payments, ecountSettings, ecountLogs, posts, comments, customerPrices, activityLogs, passwordResetTokens } from "@shared/schema";
import type {
  Customer,
  InsertCustomer,
  Product,
  InsertProduct,
  Order,
  OrderItem,
  Payment,
  InsertPayment,
  CustomerBalance,
  LedgerRow,
  EcountSettings,
  EcountLog,
  Post,
  Comment,
  PostWithMeta,
  PostCategory,
  CustomerPrice,
  ActivityLog,
  LogActivityInput,
  PasswordResetToken,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, gt, and, asc, gte, lte, like } from "drizzle-orm";
import bcrypt from "bcryptjs";
import path from "node:path";
import fs from "node:fs";

// DB 경로: 환경변수 DATA_DIR이 있으면 거기에, 없으면 작업 디렉토리에.
// Railway 등에서는 Volume mount path를 DATA_DIR로 지정 → 컨테이너 재시작 시에도 데이터 영구 보존.
const DATA_DIR = process.env.DATA_DIR || ".";
if (DATA_DIR !== "." && !fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ignore */ }
}
export const DB_PATH = path.join(DATA_DIR, "data.db");
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

// 테이블 자동 생성 (마이그레이션 대용 — 데모/프리뷰 환경용)
sqlite.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer',
  admin_role TEXT NOT NULL DEFAULT 'owner',
  business_name TEXT NOT NULL,
  manager_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  biz_reg_no TEXT NOT NULL DEFAULT '',
  tax_email TEXT NOT NULL DEFAULT '',
  default_address TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL DEFAULT 'transfer',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0,
  available INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  ecount_code TEXT NOT NULL DEFAULT '',
  detail_template TEXT NOT NULL DEFAULT '',
  detail_json TEXT NOT NULL DEFAULT '',
  detail_images TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  images TEXT NOT NULL DEFAULT '[]',
  author_id INTEGER,
  author_business_name TEXT NOT NULL,
  author_manager_name TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category, pinned DESC, created_at DESC);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  author_id INTEGER,
  author_business_name TEXT NOT NULL,
  author_manager_name TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
CREATE TABLE IF NOT EXISTS customer_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  price INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(customer_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_customer_prices_customer ON customer_prices(customer_id);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL,
  customer_snapshot TEXT NOT NULL,
  items TEXT NOT NULL,
  supply_amount INTEGER NOT NULL,
  vat INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,
  desired_date TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  tracking_no TEXT NOT NULL DEFAULT '',
  admin_memo TEXT NOT NULL DEFAULT '',
  quick_request INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'transfer',
  memo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE TABLE IF NOT EXISTS ecount_settings (
  id INTEGER PRIMARY KEY,
  com_code TEXT NOT NULL DEFAULT '',
  user_id TEXT NOT NULL DEFAULT '',
  api_cert_key_enc TEXT NOT NULL DEFAULT '',
  zone TEXT NOT NULL DEFAULT '',
  warehouse_code TEXT NOT NULL DEFAULT '',
  use_test_endpoint INTEGER NOT NULL DEFAULT 1,
  auto_send_sales INTEGER NOT NULL DEFAULT 0,
  auto_send_payments INTEGER NOT NULL DEFAULT 0,
  auto_send_customer INTEGER NOT NULL DEFAULT 1,
  auto_send_product INTEGER NOT NULL DEFAULT 1,
  last_verified_at INTEGER,
  verification_log TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ecount_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  action TEXT NOT NULL,
  label TEXT NOT NULL,
  ref_kind TEXT NOT NULL DEFAULT '',
  ref_id TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  ok INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  request_json TEXT NOT NULL DEFAULT '',
  response_json TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ecount_logs_created ON ecount_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ecount_logs_ref ON ecount_logs(ref_kind, ref_id);
CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER NOT NULL,
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  summary TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens(token);
`);

// ===== 멱등 컬럼 추가 마이그레이션 =====
for (const [table, col] of [
  ["ecount_settings", "auto_send_customer INTEGER NOT NULL DEFAULT 1"],
  ["ecount_settings", "auto_send_product INTEGER NOT NULL DEFAULT 1"],
  ["customers", "admin_role TEXT NOT NULL DEFAULT 'owner'"],
  ["orders", "quick_request INTEGER NOT NULL DEFAULT 0"],
  ["orders", "cancelled_at INTEGER"],
  ["orders", "cancelled_by INTEGER"],
]) {
  try {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${col};`);
  } catch (e: any) {
    if (!/duplicate column/i.test(String(e?.message ?? ""))) {
      console.warn(`[migration ${table}]`, e?.message);
    }
  }
}

// ===== V6: 상호명(business_name) 고유 인덱스 (멱등) =====
try {
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_business_name ON customers(business_name);`);
} catch (e: any) {
  console.warn("[migration] business_name unique idx", e?.message);
}

// ===== V7 #20: customers.email unique 제약 제거 (taxEmail 중복 허용) =====
// SQLite는 UNIQUE 컬럼 제약을 ALTER로 제거할 수 없으므로, 기존 DB에 email UNIQUE가
// 남아있으면 customers 테이블을 재생성하여 제약을 제거한다.
try {
  const customersSchemaRow = sqlite
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='customers';`)
    .get() as { sql?: string } | undefined;
  const customersSql = customersSchemaRow?.sql ?? "";
  // "email" 컬럼에 UNIQUE가 박혀있는지 정규식으로 확인 (대소문자 무시)
  const emailUniqueRegex = /\bemail\b[^,)]*\bUNIQUE\b/i;
  if (emailUniqueRegex.test(customersSql)) {
    console.log("[migration v7] customers.email UNIQUE 감지 → 테이블 재생성으로 제약 제거");
    sqlite.exec(`
      PRAGMA foreign_keys=OFF;
      BEGIN TRANSACTION;
      CREATE TABLE customers_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'customer',
        business_name TEXT NOT NULL,
        manager_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        biz_reg_no TEXT NOT NULL DEFAULT '',
        tax_email TEXT NOT NULL DEFAULT '',
        default_address TEXT NOT NULL DEFAULT '',
        payment_method TEXT NOT NULL DEFAULT 'transfer',
        created_at INTEGER NOT NULL,
        admin_role TEXT NOT NULL DEFAULT 'owner'
      );
      INSERT INTO customers_new (id, email, password, role, business_name, manager_name, phone, biz_reg_no, tax_email, default_address, payment_method, created_at, admin_role)
        SELECT id, email, password, role, business_name, manager_name, phone, biz_reg_no, tax_email, default_address, payment_method, created_at, admin_role FROM customers;
      DROP TABLE customers;
      ALTER TABLE customers_new RENAME TO customers;
      COMMIT;
      PRAGMA foreign_keys=ON;
    `);
    // 재생성 후 business_name unique 인덱스 다시 생성 (위에서 만든 게 DROP 되었으므로)
    sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_business_name ON customers(business_name);`);
    console.log("[migration v7] customers 테이블 재생성 완료, email UNIQUE 제거됨");
  }
} catch (e: any) {
  console.warn("[migration v7] customers email unique 제거 실패", e?.message);
}

// 명시적으로 만들어진 email unique index가 있다면 추가로 정리
try {
  sqlite.exec(`DROP INDEX IF EXISTS idx_customers_email;`);
} catch (e: any) {
  /* ignore */
}

// ===== v2 마이그레이션: 중량별 분리 상품 구조로 전환 =====
try {
  const cols = sqlite
    .prepare(`PRAGMA table_info(products);`)
    .all() as Array<{ name: string }>;
  const hasOldPricesCol = cols.some((c) => c.name === "prices");
  if (hasOldPricesCol) {
    console.log("[migration v2] 이전 상품 구조 감지 → products/orders/ecount_logs 초기화");
    sqlite.exec(`
      DROP TABLE IF EXISTS products;
      DROP TABLE IF EXISTS orders;
      DROP TABLE IF EXISTS ecount_logs;
      CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        origin TEXT NOT NULL DEFAULT '',
        price INTEGER NOT NULL DEFAULT 0,
        available INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        ecount_code TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no TEXT NOT NULL UNIQUE,
        customer_id INTEGER NOT NULL,
        customer_snapshot TEXT NOT NULL,
        items TEXT NOT NULL,
        supply_amount INTEGER NOT NULL,
        vat INTEGER NOT NULL,
        total_amount INTEGER NOT NULL,
        desired_date TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        tracking_no TEXT NOT NULL DEFAULT '',
        admin_memo TEXT NOT NULL DEFAULT '',
        quick_request INTEGER NOT NULL DEFAULT 0,
        cancelled_at INTEGER,
        cancelled_by INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE ecount_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        action TEXT NOT NULL,
        label TEXT NOT NULL,
        ref_kind TEXT NOT NULL DEFAULT '',
        ref_id TEXT NOT NULL DEFAULT '',
        summary TEXT NOT NULL DEFAULT '',
        ok INTEGER NOT NULL DEFAULT 0,
        message TEXT NOT NULL DEFAULT '',
        request_json TEXT NOT NULL DEFAULT '',
        response_json TEXT NOT NULL DEFAULT '',
        duration_ms INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_ecount_logs_created ON ecount_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ecount_logs_ref ON ecount_logs(ref_kind, ref_id);
    `);
  }
} catch (e: any) {
  console.warn("[migration v2]", e?.message);
}

// 혹시 이미 v2 구조인데 ecount_code/price 컬럼이 빠졌을 수도 있으니 멱등 ALTER 한 번 더
for (const col of [
  "ecount_code TEXT NOT NULL DEFAULT ''",
  "price INTEGER NOT NULL DEFAULT 0",
  "detail_template TEXT NOT NULL DEFAULT ''",
  "detail_json TEXT NOT NULL DEFAULT ''",
  "detail_images TEXT NOT NULL DEFAULT '[]'",
]) {
  try {
    sqlite.exec(`ALTER TABLE products ADD COLUMN ${col};`);
  } catch (e: any) {
    if (!/duplicate column/i.test(String(e?.message ?? ""))) {
      console.warn("[products migration]", e?.message);
    }
  }
}

export const db = drizzle(sqlite);

export interface IStorage {
  // customers
  getCustomer(id: number): Promise<Customer | undefined>;
  getCustomerByEmail(email: string): Promise<Customer | undefined>;
  getCustomerOnlyByEmail(email: string): Promise<Customer | undefined>;
  getCustomerByBusinessName(name: string): Promise<Customer | undefined>;
  createCustomer(c: InsertCustomer & { password: string; role?: string; adminRole?: string }): Promise<Customer>;
  updateCustomer(id: number, patch: Partial<Customer>): Promise<Customer | undefined>;
  listCustomers(): Promise<Customer[]>;
  listAdmins(): Promise<Customer[]>;
  deleteCustomer(id: number): Promise<void>;
  // products
  listProducts(): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(p: InsertProduct): Promise<Product>;
  updateProduct(id: number, patch: Partial<Product>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<void>;
  // orders
  createOrder(
    o: Omit<Order, "id" | "cancelledAt" | "cancelledBy"> &
      Partial<Pick<Order, "cancelledAt" | "cancelledBy">>,
  ): Promise<Order>;
  getOrder(id: number): Promise<Order | undefined>;
  getOrderByNo(orderNo: string): Promise<Order | undefined>;
  listOrders(): Promise<Order[]>;
  listOrdersByCustomer(customerId: number): Promise<Order[]>;
  listOrdersSince(ts: number): Promise<Order[]>;
  updateOrder(id: number, patch: Partial<Order>): Promise<Order | undefined>;
  // payments
  createPayment(p: InsertPayment): Promise<Payment>;
  deletePayment(id: number): Promise<void>;
  getPayment(id: number): Promise<Payment | undefined>;
  listPaymentsByCustomer(customerId: number): Promise<Payment[]>;
  listAllPayments(): Promise<Payment[]>;
  getCustomerBalances(): Promise<CustomerBalance[]>;
  getCustomerLedger(customerId: number): Promise<{ balance: CustomerBalance | null; rows: LedgerRow[] }>;
  // ecount
  getEcountSettings(): Promise<EcountSettings | undefined>;
  updateEcountSettings(patch: Partial<EcountSettings>): Promise<EcountSettings>;
  // ecount logs
  insertEcountLog(log: Omit<EcountLog, "id" | "createdAt"> & { createdAt?: number }): Promise<EcountLog>;
  listEcountLogs(filter?: { action?: string; refKind?: string; refId?: string; okOnly?: boolean; failOnly?: boolean; sinceTs?: number; limit?: number }): Promise<EcountLog[]>;
  getEcountLog(id: number): Promise<EcountLog | undefined>;
  deleteOldEcountLogs(beforeTs: number): Promise<number>;
  // posts
  listPosts(category?: PostCategory): Promise<PostWithMeta[]>;
  getPost(id: number): Promise<Post | undefined>;
  createPost(p: Omit<Post, "id" | "createdAt" | "updatedAt" | "viewCount">): Promise<Post>;
  updatePost(id: number, patch: Partial<Post>): Promise<Post | undefined>;
  deletePost(id: number): Promise<void>;
  incrementPostView(id: number): Promise<void>;
  // comments
  listComments(postId: number): Promise<Comment[]>;
  createComment(c: Omit<Comment, "id" | "createdAt">): Promise<Comment>;
  deleteComment(id: number): Promise<void>;
  // 거래처별 가격
  listCustomerPrices(customerId: number): Promise<CustomerPrice[]>;
  getCustomerPrice(customerId: number, productId: number): Promise<CustomerPrice | undefined>;
  upsertCustomerPrice(customerId: number, productId: number, price: number): Promise<CustomerPrice>;
  deleteCustomerPrice(customerId: number, productId: number): Promise<void>;
  // 활동 로그 (#10)
  logActivity(input: LogActivityInput): Promise<ActivityLog>;
  listActivityLogs(filter?: { action?: string; actorEmail?: string; targetType?: string; from?: number; to?: number; page?: number; limit?: number }): Promise<{ logs: ActivityLog[]; total: number }>;
  // 비밀번호 재설정 토큰 (#26)
  createPasswordResetToken(customerId: number, token: string, expiresAt: number): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  markPasswordResetTokenUsed(tokenId: number): Promise<void>;
  updateCustomerPassword(customerId: number, hashedPassword: string): Promise<void>;
  // #32 거래내역서
  listTransactions(customerId: number, startDate: string, endDate: string): Promise<{
    orders: Array<Order & { parsedItems: Array<{ name: string; qty: number; unitPrice: number; amount: number }> }>;
    totalAmount: number;
    paidAmount: number;
    unpaidAmount: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  async getCustomer(id: number) {
    return db.select().from(customers).where(eq(customers.id, id)).get();
  }
  async getCustomerByEmail(email: string) {
    return db.select().from(customers).where(eq(customers.email, email)).get();
  }
  // V8 #26: 관리자가 같은 이메일을 쓸 수 있으므로, customer만 명시적으로 조회
  async getCustomerOnlyByEmail(email: string) {
    return db.select().from(customers)
      .where(and(eq(customers.email, email), eq(customers.role, "customer")))
      .get();
  }
  async getCustomerByBusinessName(name: string) {
    return db.select().from(customers).where(eq(customers.businessName, name)).get();
  }
  async createCustomer(c: InsertCustomer & { password: string; role?: string; adminRole?: string }) {
    return db
      .insert(customers)
      .values({
        email: c.email,
        password: c.password,
        role: c.role ?? "customer",
        adminRole: c.adminRole ?? "owner",
        businessName: c.businessName,
        managerName: c.managerName,
        phone: c.phone,
        bizRegNo: c.bizRegNo ?? "",
        taxEmail: c.taxEmail ?? "",
        defaultAddress: c.defaultAddress ?? "",
        paymentMethod: c.paymentMethod ?? "transfer",
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }
  async updateCustomer(id: number, patch: Partial<Customer>) {
    return db.update(customers).set(patch).where(eq(customers.id, id)).returning().get();
  }
  async listCustomers() {
    return db
      .select()
      .from(customers)
      .where(eq(customers.role, "customer"))
      .orderBy(desc(customers.createdAt))
      .all();
  }
  async listAdmins() {
    return db
      .select()
      .from(customers)
      .where(eq(customers.role, "admin"))
      .orderBy(desc(customers.createdAt))
      .all();
  }
  async deleteCustomer(id: number) {
    db.delete(customers).where(eq(customers.id, id)).run();
  }

  async listProducts() {
    return db.select().from(products).orderBy(products.sortOrder).all();
  }
  async getProduct(id: number) {
    return db.select().from(products).where(eq(products.id, id)).get();
  }
  async createProduct(p: InsertProduct) {
    return db.insert(products).values(p).returning().get();
  }
  async updateProduct(id: number, patch: Partial<Product>) {
    return db.update(products).set(patch).where(eq(products.id, id)).returning().get();
  }
  async deleteProduct(id: number) {
    db.delete(products).where(eq(products.id, id)).run();
  }

  async createOrder(
    o: Omit<Order, "id" | "cancelledAt" | "cancelledBy"> &
      Partial<Pick<Order, "cancelledAt" | "cancelledBy">>,
  ) {
    return db
      .insert(orders)
      .values({ cancelledAt: null, cancelledBy: null, ...o })
      .returning()
      .get();
  }
  async getOrder(id: number) {
    return db.select().from(orders).where(eq(orders.id, id)).get();
  }
  async getOrderByNo(orderNo: string) {
    return db.select().from(orders).where(eq(orders.orderNo, orderNo)).get();
  }
  async listOrders() {
    return db.select().from(orders).orderBy(desc(orders.createdAt)).all();
  }
  async listOrdersByCustomer(customerId: number) {
    return db
      .select()
      .from(orders)
      .where(eq(orders.customerId, customerId))
      .orderBy(desc(orders.createdAt))
      .all();
  }
  async listOrdersSince(ts: number) {
    return db
      .select()
      .from(orders)
      .where(gt(orders.createdAt, ts))
      .orderBy(desc(orders.createdAt))
      .all();
  }
  async updateOrder(id: number, patch: Partial<Order>) {
    return db.update(orders).set(patch).where(eq(orders.id, id)).returning().get();
  }

  // ===== payments =====
  async createPayment(p: InsertPayment): Promise<Payment> {
    return db
      .insert(payments)
      .values({
        customerId: p.customerId,
        amount: p.amount,
        paidAt: p.paidAt,
        method: p.method ?? "transfer",
        memo: p.memo ?? "",
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }
  async deletePayment(id: number) {
    db.delete(payments).where(eq(payments.id, id)).run();
  }
  async getPayment(id: number) {
    return db.select().from(payments).where(eq(payments.id, id)).get();
  }
  async listPaymentsByCustomer(customerId: number) {
    return db
      .select()
      .from(payments)
      .where(eq(payments.customerId, customerId))
      .orderBy(desc(payments.paidAt), desc(payments.id))
      .all();
  }
  async listAllPayments() {
    return db.select().from(payments).orderBy(desc(payments.paidAt), desc(payments.id)).all();
  }

  async getCustomerBalances(): Promise<CustomerBalance[]> {
    const allCustomers = await this.listCustomers();
    const allOrders = await this.listOrders();
    const allPayments = await this.listAllPayments();

    return allCustomers.map((c) => {
      const myOrders = allOrders.filter((o) => o.customerId === c.id);
      const myPayments = allPayments.filter((p) => p.customerId === c.id);
      const totalOrdered = myOrders.reduce((s, o) => s + o.totalAmount, 0);
      const totalPaid = myPayments.reduce((s, p) => s + p.amount, 0);
      return {
        customerId: c.id,
        businessName: c.businessName,
        managerName: c.managerName,
        phone: c.phone,
        totalOrdered,
        totalPaid,
        balance: totalOrdered - totalPaid,
        lastOrderAt: myOrders[0]?.createdAt ?? null,
        lastPaidAt: myPayments[0]?.paidAt ?? null,
      };
    });
  }

  async getCustomerLedger(customerId: number) {
    const customer = await this.getCustomer(customerId);
    if (!customer) return { balance: null as CustomerBalance | null, rows: [] as LedgerRow[] };
    const myOrders = await this.listOrdersByCustomer(customerId);
    const myPayments = await this.listPaymentsByCustomer(customerId);

    type RawRow =
      | { kind: "order"; ts: number; o: Order }
      | { kind: "payment"; ts: number; p: Payment };
    const raws: RawRow[] = [
      ...myOrders.map((o) => ({ kind: "order" as const, ts: o.createdAt, o })),
      ...myPayments.map((p) => ({
        kind: "payment" as const,
        ts: new Date(p.paidAt + "T00:00:00+09:00").getTime() || p.createdAt,
        p,
      })),
    ].sort((a, b) => a.ts - b.ts);

    let running = 0;
    const rowsAsc: LedgerRow[] = raws.map((r) => {
      if (r.kind === "order") {
        running += r.o.totalAmount;
        return {
          kind: "order",
          id: r.o.id,
          orderNo: r.o.orderNo,
          date: r.ts,
          debit: r.o.totalAmount,
          credit: 0,
          balance: running,
          memo: r.o.note,
          status: r.o.status,
        };
      } else {
        running -= r.p.amount;
        return {
          kind: "payment",
          id: r.p.id,
          date: r.ts,
          debit: 0,
          credit: r.p.amount,
          balance: running,
          method: r.p.method,
          memo: r.p.memo,
        };
      }
    });
    const rows = rowsAsc.slice().reverse();

    const totalOrdered = myOrders.reduce((s, o) => s + o.totalAmount, 0);
    const totalPaid = myPayments.reduce((s, p) => s + p.amount, 0);
    return {
      balance: {
        customerId: customer.id,
        businessName: customer.businessName,
        managerName: customer.managerName,
        phone: customer.phone,
        totalOrdered,
        totalPaid,
        balance: totalOrdered - totalPaid,
        lastOrderAt: myOrders[0]?.createdAt ?? null,
        lastPaidAt: myPayments[0]?.paidAt ?? null,
      } as CustomerBalance,
      rows,
    };
  }
  // ===== ECOUNT 설정 (단일 레코드, id=1) =====
  async getEcountSettings(): Promise<EcountSettings | undefined> {
    return db.select().from(ecountSettings).where(eq(ecountSettings.id, 1)).get();
  }

  async updateEcountSettings(patch: Partial<EcountSettings>): Promise<EcountSettings> {
    const existing = await this.getEcountSettings();
    const now = Date.now();
    if (!existing) {
      const row: EcountSettings = {
        id: 1,
        comCode: patch.comCode ?? "",
        userId: patch.userId ?? "",
        apiCertKeyEnc: patch.apiCertKeyEnc ?? "",
        zone: patch.zone ?? "",
        warehouseCode: patch.warehouseCode ?? "",
        useTestEndpoint: patch.useTestEndpoint ?? 1,
        autoSendSales: patch.autoSendSales ?? 0,
        autoSendPayments: patch.autoSendPayments ?? 0,
        autoSendCustomer: patch.autoSendCustomer ?? 1,
        autoSendProduct: patch.autoSendProduct ?? 1,
        lastVerifiedAt: patch.lastVerifiedAt ?? null,
        verificationLog: patch.verificationLog ?? "",
        updatedAt: now,
      };
      return db.insert(ecountSettings).values(row).returning().get();
    }
    return db
      .update(ecountSettings)
      .set({ ...patch, updatedAt: now })
      .where(eq(ecountSettings.id, 1))
      .returning()
      .get();
  }

  // ===== ECOUNT 로그 =====
  async insertEcountLog(log: Omit<EcountLog, "id" | "createdAt"> & { createdAt?: number }): Promise<EcountLog> {
    return db
      .insert(ecountLogs)
      .values({
        createdAt: log.createdAt ?? Date.now(),
        action: log.action,
        label: log.label,
        refKind: log.refKind ?? "",
        refId: log.refId ?? "",
        summary: log.summary ?? "",
        ok: log.ok ?? 0,
        message: log.message ?? "",
        requestJson: log.requestJson ?? "",
        responseJson: log.responseJson ?? "",
        durationMs: log.durationMs ?? 0,
      })
      .returning()
      .get();
  }

  async listEcountLogs(filter?: { action?: string; refKind?: string; refId?: string; okOnly?: boolean; failOnly?: boolean; sinceTs?: number; limit?: number }): Promise<EcountLog[]> {
    const conds: any[] = [];
    if (filter?.action) conds.push(eq(ecountLogs.action, filter.action));
    if (filter?.refKind) conds.push(eq(ecountLogs.refKind, filter.refKind));
    if (filter?.refId) conds.push(eq(ecountLogs.refId, filter.refId));
    if (filter?.okOnly) conds.push(eq(ecountLogs.ok, 1));
    if (filter?.failOnly) conds.push(eq(ecountLogs.ok, 0));
    if (filter?.sinceTs) conds.push(gt(ecountLogs.createdAt, filter.sinceTs));
    let q: any = db.select().from(ecountLogs);
    if (conds.length === 1) q = q.where(conds[0]);
    else if (conds.length > 1) q = q.where(and(...conds));
    return q.orderBy(desc(ecountLogs.createdAt)).limit(filter?.limit ?? 500).all();
  }

  async getEcountLog(id: number): Promise<EcountLog | undefined> {
    return db.select().from(ecountLogs).where(eq(ecountLogs.id, id)).get();
  }

  async deleteOldEcountLogs(beforeTs: number): Promise<number> {
    const result = sqlite.prepare("DELETE FROM ecount_logs WHERE created_at < ?").run(beforeTs);
    return result.changes ?? 0;
  }

  // ===== 게시판 =====
  async listPosts(category?: PostCategory): Promise<PostWithMeta[]> {
    const rows = category
      ? db.select().from(posts).where(eq(posts.category, category)).orderBy(desc(posts.pinned), desc(posts.createdAt)).all()
      : db.select().from(posts).orderBy(desc(posts.pinned), desc(posts.createdAt)).all();
    // 댓글 수 집계
    const countMap = new Map<number, number>();
    if (rows.length > 0) {
      const allComments = db.select().from(comments).all();
      for (const c of allComments) {
        countMap.set(c.postId, (countMap.get(c.postId) ?? 0) + 1);
      }
    }
    return rows.map((r) => ({ ...r, commentCount: countMap.get(r.id) ?? 0 }));
  }
  async getPost(id: number) {
    return db.select().from(posts).where(eq(posts.id, id)).get();
  }
  async createPost(p: Omit<Post, "id" | "createdAt" | "updatedAt" | "viewCount">): Promise<Post> {
    const now = Date.now();
    return db
      .insert(posts)
      .values({ ...p, viewCount: 0, createdAt: now, updatedAt: now })
      .returning()
      .get();
  }
  async updatePost(id: number, patch: Partial<Post>): Promise<Post | undefined> {
    return db
      .update(posts)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(posts.id, id))
      .returning()
      .get();
  }
  async deletePost(id: number) {
    db.delete(comments).where(eq(comments.postId, id)).run();
    db.delete(posts).where(eq(posts.id, id)).run();
  }
  async incrementPostView(id: number) {
    sqlite.prepare("UPDATE posts SET view_count = view_count + 1 WHERE id = ?").run(id);
  }
  async listComments(postId: number): Promise<Comment[]> {
    return db.select().from(comments).where(eq(comments.postId, postId)).orderBy(asc(comments.createdAt)).all();
  }
  async createComment(c: Omit<Comment, "id" | "createdAt">): Promise<Comment> {
    return db
      .insert(comments)
      .values({ ...c, createdAt: Date.now() })
      .returning()
      .get();
  }
  async deleteComment(id: number) {
    db.delete(comments).where(eq(comments.id, id)).run();
  }

  // ===== 거래처별 가격 =====
  async listCustomerPrices(customerId: number) {
    return db
      .select()
      .from(customerPrices)
      .where(eq(customerPrices.customerId, customerId))
      .all();
  }
  async getCustomerPrice(customerId: number, productId: number) {
    return db
      .select()
      .from(customerPrices)
      .where(
        and(
          eq(customerPrices.customerId, customerId),
          eq(customerPrices.productId, productId),
        ),
      )
      .get();
  }
  async upsertCustomerPrice(customerId: number, productId: number, price: number) {
    const now = Date.now();
    const existing = await this.getCustomerPrice(customerId, productId);
    if (existing) {
      return db
        .update(customerPrices)
        .set({ price, updatedAt: now })
        .where(eq(customerPrices.id, existing.id))
        .returning()
        .get()!;
    }
    return db
      .insert(customerPrices)
      .values({ customerId, productId, price, createdAt: now, updatedAt: now })
      .returning()
      .get();
  }
  async deleteCustomerPrice(customerId: number, productId: number) {
    db.delete(customerPrices)
      .where(
        and(
          eq(customerPrices.customerId, customerId),
          eq(customerPrices.productId, productId),
        ),
      )
      .run();
  }

  // ===== 활동 로그 (#10) =====
  async logActivity(input: LogActivityInput): Promise<ActivityLog> {
    return db
      .insert(activityLogs)
      .values({
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        actorRole: input.actorRole,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        summary: input.summary ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }

  // ===== 비밀번호 재설정 토큰 (#26) =====
  async createPasswordResetToken(customerId: number, token: string, expiresAt: number): Promise<PasswordResetToken> {
    return db
      .insert(passwordResetTokens)
      .values({ customerId, token, expiresAt, usedAt: null, createdAt: Date.now() })
      .returning()
      .get();
  }
  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    return db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token)).get();
  }
  async markPasswordResetTokenUsed(tokenId: number): Promise<void> {
    db.update(passwordResetTokens).set({ usedAt: Date.now() }).where(eq(passwordResetTokens.id, tokenId)).run();
  }
  async updateCustomerPassword(customerId: number, hashedPassword: string): Promise<void> {
    db.update(customers).set({ password: hashedPassword }).where(eq(customers.id, customerId)).run();
  }

  // #32 거래내역서
  async listTransactions(customerId: number, startDate: string, endDate: string): Promise<{
    orders: Array<Order & { parsedItems: Array<{ name: string; qty: number; unitPrice: number; amount: number }> }>;
    totalAmount: number;
    paidAmount: number;
    unpaidAmount: number;
  }> {
    // startDate / endDate: YYYY-MM-DD (KST 기준)
    const startTs = new Date(startDate + "T00:00:00+09:00").getTime();
    const endTs = new Date(endDate + "T23:59:59+09:00").getTime();

    const allOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.customerId, customerId),
          gte(orders.createdAt, startTs),
          lte(orders.createdAt, endTs),
        ),
      )
      .orderBy(asc(orders.createdAt))
      .all();

    // 취소된 주문 제외
    const activeOrders = allOrders.filter((o) => o.status !== "cancelled");

    const resultOrders = activeOrders.map((o) => {
      let parsedItems: Array<{ name: string; qty: number; unitPrice: number; amount: number }> = [];
      try {
        parsedItems = JSON.parse(o.items);
      } catch { /* noop */ }
      return { ...o, parsedItems };
    });

    const totalAmount = resultOrders.reduce((s, o) => s + o.totalAmount, 0);

    // 기간 내 입금 조회 (paidAt이 해당 기간 내)
    const allPayments = await this.listPaymentsByCustomer(customerId);
    const paidAmount = allPayments
      .filter((p) => p.paidAt >= startDate && p.paidAt <= endDate)
      .reduce((s, p) => s + p.amount, 0);

    return {
      orders: resultOrders,
      totalAmount,
      paidAmount,
      unpaidAmount: Math.max(0, totalAmount - paidAmount),
    };
  }

  async listActivityLogs(filter?: {
    action?: string;
    actorEmail?: string;
    targetType?: string;
    from?: number;
    to?: number;
    page?: number;
    limit?: number;
  }): Promise<{ logs: ActivityLog[]; total: number }> {
    const limit = filter?.limit ?? 50;
    const offset = ((filter?.page ?? 1) - 1) * limit;

    const conds: any[] = [];
    if (filter?.action) conds.push(eq(activityLogs.action, filter.action));
    if (filter?.actorEmail) conds.push(like(activityLogs.actorEmail, `%${filter.actorEmail}%`));
    if (filter?.targetType) conds.push(eq(activityLogs.targetType, filter.targetType));
    if (filter?.from) conds.push(gte(activityLogs.createdAt, filter.from));
    if (filter?.to) conds.push(lte(activityLogs.createdAt, filter.to));

    let q: any = db.select().from(activityLogs);
    if (conds.length === 1) q = q.where(conds[0]);
    else if (conds.length > 1) q = q.where(and(...conds));

    const allRows = await q.orderBy(desc(activityLogs.createdAt)).all();
    const total = allRows.length;
    const logs = allRows.slice(offset, offset + limit);
    return { logs, total };
  }
}

export const storage = new DatabaseStorage();

// ===== 시드 데이터 (#2: 관리자 계정 1개만) =====
export async function seed() {
  // 관리자 계정이 이미 있으면 skip
  const existingAdmins = db.select().from(customers).where(eq(customers.role, "admin")).all();
  if (existingAdmins.length > 0) return;

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  // --- 관리자 계정만 시드 (#8 회사 이메일) ---
  await storage.createCustomer({
    email: "knitcoffee00@gmail.com",
    password: hash("knit2026"),
    role: "admin",
    adminRole: "owner",
    businessName: "니트커피",
    managerName: "니트커피 관리자",
    phone: "010-0000-0000",
    bizRegNo: "000-00-00000",
    taxEmail: "knitcoffee00@gmail.com",
    defaultAddress: "서울 중구 남산트라팰리스 1층 니트커피",
    paymentMethod: "transfer",
  });

  console.log("[seed] 초기 데이터 생성 완료 (관리자 1개만)");
}
