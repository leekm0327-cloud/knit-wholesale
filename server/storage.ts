import { customers, products, orders, payments, ecountSettings, ecountLogs, posts, comments, customerPrices, activityLogs, passwordResetTokens, favorites, suppliers, purchases, supplierPayments, storeSales, fixedCostItems, expenses, personalCategories, personalLedger, kakaoTokens, news, wholesaleInquiries, visitRequests } from "@shared/schema";
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
  News,
  WholesaleInquiry,
  VisitRequest,
  CustomerPrice,
  Favorite,
  ActivityLog,
  LogActivityInput,
  PasswordResetToken,
  Supplier,
  InsertSupplier,
  Purchase,
  InsertPurchase,
  SupplierPayment,
  InsertSupplierPayment,
  SupplierBalance,
  SupplierLedgerRow,
  PurchaseQtyAgg,
  PurchaseItem,
  StoreSale,
  InsertStoreSale,
  FixedCostItem,
  InsertFixedCostItem,
  Expense,
  InsertExpense,
  DashboardSummary,
  DashboardGranularity,
  Sector,
  SectorPnl,
  PersonalCategory,
  InsertPersonalCategory,
  PersonalLedgerEntry,
  InsertPersonalLedger,
  PersonalSummary,
  KakaoTokens,
} from "@shared/schema";
import { SECTORS } from "@shared/schema";
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
  cost_price INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(customer_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_customer ON favorites(customer_id);
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
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  purchase_no TEXT NOT NULL UNIQUE,
  purchase_date TEXT NOT NULL,
  items TEXT NOT NULL,
  total_amount INTEGER NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
CREATE TABLE IF NOT EXISTS supplier_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'transfer',
  memo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
CREATE TABLE IF NOT EXISTS store_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_date TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL DEFAULT 0,
  memo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fixed_cost_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  memo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE TABLE IF NOT EXISTS personal_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS personal_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  category_id INTEGER NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  memo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_personal_ledger_date ON personal_ledger(date);
CREATE TABLE IF NOT EXISTS kakao_tokens (
  id INTEGER PRIMARY KEY,
  access_token TEXT NOT NULL DEFAULT '',
  refresh_token TEXT NOT NULL DEFAULT '',
  access_token_expires_at INTEGER NOT NULL DEFAULT 0,
  refresh_token_expires_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  cover_image TEXT NOT NULL DEFAULT '',
  blocks TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  pinned INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_news_status ON news(status, pinned DESC, published_at DESC);

CREATE TABLE IF NOT EXISTS wholesale_inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  volume TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  admin_memo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS visit_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  business_name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT 'open',
  preferred_date1 TEXT NOT NULL DEFAULT '',
  preferred_date2 TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  confirmed_date TEXT NOT NULL DEFAULT '',
  admin_memo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
`);

// ===== 멱등 컬럼 추가 마이그레이션 =====
for (const [table, col] of [
  ["ecount_settings", "auto_send_customer INTEGER NOT NULL DEFAULT 1"],
  ["ecount_settings", "auto_send_product INTEGER NOT NULL DEFAULT 1"],
  ["customers", "admin_role TEXT NOT NULL DEFAULT 'owner'"],
  ["orders", "quick_request INTEGER NOT NULL DEFAULT 0"],
  ["orders", "cancelled_at INTEGER"],
  ["orders", "cancelled_by INTEGER"],
  ["orders", "auto_purchase_id INTEGER"],
  // B-2: 샘플 주문 여부
  ["orders", "is_sample INTEGER NOT NULL DEFAULT 0"],
  // 관리자 지정 주문 일자 (ECOUNT 전송 IO_DATE로 사용)
  ["orders", "ecount_date TEXT NOT NULL DEFAULT ''"],
  // B-3: 사업자 검증/승인, 샘플 사용 여부
  ["customers", "biz_verified INTEGER NOT NULL DEFAULT 0"],
  ["customers", "sample_used INTEGER NOT NULL DEFAULT 0"],
  // D: 재무 부문(sector) 컬럼. 기존행은 default 값으로 채워짐.
  ["store_sales", "sector TEXT NOT NULL DEFAULT 'store'"],
  ["expenses", "sector TEXT NOT NULL DEFAULT 'common'"],
  ["fixed_cost_items", "sector TEXT NOT NULL DEFAULT 'common'"],
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

// ===== D: store_sales.sale_date UNIQUE 제약 제거 =====
// 부문(sector)이 추가되면서 같은 날짜에 매장/온라인 매출을 각각 입력할 수 있어야 한다.
// 기존 sale_date UNIQUE(autoindex)가 남아있으면 테이블을 재생성해 (sale_date, sector) 단위로 관리한다.
try {
  const idxList: any[] = sqlite.prepare(`PRAGMA index_list('store_sales')`).all();
  const hasAutoUnique = idxList.some((i) => i.unique === 1 && /autoindex/i.test(String(i.name)));
  if (hasAutoUnique) {
    console.log("[migration D] store_sales.sale_date UNIQUE 감지 → 테이블 재생성으로 제약 제거");
    sqlite.exec(`
      PRAGMA foreign_keys=OFF;
      BEGIN TRANSACTION;
      CREATE TABLE store_sales_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_date TEXT NOT NULL,
        amount INTEGER NOT NULL DEFAULT 0,
        memo TEXT NOT NULL DEFAULT '',
        sector TEXT NOT NULL DEFAULT 'store',
        created_at INTEGER NOT NULL
      );
      INSERT INTO store_sales_new (id, sale_date, amount, memo, sector, created_at)
        SELECT id, sale_date, amount, memo, COALESCE(sector, 'store'), created_at FROM store_sales;
      DROP TABLE store_sales;
      ALTER TABLE store_sales_new RENAME TO store_sales;
      CREATE INDEX IF NOT EXISTS idx_store_sales_date ON store_sales(sale_date);
      COMMIT;
      PRAGMA foreign_keys=ON;
    `);
    console.log("[migration D] store_sales 재생성 완료 (sale_date UNIQUE 제거)");
  }
} catch (e: any) {
  console.warn("[migration D] store_sales 재생성 실패", e?.message);
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
  "cost_price INTEGER NOT NULL DEFAULT 0",
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
    o: Omit<Order, "id" | "cancelledAt" | "cancelledBy" | "autoPurchaseId"> &
      Partial<Pick<Order, "cancelledAt" | "cancelledBy" | "autoPurchaseId">>,
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
  // ③ 소식(news)
  listNews(opts?: { publishedOnly?: boolean }): Promise<News[]>;
  getNews(id: number): Promise<News | undefined>;
  createNews(n: Omit<News, "id" | "createdAt" | "updatedAt" | "viewCount">): Promise<News>;
  updateNews(id: number, patch: Partial<News>): Promise<News | undefined>;
  deleteNews(id: number): Promise<void>;
  incrementNewsView(id: number): Promise<void>;
  // 홀세일 납품 문의
  createInquiry(i: Omit<WholesaleInquiry, "id" | "createdAt" | "status" | "adminMemo">): Promise<WholesaleInquiry>;
  listInquiries(): Promise<WholesaleInquiry[]>;
  getInquiry(id: number): Promise<WholesaleInquiry | undefined>;
  updateInquiry(id: number, patch: Partial<WholesaleInquiry>): Promise<WholesaleInquiry | undefined>;

  createVisitRequest(v: Omit<VisitRequest, "id" | "createdAt" | "status" | "confirmedDate" | "adminMemo">): Promise<VisitRequest>;
  listVisitRequests(): Promise<VisitRequest[]>;
  getVisitRequest(id: number): Promise<VisitRequest | undefined>;
  updateVisitRequest(id: number, patch: Partial<VisitRequest>): Promise<VisitRequest | undefined>;
  // comments
  listComments(postId: number): Promise<Comment[]>;
  createComment(c: Omit<Comment, "id" | "createdAt">): Promise<Comment>;
  deleteComment(id: number): Promise<void>;
  // 거래처별 가격
  listCustomerPrices(customerId: number): Promise<CustomerPrice[]>;
  getCustomerPrice(customerId: number, productId: number): Promise<CustomerPrice | undefined>;
  upsertCustomerPrice(customerId: number, productId: number, price: number): Promise<CustomerPrice>;
  deleteCustomerPrice(customerId: number, productId: number): Promise<void>;
  // 즐겨찾기
  listFavorites(customerId: number): Promise<Favorite[]>;
  addFavorite(customerId: number, productId: number): Promise<Favorite>;
  removeFavorite(customerId: number, productId: number): Promise<void>;
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
  // OEM 공급처/발주/지급
  listSuppliers(): Promise<Supplier[]>;
  getSupplier(id: number): Promise<Supplier | undefined>;
  createSupplier(s: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: number, patch: Partial<Supplier>): Promise<Supplier | undefined>;
  deleteSupplier(id: number): Promise<void>;
  listPurchases(supplierId?: number): Promise<Purchase[]>;
  getPurchase(id: number): Promise<Purchase | undefined>;
  createPurchase(p: InsertPurchase & { totalAmount: number; items: PurchaseItem[] }): Promise<Purchase>;
  deletePurchase(id: number): Promise<void>;
  listSupplierPayments(supplierId?: number): Promise<SupplierPayment[]>;
  createSupplierPayment(p: InsertSupplierPayment): Promise<SupplierPayment>;
  deleteSupplierPayment(id: number): Promise<void>;
  getSupplierBalances(): Promise<SupplierBalance[]>;
  getSupplierLedger(supplierId: number): Promise<{ balance: SupplierBalance | null; rows: SupplierLedgerRow[]; qtyAgg: PurchaseQtyAgg[] }>;
  getPrimarySupplier(): Promise<Supplier | undefined>; // 클라리멘토(자동발주 대상) — 가장 먼저 생성된 공급처
  lastPurchaseUnitPrice(supplierId: number, key: { productId?: number | null; name: string }): Promise<number | null>; // 매입단가 기억
  // 경영 대시보드 (C): 매장매출 / 고정비 항목 / 지출 / 손익 요약
  listStoreSales(from?: string, to?: string): Promise<StoreSale[]>;
  upsertStoreSale(s: InsertStoreSale): Promise<StoreSale>;
  deleteStoreSale(id: number): Promise<void>;
  listFixedCostItems(includeInactive?: boolean): Promise<FixedCostItem[]>;
  createFixedCostItem(f: InsertFixedCostItem): Promise<FixedCostItem>;
  updateFixedCostItem(id: number, patch: Partial<FixedCostItem>): Promise<FixedCostItem | undefined>;
  deleteFixedCostItem(id: number): Promise<void>;
  listExpenses(from?: string, to?: string): Promise<Expense[]>;
  createExpense(e: InsertExpense): Promise<Expense>;
  deleteExpense(id: number): Promise<void>;
  getDashboardSummary(from: string, to: string, granularity: DashboardGranularity, sector?: "all" | Sector): Promise<DashboardSummary>;
  // E: 개인 가계부
  listPersonalCategories(): Promise<PersonalCategory[]>;
  createPersonalCategory(c: InsertPersonalCategory): Promise<PersonalCategory>;
  deletePersonalCategory(id: number): Promise<void>;
  listPersonalLedger(from?: string, to?: string): Promise<PersonalLedgerEntry[]>;
  createPersonalLedger(e: InsertPersonalLedger): Promise<PersonalLedgerEntry>;
  updatePersonalLedger(id: number, patch: Partial<PersonalLedgerEntry>): Promise<PersonalLedgerEntry | undefined>;
  deletePersonalLedger(id: number): Promise<void>;
  getPersonalSummary(from: string, to: string): Promise<PersonalSummary>;
  // F: 카카오 토큰
  getKakaoTokens(): Promise<KakaoTokens | undefined>;
  upsertKakaoTokens(patch: Partial<Omit<KakaoTokens, "id">>): Promise<KakaoTokens>;
}

// ===== 대시보드 기간 버킷 유틸 (KST 기준) =====
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
function dateFromYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+09:00`);
}
// KST 캘린더 값 (서버 타임존과 무관하게 UTC 시프트로 계산)
function kstUtc(date: Date): Date {
  const k = new Date(date.getTime() + KST_OFFSET_MS);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
}
function bucketKey(date: Date, g: DashboardGranularity): string {
  const k = kstUtc(date);
  const y = k.getUTCFullYear();
  const mm = String(k.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(k.getUTCDate()).padStart(2, "0");
  if (g === "day") return `${y}-${mm}-${dd}`;
  if (g === "month") return `${y}-${mm}`;
  if (g === "year") return `${y}`;
  // week: ISO-8601 주차
  const target = new Date(k.getTime());
  const dayNr = (target.getUTCDay() + 6) % 7; // 월=0
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // 해당 주 목요일
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
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
  async createCustomer(c: InsertCustomer & { password: string; role?: string; adminRole?: string; bizVerified?: number }) {
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
        bizVerified: c.bizVerified ?? 0,
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
    o: Omit<Order, "id" | "cancelledAt" | "cancelledBy" | "autoPurchaseId" | "isSample"> &
      Partial<Pick<Order, "cancelledAt" | "cancelledBy" | "autoPurchaseId" | "isSample">>,
  ) {
    return db
      .insert(orders)
      .values({ cancelledAt: null, cancelledBy: null, autoPurchaseId: null, isSample: 0, ...o })
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
      // 취소된 주문은 청구/미수금 계산에서 제외 (거래가 성립하지 않았으므로)
      const myOrders = allOrders.filter(
        (o) => o.customerId === c.id && o.status !== "cancelled",
      );
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
        // 취소된 주문은 원장에 표시는 하되 잔액(청구)에는 반영하지 않음
        const isCancelled = r.o.status === "cancelled";
        const debit = isCancelled ? 0 : r.o.totalAmount;
        running += debit;
        return {
          kind: "order",
          id: r.o.id,
          orderNo: r.o.orderNo,
          date: r.ts,
          debit,
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

    // 취소 주문 제외 후 누적 청구 합산
    const totalOrdered = myOrders
      .filter((o) => o.status !== "cancelled")
      .reduce((s, o) => s + o.totalAmount, 0);
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
  // ===== OEM 공급처 / 발주 / 지급 =====
  async listSuppliers(): Promise<Supplier[]> {
    return db.select().from(suppliers).orderBy(asc(suppliers.id)).all();
  }
  async getSupplier(id: number): Promise<Supplier | undefined> {
    return db.select().from(suppliers).where(eq(suppliers.id, id)).get();
  }
  async createSupplier(s: InsertSupplier): Promise<Supplier> {
    return db
      .insert(suppliers)
      .values({
        name: s.name,
        contact: s.contact ?? "",
        phone: s.phone ?? "",
        memo: s.memo ?? "",
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }
  async updateSupplier(id: number, patch: Partial<Supplier>): Promise<Supplier | undefined> {
    return db.update(suppliers).set(patch).where(eq(suppliers.id, id)).returning().get();
  }
  async deleteSupplier(id: number): Promise<void> {
    db.delete(suppliers).where(eq(suppliers.id, id)).run();
  }

  // 발주번호 생성: PO-YYMMDD-XXXX (당일 순번 4자리)
  private genPurchaseNo(): string {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const prefix = `PO-${yy}${mm}${dd}-`;
    const todays = db.select().from(purchases).where(like(purchases.purchaseNo, `${prefix}%`)).all();
    let maxSeq = 0;
    for (const p of todays) {
      const seq = Number(p.purchaseNo.slice(prefix.length));
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    }
    return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
  }

  async listPurchases(supplierId?: number): Promise<Purchase[]> {
    const q = db.select().from(purchases);
    const rows = supplierId
      ? q.where(eq(purchases.supplierId, supplierId)).orderBy(desc(purchases.createdAt)).all()
      : q.orderBy(desc(purchases.createdAt)).all();
    return rows;
  }
  async getPurchase(id: number): Promise<Purchase | undefined> {
    return db.select().from(purchases).where(eq(purchases.id, id)).get();
  }
  async createPurchase(p: InsertPurchase & { totalAmount: number; items: PurchaseItem[] }): Promise<Purchase> {
    return db
      .insert(purchases)
      .values({
        supplierId: p.supplierId,
        purchaseNo: this.genPurchaseNo(),
        purchaseDate: p.purchaseDate,
        items: JSON.stringify(p.items),
        totalAmount: p.totalAmount,
        memo: p.memo ?? "",
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }
  async deletePurchase(id: number): Promise<void> {
    db.delete(purchases).where(eq(purchases.id, id)).run();
  }

  async listSupplierPayments(supplierId?: number): Promise<SupplierPayment[]> {
    const q = db.select().from(supplierPayments);
    return supplierId
      ? q.where(eq(supplierPayments.supplierId, supplierId)).orderBy(desc(supplierPayments.paidAt), desc(supplierPayments.id)).all()
      : q.orderBy(desc(supplierPayments.paidAt), desc(supplierPayments.id)).all();
  }
  async createSupplierPayment(p: InsertSupplierPayment): Promise<SupplierPayment> {
    return db
      .insert(supplierPayments)
      .values({
        supplierId: p.supplierId,
        amount: p.amount,
        paidAt: p.paidAt,
        method: p.method ?? "transfer",
        memo: p.memo ?? "",
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }
  async deleteSupplierPayment(id: number): Promise<void> {
    db.delete(supplierPayments).where(eq(supplierPayments.id, id)).run();
  }

  async getSupplierBalances(): Promise<SupplierBalance[]> {
    const allSuppliers = await this.listSuppliers();
    const allPurchases = await this.listPurchases();
    const allPayments = await this.listSupplierPayments();

    return allSuppliers.map((s) => {
      const myPurchases = allPurchases.filter((p) => p.supplierId === s.id);
      const myPayments = allPayments.filter((p) => p.supplierId === s.id);
      const totalPurchased = myPurchases.reduce((sum, p) => sum + p.totalAmount, 0);
      const totalPaid = myPayments.reduce((sum, p) => sum + p.amount, 0);
      return {
        supplierId: s.id,
        name: s.name,
        contact: s.contact,
        phone: s.phone,
        totalPurchased,
        totalPaid,
        balance: totalPurchased - totalPaid,
        lastPurchaseAt: myPurchases[0]?.createdAt ?? null,
        lastPaidAt: myPayments[0]?.paidAt ?? null,
      };
    });
  }

  async getSupplierLedger(supplierId: number) {
    const supplier = await this.getSupplier(supplierId);
    if (!supplier)
      return { balance: null as SupplierBalance | null, rows: [] as SupplierLedgerRow[], qtyAgg: [] as PurchaseQtyAgg[] };
    const myPurchases = await this.listPurchases(supplierId);
    const myPayments = await this.listSupplierPayments(supplierId);

    type RawRow =
      | { kind: "purchase"; ts: number; p: Purchase }
      | { kind: "payment"; ts: number; sp: SupplierPayment };
    const raws: RawRow[] = [
      ...myPurchases.map((p) => ({ kind: "purchase" as const, ts: p.createdAt, p })),
      ...myPayments.map((sp) => ({
        kind: "payment" as const,
        ts: new Date(sp.paidAt + "T00:00:00+09:00").getTime() || sp.createdAt,
        sp,
      })),
    ].sort((a, b) => a.ts - b.ts);

    let running = 0;
    const rowsAsc: SupplierLedgerRow[] = raws.map((r) => {
      if (r.kind === "purchase") {
        running += r.p.totalAmount;
        return {
          kind: "purchase",
          id: r.p.id,
          purchaseNo: r.p.purchaseNo,
          date: r.ts,
          debit: r.p.totalAmount,
          credit: 0,
          balance: running,
          memo: r.p.memo,
        };
      } else {
        running -= r.sp.amount;
        return {
          kind: "payment",
          id: r.sp.id,
          date: r.ts,
          debit: 0,
          credit: r.sp.amount,
          balance: running,
          method: r.sp.method,
          memo: r.sp.memo,
        };
      }
    });
    const rows = rowsAsc.slice().reverse();

    // 품목별 누계 수량·금액 집계 (품목명 기준)
    const aggMap = new Map<string, PurchaseQtyAgg>();
    for (const p of myPurchases) {
      let items: PurchaseItem[] = [];
      try {
        items = JSON.parse(p.items);
      } catch { /* noop */ }
      for (const it of items) {
        const key = it.name;
        const cur = aggMap.get(key) ?? { key, name: it.name, totalQty: 0, totalAmount: 0 };
        cur.totalQty += it.qty;
        cur.totalAmount += it.amount;
        aggMap.set(key, cur);
      }
    }
    const qtyAgg = Array.from(aggMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);

    const totalPurchased = myPurchases.reduce((s, p) => s + p.totalAmount, 0);
    const totalPaid = myPayments.reduce((s, p) => s + p.amount, 0);
    return {
      balance: {
        supplierId: supplier.id,
        name: supplier.name,
        contact: supplier.contact,
        phone: supplier.phone,
        totalPurchased,
        totalPaid,
        balance: totalPurchased - totalPaid,
        lastPurchaseAt: myPurchases[0]?.createdAt ?? null,
        lastPaidAt: myPayments[0]?.paidAt ?? null,
      } as SupplierBalance,
      rows,
      qtyAgg,
    };
  }

  async getPrimarySupplier(): Promise<Supplier | undefined> {
    return db.select().from(suppliers).orderBy(asc(suppliers.id)).get();
  }

  async lastPurchaseUnitPrice(
    supplierId: number,
    key: { productId?: number | null; name: string },
  ): Promise<number | null> {
    const myPurchases = await this.listPurchases(supplierId); // 최신순
    for (const p of myPurchases) {
      let items: PurchaseItem[] = [];
      try {
        items = JSON.parse(p.items);
      } catch { /* noop */ }
      for (const it of items) {
        const matchByProduct =
          key.productId != null && it.productId != null && it.productId === key.productId;
        const matchByName = it.name === key.name;
        if (matchByProduct || (key.productId == null && matchByName)) {
          return it.unitPrice;
        }
      }
    }
    return null;
  }

  // ===== 경영 대시보드 (C): 매장매출 =====
  async listStoreSales(from?: string, to?: string): Promise<StoreSale[]> {
    let rows = db.select().from(storeSales).orderBy(desc(storeSales.saleDate)).all();
    if (from) rows = rows.filter((r) => r.saleDate >= from);
    if (to) rows = rows.filter((r) => r.saleDate <= to);
    return rows;
  }
  // 같은 날짜(sale_date)가 이미 있으면 금액/메모 갱신, 없으면 신규 삽입
  async upsertStoreSale(s: InsertStoreSale): Promise<StoreSale> {
    const sector = s.sector ?? "store";
    const existing = db
      .select()
      .from(storeSales)
      .where(and(eq(storeSales.saleDate, s.saleDate), eq(storeSales.sector, sector)))
      .get();
    if (existing) {
      return db
        .update(storeSales)
        .set({ amount: s.amount, memo: s.memo ?? "", sector })
        .where(eq(storeSales.id, existing.id))
        .returning()
        .get();
    }
    return db
      .insert(storeSales)
      .values({ saleDate: s.saleDate, amount: s.amount, memo: s.memo ?? "", sector, createdAt: Date.now() })
      .returning()
      .get();
  }
  async deleteStoreSale(id: number): Promise<void> {
    db.delete(storeSales).where(eq(storeSales.id, id)).run();
  }

  // ===== 경영 대시보드 (C): 고정비 항목 =====
  async listFixedCostItems(includeInactive = false): Promise<FixedCostItem[]> {
    const rows = db.select().from(fixedCostItems).orderBy(asc(fixedCostItems.sortOrder), asc(fixedCostItems.id)).all();
    return includeInactive ? rows : rows.filter((r) => r.active === 1);
  }
  async createFixedCostItem(f: InsertFixedCostItem): Promise<FixedCostItem> {
    return db
      .insert(fixedCostItems)
      .values({
        name: f.name,
        sortOrder: f.sortOrder ?? 0,
        active: f.active ?? 1,
        sector: f.sector ?? "common",
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }
  async updateFixedCostItem(id: number, patch: Partial<FixedCostItem>): Promise<FixedCostItem | undefined> {
    return db.update(fixedCostItems).set(patch).where(eq(fixedCostItems.id, id)).returning().get();
  }
  async deleteFixedCostItem(id: number): Promise<void> {
    db.delete(fixedCostItems).where(eq(fixedCostItems.id, id)).run();
  }

  // ===== 경영 대시보드 (C): 지출 =====
  async listExpenses(from?: string, to?: string): Promise<Expense[]> {
    let rows = db.select().from(expenses).orderBy(desc(expenses.expenseDate), desc(expenses.id)).all();
    if (from) rows = rows.filter((r) => r.expenseDate >= from);
    if (to) rows = rows.filter((r) => r.expenseDate <= to);
    return rows;
  }
  async createExpense(e: InsertExpense): Promise<Expense> {
    return db
      .insert(expenses)
      .values({
        expenseDate: e.expenseDate,
        category: e.category,
        amount: e.amount,
        memo: e.memo ?? "",
        sector: e.sector ?? "common",
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }
  async deleteExpense(id: number): Promise<void> {
    db.delete(expenses).where(eq(expenses.id, id)).run();
  }

  // ===== 경영 대시보드 (C): 손익 요약 =====
  async getDashboardSummary(
    from: string,
    to: string,
    granularity: DashboardGranularity,
    sector: "all" | Sector = "all",
  ): Promise<DashboardSummary> {
    // 날짜 문자열(YYYY-MM-DD) → KST 타임스탬프 범위 (주문 createdAt 비교용)
    const fromTs = new Date(`${from}T00:00:00+09:00`).getTime();
    const toTs = new Date(`${to}T23:59:59.999+09:00`).getTime();

    // 원천 데이터 (기간 필터 적용)
    const allOrders = await this.listOrders();
    const orderRows = allOrders.filter(
      (o) => o.status !== "cancelled" && o.createdAt >= fromTs && o.createdAt <= toTs,
    );
    const storeSaleRows = await this.listStoreSales(from, to);
    const allSupplierPayments = await this.listSupplierPayments();
    const paymentRows = allSupplierPayments.filter((p) => p.paidAt >= from && p.paidAt <= to);
    const expenseRows = await this.listExpenses(from, to);

    // D: 부문별 손익 비교 (항상 전체 부문 계산)
    const secInit = (): Record<Sector, { income: number; expense: number }> =>
      SECTORS.reduce((acc, s) => { acc[s] = { income: 0, expense: 0 }; return acc; }, {} as Record<Sector, { income: number; expense: number }>);
    const secAgg = secInit();
    // 도매주문 → wholesale 수입
    for (const o of orderRows) secAgg.wholesale.income += o.totalAmount;
    // 매장/온라인 매출 → 행의 sector
    for (const r of storeSaleRows) {
      const s = (SECTORS as readonly string[]).includes(r.sector) ? (r.sector as Sector) : "store";
      secAgg[s].income += r.amount;
    }
    // 공장지급 → wholesale 지출
    for (const p of paymentRows) secAgg.wholesale.expense += p.amount;
    // 지출 → 행의 sector
    for (const e of expenseRows) {
      const s = (SECTORS as readonly string[]).includes((e as any).sector) ? ((e as any).sector as Sector) : "common";
      secAgg[s].expense += e.amount;
    }
    const sectorBreakdown: SectorPnl[] = SECTORS.map((s) => ({
      sector: s,
      income: secAgg[s].income,
      expense: secAgg[s].expense,
      net: secAgg[s].income - secAgg[s].expense,
    }));

    // 부문 필터에 따라 집계 대상 결정
    const includeWholesale = sector === "all" || sector === "wholesale";
    const filteredStoreSales = sector === "all" ? storeSaleRows : storeSaleRows.filter((r) => (r.sector || "store") === sector);
    const filteredExpenses = sector === "all" ? expenseRows : expenseRows.filter((e) => ((e as any).sector || "common") === sector);

    // 수입
    const wholesaleSales = includeWholesale ? orderRows.reduce((s, o) => s + o.totalAmount, 0) : 0;
    const storeSalesTotal = filteredStoreSales.reduce((s, r) => s + r.amount, 0);
    const totalIncome = wholesaleSales + storeSalesTotal;

    // 지출
    const supplierPaid = includeWholesale ? paymentRows.reduce((s, p) => s + p.amount, 0) : 0;
    const otherExpense = filteredExpenses.reduce((s, e) => s + e.amount, 0);
    const totalExpense = supplierPaid + otherExpense;

    // 지출 항목별 비중 (공장지급 + 지출 카테고리별)
    const catMap = new Map<string, number>();
    if (supplierPaid > 0) catMap.set("공장지급", supplierPaid);
    for (const e of filteredExpenses) {
      catMap.set(e.category, (catMap.get(e.category) ?? 0) + e.amount);
    }
    const expenseByCategory = Array.from(catMap.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);

    // 기간 버킷 추이
    const bucketMap = new Map<string, { income: number; expense: number }>();
    const bump = (key: string, field: "income" | "expense", amt: number) => {
      const cur = bucketMap.get(key) ?? { income: 0, expense: 0 };
      cur[field] += amt;
      bucketMap.set(key, cur);
    };
    if (includeWholesale) {
      for (const o of orderRows) bump(bucketKey(new Date(o.createdAt), granularity), "income", o.totalAmount);
      for (const p of paymentRows) bump(bucketKey(dateFromYmd(p.paidAt), granularity), "expense", p.amount);
    }
    for (const r of filteredStoreSales) bump(bucketKey(dateFromYmd(r.saleDate), granularity), "income", r.amount);
    for (const e of filteredExpenses) bump(bucketKey(dateFromYmd(e.expenseDate), granularity), "expense", e.amount);

    const buckets = Array.from(bucketMap.entries())
      .map(([key, v]) => ({ key, income: v.income, expense: v.expense, net: v.income - v.expense }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    return {
      from,
      to,
      granularity,
      sector,
      sectorBreakdown,
      wholesaleSales,
      storeSales: storeSalesTotal,
      totalIncome,
      supplierPaid,
      otherExpense,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      expenseByCategory,
      buckets,
    };
  }

  // ===== E: 개인 가계부 =====
  async listPersonalCategories(): Promise<PersonalCategory[]> {
    return db.select().from(personalCategories).orderBy(asc(personalCategories.type), asc(personalCategories.id)).all();
  }
  async createPersonalCategory(c: InsertPersonalCategory): Promise<PersonalCategory> {
    return db.insert(personalCategories).values({ name: c.name, type: c.type, createdAt: Date.now() }).returning().get();
  }
  async deletePersonalCategory(id: number): Promise<void> {
    db.delete(personalCategories).where(eq(personalCategories.id, id)).run();
  }
  async listPersonalLedger(from?: string, to?: string): Promise<PersonalLedgerEntry[]> {
    let rows = db.select().from(personalLedger).orderBy(desc(personalLedger.date), desc(personalLedger.id)).all();
    if (from) rows = rows.filter((r) => r.date >= from);
    if (to) rows = rows.filter((r) => r.date <= to);
    return rows;
  }
  async createPersonalLedger(e: InsertPersonalLedger): Promise<PersonalLedgerEntry> {
    return db
      .insert(personalLedger)
      .values({ date: e.date, type: e.type, categoryId: e.categoryId, amount: e.amount, memo: e.memo ?? "", createdAt: Date.now() })
      .returning()
      .get();
  }
  async updatePersonalLedger(id: number, patch: Partial<PersonalLedgerEntry>): Promise<PersonalLedgerEntry | undefined> {
    return db.update(personalLedger).set(patch).where(eq(personalLedger.id, id)).returning().get();
  }
  async deletePersonalLedger(id: number): Promise<void> {
    db.delete(personalLedger).where(eq(personalLedger.id, id)).run();
  }
  async getPersonalSummary(from: string, to: string): Promise<PersonalSummary> {
    const rows = await this.listPersonalLedger(from, to);
    const cats = await this.listPersonalCategories();
    const catMap = new Map(cats.map((c) => [c.id, c]));
    let totalIncome = 0;
    let totalExpense = 0;
    const byCatMap = new Map<number, number>();
    for (const r of rows) {
      if (r.type === "income") totalIncome += r.amount;
      else totalExpense += r.amount;
      byCatMap.set(r.categoryId, (byCatMap.get(r.categoryId) ?? 0) + r.amount);
    }
    const byCategory = Array.from(byCatMap.entries())
      .map(([categoryId, amount]) => ({
        categoryId,
        name: catMap.get(categoryId)?.name ?? "(삭제된 카테고리)",
        type: catMap.get(categoryId)?.type ?? "expense",
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);
    return { from, to, totalIncome, totalExpense, net: totalIncome - totalExpense, byCategory };
  }

  // ===== F: 카카오 토큰 (단일 행 id=1) =====
  async getKakaoTokens(): Promise<KakaoTokens | undefined> {
    return db.select().from(kakaoTokens).where(eq(kakaoTokens.id, 1)).get();
  }
  async upsertKakaoTokens(patch: Partial<Omit<KakaoTokens, "id">>): Promise<KakaoTokens> {
    const existing = await this.getKakaoTokens();
    const now = Date.now();
    if (!existing) {
      return db
        .insert(kakaoTokens)
        .values({
          id: 1,
          accessToken: patch.accessToken ?? "",
          refreshToken: patch.refreshToken ?? "",
          accessTokenExpiresAt: patch.accessTokenExpiresAt ?? 0,
          refreshTokenExpiresAt: patch.refreshTokenExpiresAt ?? 0,
          updatedAt: now,
        })
        .returning()
        .get();
    }
    return db.update(kakaoTokens).set({ ...patch, updatedAt: now }).where(eq(kakaoTokens.id, 1)).returning().get();
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

  // ===== ③ 소식(news) =====
  async listNews(opts?: { publishedOnly?: boolean }): Promise<News[]> {
    const q = opts?.publishedOnly
      ? db.select().from(news).where(eq(news.status, "published"))
      : db.select().from(news);
    return q.orderBy(desc(news.pinned), desc(news.publishedAt), desc(news.createdAt)).all();
  }
  async getNews(id: number) {
    return db.select().from(news).where(eq(news.id, id)).get();
  }
  async createNews(n: Omit<News, "id" | "createdAt" | "updatedAt" | "viewCount">): Promise<News> {
    const now = Date.now();
    return db
      .insert(news)
      .values({ ...n, viewCount: 0, createdAt: now, updatedAt: now })
      .returning()
      .get();
  }
  async updateNews(id: number, patch: Partial<News>): Promise<News | undefined> {
    return db
      .update(news)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(news.id, id))
      .returning()
      .get();
  }
  async deleteNews(id: number) {
    db.delete(news).where(eq(news.id, id)).run();
  }
  async incrementNewsView(id: number) {
    sqlite.prepare("UPDATE news SET view_count = view_count + 1 WHERE id = ?").run(id);
  }

  // 홀세일 납품 문의
  async createInquiry(i: Omit<WholesaleInquiry, "id" | "createdAt" | "status" | "adminMemo">): Promise<WholesaleInquiry> {
    return db
      .insert(wholesaleInquiries)
      .values({ ...i, status: "new", adminMemo: "", createdAt: Date.now() })
      .returning()
      .get();
  }
  async listInquiries(): Promise<WholesaleInquiry[]> {
    return db.select().from(wholesaleInquiries).orderBy(desc(wholesaleInquiries.createdAt)).all();
  }
  async getInquiry(id: number) {
    return db.select().from(wholesaleInquiries).where(eq(wholesaleInquiries.id, id)).get();
  }
  async updateInquiry(id: number, patch: Partial<WholesaleInquiry>): Promise<WholesaleInquiry | undefined> {
    return db
      .update(wholesaleInquiries)
      .set(patch)
      .where(eq(wholesaleInquiries.id, id))
      .returning()
      .get();
  }

  // 방문 커피 세팅 신청
  async createVisitRequest(v: Omit<VisitRequest, "id" | "createdAt" | "status" | "confirmedDate" | "adminMemo">): Promise<VisitRequest> {
    return db
      .insert(visitRequests)
      .values({ ...v, status: "new", confirmedDate: "", adminMemo: "", createdAt: Date.now() })
      .returning()
      .get();
  }
  async listVisitRequests(): Promise<VisitRequest[]> {
    return db.select().from(visitRequests).orderBy(desc(visitRequests.createdAt)).all();
  }
  async getVisitRequest(id: number) {
    return db.select().from(visitRequests).where(eq(visitRequests.id, id)).get();
  }
  async updateVisitRequest(id: number, patch: Partial<VisitRequest>): Promise<VisitRequest | undefined> {
    return db
      .update(visitRequests)
      .set(patch)
      .where(eq(visitRequests.id, id))
      .returning()
      .get();
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

  // ===== 즐겨찾기 =====
  async listFavorites(customerId: number) {
    return db
      .select()
      .from(favorites)
      .where(eq(favorites.customerId, customerId))
      .all();
  }
  async addFavorite(customerId: number, productId: number) {
    // 이미 있으면 기존 레코드 반환 (UNIQUE 제약으로 중복 방지)
    const existing = db
      .select()
      .from(favorites)
      .where(and(eq(favorites.customerId, customerId), eq(favorites.productId, productId)))
      .get();
    if (existing) return existing;
    return db
      .insert(favorites)
      .values({ customerId, productId, createdAt: Date.now() })
      .returning()
      .get();
  }
  async removeFavorite(customerId: number, productId: number) {
    db.delete(favorites)
      .where(and(eq(favorites.customerId, customerId), eq(favorites.productId, productId)))
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

// ===== 고정비 항목 기본 시드 (C): 비어있을 때만 기본 10개 삽입 =====
export function seedFixedCostItems() {
  const existing = db.select().from(fixedCostItems).all();
  if (existing.length > 0) return;
  const defaults = [
    "임대료",
    "인건비",
    "공과금",
    "통신비",
    "원부자재",
    "장비 리스·할부",
    "POS 이용료",
    "보험료",
    "마케팅·콘텐츠",
    "기타",
  ];
  const now = Date.now();
  defaults.forEach((name, i) => {
    db.insert(fixedCostItems).values({ name, sortOrder: i, active: 1, createdAt: now }).run();
  });
  console.log("[seed] 고정비 항목 기본 10개 생성 완료");
}

// ===== E: 개인 가계부 카테고리 기본 시드 (비어있을 때만) =====
export function seedPersonalCategories() {
  const existing = db.select().from(personalCategories).all();
  if (existing.length > 0) return;
  const now = Date.now();
  const expenseCats = ["식비", "교통", "여가", "경조사", "주거", "의료", "기타"];
  const incomeCats = ["급여", "기타수입"];
  for (const name of expenseCats) db.insert(personalCategories).values({ name, type: "expense", createdAt: now }).run();
  for (const name of incomeCats) db.insert(personalCategories).values({ name, type: "income", createdAt: now }).run();
  console.log("[seed] 개인 가계부 카테고리 기본 생성 완료");
}
