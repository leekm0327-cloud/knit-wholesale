import { customers, products, productCategories, orders, payments, ecountSettings, ecountLogs, posts, comments, customerPrices, activityLogs, passwordResetTokens, favorites, suppliers, purchases, supplierPayments, storeSales, fixedCostItems, expenses, personalCategories, personalLedger, kakaoTokens, news, wholesaleInquiries, visitRequests, espressoSetup, notifications, chatMessages, quotes, posProductSales, posHourlySales } from "@shared/schema";
import type {
  Customer,
  InsertCustomer,
  Product,
  InsertProduct,
  ProductCategory,
  InsertProductCategory,
  EspressoSetupItem,
  InsertEspressoSetup,
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
  SupplierLedgerPeriod,
  PurchaseItem,
  StoreSale,
  InsertStoreSale,
  FixedCostItem,
  InsertFixedCostItem,
  Expense,
  InsertExpense,
  PosImport,
  PosSummary,
  PosCompare,
  PosMonthDetail,
  PosMonthStat,
  DashboardSummary,
  FinancialStatement,
  FinancialMonth,
  ItemSummaryRow,
  ItemDetailRow,
  DashboardGranularity,
  Sector,
  SectorPnl,
  PersonalCategory,
  InsertPersonalCategory,
  PersonalLedgerEntry,
  InsertPersonalLedger,
  PersonalSummary,
  KakaoTokens,
  ChatMessage,
  ChatThread,
  Quote,
  InsertQuote,
} from "@shared/schema";
import { SECTORS, SECTOR_LABEL } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, gt, and, asc, gte, lte, like } from "drizzle-orm";
import bcrypt from "bcryptjs";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

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
  is_store INTEGER NOT NULL DEFAULT 0,
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
  min_order_qty INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  read_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  read_by_admin INTEGER NOT NULL DEFAULT 0,
  read_by_customer INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_customer ON chat_messages(customer_id, created_at);
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_no TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL DEFAULT '',
  manager_name TEXT NOT NULL DEFAULT '',
  manager_phone TEXT NOT NULL DEFAULT '',
  issue_date TEXT NOT NULL,
  valid_days INTEGER NOT NULL DEFAULT 30,
  usage_headers TEXT NOT NULL DEFAULT '[]',
  beans TEXT NOT NULL DEFAULT '[]',
  consulting TEXT NOT NULL DEFAULT '[]',
  consulting_fee TEXT NOT NULL DEFAULT '',
  appendix TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(created_at DESC);
CREATE TABLE IF NOT EXISTS pos_product_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  product TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pos_product_date ON pos_product_sales(sale_date);
CREATE TABLE IF NOT EXISTS pos_hourly_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_date TEXT NOT NULL,
  hour INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT '',
  qty INTEGER NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pos_hourly_date ON pos_hourly_sales(sale_date);
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
  ecount_code TEXT NOT NULL DEFAULT '',
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
  segment TEXT NOT NULL DEFAULT 'wholesale',
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
CREATE TABLE IF NOT EXISTS product_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_bean INTEGER NOT NULL DEFAULT 1,
  sample_eligible INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS espresso_setup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  icon TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
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
  // 매장 내부 계정 여부 / 발주 부문(매장·도매)
  ["customers", "is_store INTEGER NOT NULL DEFAULT 0"],
  ["purchases", "segment TEXT NOT NULL DEFAULT 'wholesale'"],
  // 발주-거래처 연결 (자동발주=주문 거래처, 직접등록=선택/입력)
  ["purchases", "customer_id INTEGER"],
  ["purchases", "customer_name TEXT NOT NULL DEFAULT ''"],
  // 견적서 별첨(원두 정보) — quotes 테이블이 이미 만들어진 배포 대비 컬럼 추가
  ["quotes", "appendix TEXT NOT NULL DEFAULT '[]'"],
  // 지출 항목의 비용 구분 (매출원가·판관비·영업외비용·비용아님)
  ["fixed_cost_items", "cost_type TEXT NOT NULL DEFAULT 'sga'"],
  // 지출 항목의 부가세 포함 여부 (손익을 공급가액 기준으로 집계하기 위함)
  ["fixed_cost_items", "vat_included INTEGER NOT NULL DEFAULT 1"],
  // 주문 시점의 매장 내부 계정 여부 스냅샷 (-1 = 미기록 → 거래처 현재값으로 판정)
  ["orders", "is_store_order INTEGER NOT NULL DEFAULT -1"],
  // 견적서 '받는 분' 정보(선택) — 사업자등록번호/담당자/연락처
  ["quotes", "customer_biz_no TEXT NOT NULL DEFAULT ''"],
  ["quotes", "customer_manager TEXT NOT NULL DEFAULT ''"],
  ["quotes", "customer_phone TEXT NOT NULL DEFAULT ''"],
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

// ===== 지출 항목 비용구분 초기값 보정 (멱등) =====
// cost_type 컬럼이 새로 생기면 모든 항목이 'sga'가 되므로, 기존 동작(원부자재=매출원가)을 유지하고
// 이름으로 성격이 명확한 항목만 한 번 보정한다. 이후에는 사용자가 화면에서 직접 바꾼다.
try {
  const seedOnce = sqlite.prepare(`SELECT COUNT(*) AS n FROM fixed_cost_items WHERE cost_type <> 'sga'`).get() as { n: number };
  if (!seedOnce || seedOnce.n === 0) {
    sqlite.exec(`UPDATE fixed_cost_items SET cost_type='cogs' WHERE name IN ('원부자재','식자재(매장)','포장·부자재','생산 외주(도매)');`);
    sqlite.exec(`UPDATE fixed_cost_items SET cost_type='nonop' WHERE name LIKE '%이자%';`);
    sqlite.exec(`UPDATE fixed_cost_items SET cost_type='none' WHERE name LIKE '%부가세%' OR name LIKE '%자산 취득%' OR name LIKE '%사업주 개인%';`);
  }
} catch (e: any) {
  console.warn("[migration] fixed_cost_items cost_type seed", e?.message);
}

// ===== 지출 항목 과세여부 초기값 보정 (멱등) =====
// 손익을 공급가액 기준으로 집계하므로, 부가세가 붙지 않는 비용은 ÷1.1 대상에서 제외한다.
try {
  const seeded = sqlite.prepare(`SELECT COUNT(*) AS n FROM fixed_cost_items WHERE vat_included = 0`).get() as { n: number };
  if (!seeded || seeded.n === 0) {
    sqlite.exec(`UPDATE fixed_cost_items SET vat_included = 0
      WHERE name IN ('인건비','급여','4대보험','퇴직급여','보험료','이자비용','사업주 개인','부가세·세금 납부','자산 취득(장비)')
         OR name LIKE '%이자%' OR name LIKE '%보험%';`);
  }
} catch (e: any) {
  console.warn("[migration] fixed_cost_items vat_included seed", e?.message);
}

// ===== 주문 매장여부 스냅샷 백필 (1회) =====
// 기존 주문은 현재 거래처의 isStore 값으로 채워 넣어, 전환 시점에 숫자가 변하지 않게 한다.
try {
  const pending = sqlite.prepare(`SELECT COUNT(*) AS n FROM orders WHERE is_store_order = -1`).get() as { n: number };
  if (pending && pending.n > 0) {
    sqlite.exec(`UPDATE orders SET is_store_order = COALESCE(
      (SELECT c.is_store FROM customers c WHERE c.id = orders.customer_id), 0);`);
  }
} catch (e: any) {
  console.warn("[migration] orders is_store_order backfill", e?.message);
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
  "min_order_qty INTEGER NOT NULL DEFAULT 0",
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

// 공급처 이카운트 거래처코드 컬럼 (기존 DB 대비 멱등 ALTER)
for (const col of ["ecount_code TEXT NOT NULL DEFAULT ''"]) {
  try {
    sqlite.exec(`ALTER TABLE suppliers ADD COLUMN ${col};`);
  } catch (e: any) {
    if (!/duplicate column/i.test(String(e?.message ?? ""))) {
      console.warn("[suppliers migration]", e?.message);
    }
  }
}

export const db = drizzle(sqlite);
// 직원 관리 모듈(staff-storage.ts)에서 테이블 생성을 위해 raw 핸들이 필요합니다.
export { sqlite };

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
  // product categories
  listProductCategories(): Promise<ProductCategory[]>;
  createProductCategory(c: InsertProductCategory): Promise<ProductCategory>;
  updateProductCategory(id: number, patch: Partial<ProductCategory>): Promise<ProductCategory | undefined>;
  deleteProductCategory(id: number): Promise<void>;
  reorderProductCategories(orderedIds: number[]): Promise<void>;
  // espresso setup (추출 환경)
  listEspressoSetup(): Promise<EspressoSetupItem[]>;
  createEspressoSetup(c: InsertEspressoSetup): Promise<EspressoSetupItem>;
  updateEspressoSetup(id: number, patch: Partial<EspressoSetupItem>): Promise<EspressoSetupItem | undefined>;
  deleteEspressoSetup(id: number): Promise<void>;
  reorderEspressoSetup(orderedIds: number[]): Promise<void>;
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
  updatePurchase(id: number, p: { supplierId: number; purchaseDate: string; memo: string; items: PurchaseItem[]; totalAmount: number }): Promise<Purchase | undefined>;
  deletePurchase(id: number): Promise<void>;
  listSupplierPayments(supplierId?: number): Promise<SupplierPayment[]>;
  createSupplierPayment(p: InsertSupplierPayment): Promise<SupplierPayment>;
  deleteSupplierPayment(id: number): Promise<void>;
  getSupplierBalances(): Promise<SupplierBalance[]>;
  getSupplierLedger(supplierId: number, from?: string, to?: string): Promise<{ balance: SupplierBalance | null; rows: SupplierLedgerRow[]; qtyAgg: PurchaseQtyAgg[]; period: SupplierLedgerPeriod | null }>;
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
  updateExpense(id: number, patch: Partial<Expense>): Promise<Expense | undefined>;
  deleteExpense(id: number): Promise<void>;
  bulkRecategorizeExpenses(ids: number[], patch: { category?: string; sector?: string }): Promise<number>;
  suggestExpenseClassification(memo: string): Promise<{ category: string; sector: string; basedOn: number } | null>;
  seedRecommendedCostItems(): Promise<{ added: string[] }>;
  bulkImportLegacy(p: { sales?: any[]; expenses?: any[]; personal?: any[] }): Promise<{ sales: number; expenses: number; personal: number }>;
  getDashboardSummary(from: string, to: string, granularity: DashboardGranularity, sector?: "all" | Sector): Promise<DashboardSummary>;
  getFinancialStatement(from: string, to: string, allocate?: boolean): Promise<FinancialStatement>;
  getFinancialMonthly(from: string, to: string, allocate?: boolean): Promise<FinancialMonth[]>;
  getOrderItemSummary(from: string, to: string): Promise<ItemSummaryRow[]>;
  getPurchaseItemSummary(from: string, to: string): Promise<ItemSummaryRow[]>;
  getPurchaseItemDetail(name: string, from: string, to: string): Promise<ItemDetailRow[]>;
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
// 산지(국가)명으로 시작하는 음료 = 싱글 오리진 필터 커피.
// 메뉴 분석에서 개별 원두로 흩어지지 않도록 'Filter Coffee' 한 줄로 묶는다.
// (원두 소매 'Coffee Bean' 카테고리는 상품 자체가 원두이므로 묶지 않는다)
const ORIGIN_RE = /^(Colombia|Ethiopia|Ethiopa|Brazil|Brasil|Guatemala|Kenya|Costa\s?rica|Costarica|Panama|Peru|Honduras|El\s?Salvador|Nicaragua|Bolivia|Ecuador|Rwanda|Burundi|Tanzania|Uganda|Yemen|Indonesia|India|Vietnam|Mexico|Jamaica|Cuba|Zambia|Malawi|China|Thailand|Myanmar|Timor|Philippines|Sumatra|Java|Sulawesi|Papua|콜롬비아|에티오피아|브라질|과테말라|케냐|코스타리카|파나마|페루|온두라스|엘살바도르|니카라과|볼리비아|에콰도르|르완다|부룬디|탄자니아|우간다|예멘|인도네시아|인도|베트남|멕시코)\b/i;
export const FILTER_COFFEE = "Filter Coffee";
function menuName(category: string, product: string, group: boolean): string {
  if (!group) return product;
  return category === "Drinks" && ORIGIN_RE.test(product) ? FILTER_COFFEE : product;
}

// 부가세 포함 금액 → 공급가액 (손익은 공급가액 기준으로 집계한다)
function supplyOf(vatIncluded: number): number {
  return Math.round(vatIncluded / 1.1);
}

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
  async createCustomer(c: InsertCustomer & { password: string; role?: string; adminRole?: string; bizVerified?: number; isStore?: number }) {
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
        isStore: c.isStore ?? 0,
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

  // ===== 상품 카테고리 =====
  async listProductCategories(): Promise<ProductCategory[]> {
    return db
      .select()
      .from(productCategories)
      .orderBy(asc(productCategories.sortOrder), asc(productCategories.id))
      .all();
  }
  async createProductCategory(c: InsertProductCategory): Promise<ProductCategory> {
    return db
      .insert(productCategories)
      .values({
        key: c.key,
        label: c.label,
        sortOrder: c.sortOrder ?? 0,
        isBean: c.isBean === false ? 0 : 1,
        sampleEligible: c.sampleEligible ? 1 : 0,
        active: c.active === false ? 0 : 1,
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }
  async updateProductCategory(id: number, patch: Partial<ProductCategory>): Promise<ProductCategory | undefined> {
    return db.update(productCategories).set(patch).where(eq(productCategories.id, id)).returning().get();
  }
  async deleteProductCategory(id: number): Promise<void> {
    db.delete(productCategories).where(eq(productCategories.id, id)).run();
  }
  async reorderProductCategories(orderedIds: number[]): Promise<void> {
    orderedIds.forEach((id, i) => {
      db.update(productCategories).set({ sortOrder: i }).where(eq(productCategories.id, id)).run();
    });
  }

  // ===== 에스프레소 추출 환경 =====
  async listEspressoSetup(): Promise<EspressoSetupItem[]> {
    return db.select().from(espressoSetup).orderBy(asc(espressoSetup.sortOrder), asc(espressoSetup.id)).all();
  }
  async createEspressoSetup(c: InsertEspressoSetup): Promise<EspressoSetupItem> {
    return db
      .insert(espressoSetup)
      .values({
        icon: c.icon ?? "",
        label: c.label,
        value: c.value ?? "",
        sortOrder: c.sortOrder ?? 0,
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }
  async updateEspressoSetup(id: number, patch: Partial<EspressoSetupItem>): Promise<EspressoSetupItem | undefined> {
    return db.update(espressoSetup).set(patch).where(eq(espressoSetup.id, id)).returning().get();
  }
  async deleteEspressoSetup(id: number): Promise<void> {
    db.delete(espressoSetup).where(eq(espressoSetup.id, id)).run();
  }
  async reorderEspressoSetup(orderedIds: number[]): Promise<void> {
    orderedIds.forEach((id, i) => {
      db.update(espressoSetup).set({ sortOrder: i }).where(eq(espressoSetup.id, id)).run();
    });
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
      // 매장 내부 계정(isStore)은 같은 사업자 자기거래 → 채권(미수) 항상 0으로 처리
      if ((c as any).isStore) {
        return {
          customerId: c.id,
          businessName: c.businessName,
          managerName: c.managerName,
          phone: c.phone,
          totalOrdered: 0,
          totalPaid: 0,
          balance: 0,
          lastOrderAt: myOrders[0]?.createdAt ?? null,
          lastPaidAt: myPayments[0]?.paidAt ?? null,
        };
      }
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

    // 매장 내부 계정(같은 사업자 자기거래)은 채권(잔액) 항상 0 — 원장 잔액도 누적하지 않음
    const isStore = (customer as any).isStore === 1;

    let running = 0;
    const rowsAsc: LedgerRow[] = raws.map((r) => {
      if (r.kind === "order") {
        // 취소된 주문은 원장에 표시는 하되 잔액(청구)에는 반영하지 않음
        const isCancelled = r.o.status === "cancelled";
        const debit = isCancelled ? 0 : r.o.totalAmount;
        if (!isStore) running += debit;
        return {
          kind: "order",
          id: r.o.id,
          orderNo: r.o.orderNo,
          date: r.ts,
          debit,
          credit: 0,
          balance: isStore ? 0 : running,
          memo: r.o.note,
          status: r.o.status,
        };
      } else {
        if (!isStore) running -= r.p.amount;
        return {
          kind: "payment",
          id: r.p.id,
          date: r.ts,
          debit: 0,
          credit: r.p.amount,
          balance: isStore ? 0 : running,
          method: r.p.method,
          memo: r.p.memo,
        };
      }
    });
    const rows = rowsAsc.slice().reverse();

    // 취소 주문 제외 후 누적 청구 합산 (매장 내부 계정은 채권 0)
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
        totalOrdered: isStore ? 0 : totalOrdered,
        totalPaid: isStore ? 0 : totalPaid,
        balance: isStore ? 0 : totalOrdered - totalPaid,
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
        ecountCode: s.ecountCode ?? "",
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
        segment: p.segment ?? "wholesale",
        customerId: p.customerId ?? null,
        customerName: p.customerName ?? "",
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }
  async updatePurchase(id: number, p: { supplierId: number; purchaseDate: string; memo: string; items: PurchaseItem[]; totalAmount: number; customerId?: number | null; customerName?: string; segment?: string }): Promise<Purchase | undefined> {
    return db
      .update(purchases)
      .set({
        supplierId: p.supplierId,
        purchaseDate: p.purchaseDate,
        items: JSON.stringify(p.items),
        totalAmount: p.totalAmount,
        memo: p.memo ?? "",
        customerId: p.customerId ?? null,
        customerName: p.customerName ?? "",
        // 부문(매장/도매)을 잘못 지정했을 때 수정 화면에서 바로잡을 수 있어야 함
        ...(p.segment ? { segment: p.segment } : {}),
      } as any)
      .where(eq(purchases.id, id))
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
      // 공장 채무는 부가세 포함 금액 기준 (발주 공급가 + VAT 10%)
      const totalPurchased = myPurchases.reduce((sum, p) => sum + p.totalAmount + Math.round(p.totalAmount * 0.1), 0);
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

  async getSupplierLedger(supplierId: number, from?: string, to?: string) {
    const supplier = await this.getSupplier(supplierId);
    if (!supplier)
      return { balance: null as SupplierBalance | null, rows: [] as SupplierLedgerRow[], qtyAgg: [] as PurchaseQtyAgg[], period: null as SupplierLedgerPeriod | null };
    const myPurchases = await this.listPurchases(supplierId);
    const myPayments = await this.listSupplierPayments(supplierId);

    type RawRow =
      | { kind: "purchase"; ts: number; p: Purchase }
      | { kind: "payment"; ts: number; sp: SupplierPayment };
    const raws: RawRow[] = [
      // 발주는 '발주일(purchaseDate)' 기준으로 표시·정렬 (입력 시각 createdAt 아님)
      ...myPurchases.map((p) => ({
        kind: "purchase" as const,
        ts: p.purchaseDate ? (new Date(p.purchaseDate + "T00:00:00+09:00").getTime() || p.createdAt) : p.createdAt,
        p,
      })),
      ...myPayments.map((sp) => ({
        kind: "payment" as const,
        ts: new Date(sp.paidAt + "T00:00:00+09:00").getTime() || sp.createdAt,
        sp,
      })),
    ].sort((a, b) => a.ts - b.ts);

    let running = 0;
    const rowsAsc: SupplierLedgerRow[] = raws.map((r) => {
      if (r.kind === "purchase") {
        // 채무(원장)는 부가세 포함 금액 기준
        const vatIncl = r.p.totalAmount + Math.round(r.p.totalAmount * 0.1);
        running += vatIncl;
        return {
          kind: "purchase",
          id: r.p.id,
          purchaseNo: r.p.purchaseNo,
          date: r.ts,
          debit: vatIncl,
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
    // ===== 기간 필터 =====
    // fromTs/toTs — 밀리초+오프셋 조합 파싱 실패(NaN) 회피를 위해 안전 형식 사용
    const hasPeriod = !!(from || to);
    const fromTs = from ? new Date(`${from}T00:00:00+09:00`).getTime() : -Infinity;
    const toTs = to ? new Date(`${to}T23:59:59+09:00`).getTime() + 999 : Infinity;
    const inWindow = (ts: number) => ts >= fromTs && ts <= toTs;

    let period: SupplierLedgerPeriod | null = null;
    let displayRowsAsc = rowsAsc;
    if (hasPeriod) {
      const windowRows = rowsAsc.filter((r) => inWindow(r.date));
      const beforeRows = rowsAsc.filter((r) => r.date < fromTs);
      const openingBalance = beforeRows.length ? beforeRows[beforeRows.length - 1].balance : 0;
      const purchased = windowRows.reduce((s, r) => s + r.debit, 0);
      const paid = windowRows.reduce((s, r) => s + r.credit, 0);
      period = {
        from: from ?? null,
        to: to ?? null,
        openingBalance,
        purchased,
        paid,
        net: purchased - paid,
        closingBalance: openingBalance + purchased - paid,
        count: windowRows.length,
      };
      displayRowsAsc = windowRows;
    }
    const rows = displayRowsAsc.slice().reverse();

    // 품목별 누계 수량·금액 집계 (품목명 기준) — 기간 필터 시 해당 기간 발주만
    const purchaseTs = (p: Purchase) =>
      p.purchaseDate ? (new Date(p.purchaseDate + "T00:00:00+09:00").getTime() || p.createdAt) : p.createdAt;
    const aggPurchases = hasPeriod ? myPurchases.filter((p) => inWindow(purchaseTs(p))) : myPurchases;
    const aggMap = new Map<string, PurchaseQtyAgg>();
    for (const p of aggPurchases) {
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

    // 채무 요약(누적)은 항상 전체 기간 기준 — 부가세 포함
    const totalPurchased = myPurchases.reduce((s, p) => s + p.totalAmount + Math.round(p.totalAmount * 0.1), 0);
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
      period,
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
        costType: f.costType ?? "sga",
        vatIncluded: f.vatIncluded ?? 1,
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
  async updateExpense(id: number, patch: Partial<Expense>): Promise<Expense | undefined> {
    return db.update(expenses).set(patch).where(eq(expenses.id, id)).returning().get();
  }
  async deleteExpense(id: number): Promise<void> {
    db.delete(expenses).where(eq(expenses.id, id)).run();
  }

  // 여러 지출의 항목/부문을 한 번에 변경 (기존 '기타' 정리용)
  async bulkRecategorizeExpenses(ids: number[], patch: { category?: string; sector?: string }): Promise<number> {
    const set: any = {};
    if (patch.category) set.category = patch.category;
    if (patch.sector) set.sector = patch.sector;
    if (Object.keys(set).length === 0 || ids.length === 0) return 0;
    let n = 0;
    for (const id of ids) {
      const r = db.update(expenses).set(set).where(eq(expenses.id, id)).returning().get();
      if (r) n++;
    }
    return n;
  }

  // 메모를 근거로 과거 입력에서 항목·부문 추천 (같은 거래처/내용을 반복 입력할 때 자동 선택)
  async suggestExpenseClassification(memo: string): Promise<{ category: string; sector: string; basedOn: number } | null> {
    const q = (memo || "").trim().toLowerCase();
    if (q.length < 2) return null;
    const rows = db.select().from(expenses).all();
    const hit = rows.filter((e) => {
      const m = (e.memo || "").trim().toLowerCase();
      if (!m) return false;
      return m === q || m.includes(q) || q.includes(m);
    });
    if (hit.length === 0) return null;
    // 가장 자주 쓰인 (항목, 부문) 조합
    const m = new Map<string, number>();
    for (const e of hit) m.set(`${e.category}||${(e as any).sector || "common"}`, (m.get(`${e.category}||${(e as any).sector || "common"}`) ?? 0) + 1);
    const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    const [category, sector] = best[0].split("||");
    return { category, sector, basedOn: best[1] };
  }

  // 권장 지출 항목 세트 — 없는 것만 추가 (기존 항목은 건드리지 않음)
  async seedRecommendedCostItems(): Promise<{ added: string[] }> {
    const RECOMMENDED: { name: string; costType: string; sector: string; vat?: 0 | 1 }[] = [
      // 매출원가
      { name: "식자재(매장)", costType: "cogs", sector: "store" },
      { name: "포장·부자재", costType: "cogs", sector: "common" },
      { name: "생산 외주(도매)", costType: "cogs", sector: "wholesale" },
      // 판매관리비
      { name: "급여", costType: "sga", sector: "common", vat: 0 },
      { name: "4대보험", costType: "sga", sector: "common", vat: 0 },
      { name: "퇴직급여", costType: "sga", sector: "common", vat: 0 },
      { name: "관리비", costType: "sga", sector: "common" },
      { name: "소프트웨어·구독료", costType: "sga", sector: "common" },
      { name: "지급수수료", costType: "sga", sector: "common" },
      { name: "차량비", costType: "sga", sector: "common" },
      { name: "물류비", costType: "sga", sector: "online" },
      { name: "여비교통비", costType: "sga", sector: "common" },
      { name: "교육훈련비", costType: "sga", sector: "common" },
      { name: "시설관리·보안", costType: "sga", sector: "store" },
      { name: "소모품·비품", costType: "sga", sector: "store" },
      { name: "수선비", costType: "sga", sector: "store" },
      // 영업외비용
      { name: "이자비용", costType: "nonop", sector: "common", vat: 0 },
      // 비용 아님
      { name: "부가세·세금 납부", costType: "none", sector: "common", vat: 0 },
      { name: "자산 취득(장비)", costType: "none", sector: "common" },
      { name: "사업주 개인", costType: "none", sector: "common", vat: 0 },
    ];
    const existing = new Set((await this.listFixedCostItems()).map((i) => i.name));
    const maxOrder = (await this.listFixedCostItems()).reduce((m, i) => Math.max(m, i.sortOrder), 0);
    const added: string[] = [];
    let order = maxOrder;
    for (const r of RECOMMENDED) {
      if (existing.has(r.name)) continue;
      order += 1;
      db.insert(fixedCostItems).values({
        name: r.name, sortOrder: order, active: 1, sector: r.sector, costType: r.costType,
        vatIncluded: r.vat ?? 1, createdAt: Date.now(),
      } as any).run();
      added.push(r.name);
    }
    return { added };
  }

  // 과거 회계자료(Numbers 리포트 등) 일괄 이관 — 1회성 마이그레이션용.
  // 매출은 (일자, 부문) 단위 업서트라 같은 파일을 다시 올려도 중복되지 않고,
  // 지출·가계부는 이관분에 표식을 남겨 재실행 시 이전 이관분을 지우고 다시 넣는다.
  async bulkImportLegacy(p: { sales?: any[]; expenses?: any[]; personal?: any[] }): Promise<{ sales: number; expenses: number; personal: number }> {
    const now = Date.now();
    const TAG = "[이관]";
    let ns = 0, ne = 0, np = 0;

    for (const r of p.sales ?? []) {
      if (!r?.saleDate || typeof r.amount !== "number") continue;
      await this.upsertStoreSale({ saleDate: r.saleDate, sector: r.sector ?? "store", amount: Math.round(r.amount), memo: r.memo ?? "" } as any);
      ns += 1;
    }

    // 재실행 대비: 기존 이관분(메모에 표식) 제거 후 다시 삽입
    const oldEx = db.select().from(expenses).all().filter((e) => (e.memo || "").startsWith(TAG));
    for (const e of oldEx) db.delete(expenses).where(eq(expenses.id, e.id)).run();
    const exRows = (p.expenses ?? [])
      .filter((r) => r?.expenseDate && typeof r.amount === "number")
      .map((r) => ({ expenseDate: r.expenseDate, category: r.category || "기타", sector: r.sector || "common",
                     amount: Math.round(r.amount), memo: `${TAG} ${r.memo ?? ""}`.trim().slice(0, 300), createdAt: now }));
    for (let i = 0; i < exRows.length; i += 200) {
      const c = exRows.slice(i, i + 200);
      if (c.length) { db.insert(expenses).values(c).run(); ne += c.length; }
    }

    const oldPl = db.select().from(personalLedger).all().filter((r) => (r.memo || "").startsWith(TAG));
    for (const r of oldPl) db.delete(personalLedger).where(eq(personalLedger.id, r.id)).run();
    const plRows = (p.personal ?? [])
      .filter((r) => r?.date && typeof r.amount === "number")
      .map((r) => ({ date: r.date, type: r.type === "income" ? "income" : "expense",
                     categoryId: Number(r.categoryId) || 7, amount: Math.round(r.amount),
                     memo: `${TAG} ${r.memo ?? ""}`.trim().slice(0, 300), createdAt: now }));
    for (let i = 0; i < plRows.length; i += 200) {
      const c = plRows.slice(i, i + 200);
      if (c.length) { db.insert(personalLedger).values(c).run(); np += c.length; }
    }

    return { sales: ns, expenses: ne, personal: np };
  }

  // ===== POS 매출 =====
  // 업로드된 집계 데이터를 저장. 같은 기간(from~to) 기존 데이터는 삭제 후 교체(재업로드 중복 방지).
  async importPosSales(p: PosImport): Promise<{ products: number; hourly: number; storeDays: number; from: string; to: string }> {
    const now = Date.now();
    db.delete(posProductSales).where(and(gte(posProductSales.saleDate, p.from), lte(posProductSales.saleDate, p.to))).run();
    db.delete(posHourlySales).where(and(gte(posHourlySales.saleDate, p.from), lte(posHourlySales.saleDate, p.to))).run();
    const prodRows = p.products
      .filter((r) => r.date)
      .map((r) => ({ saleDate: r.date, category: r.category || "", product: r.product || "", qty: Math.round(r.qty) || 0, amount: Math.round(r.amount) || 0, createdAt: now }));
    const hourRows = p.hourly
      .filter((r) => r.date)
      .map((r) => ({ saleDate: r.date, hour: r.hour || 0, category: r.category || "", qty: Math.round(r.qty) || 0, amount: Math.round(r.amount) || 0, createdAt: now }));
    const chunk = <T>(arr: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
    for (const c of chunk(prodRows, 200)) if (c.length) db.insert(posProductSales).values(c).run();
    for (const c of chunk(hourRows, 200)) if (c.length) db.insert(posHourlySales).values(c).run();

    // POS를 매장 매출의 원천으로 삼는다 — 일자별 합계를 store_sales(매장 부문)에 자동 반영.
    // 같은 매출을 수기로 또 입력하지 않게 하고, 입력 누락으로 매출이 통째로 빠지는 일을 막는다.
    // (수기로 보정한 값이 있어도 같은 기간을 다시 업로드하면 POS 값으로 덮어쓴다)
    const byDate = new Map<string, number>();
    for (const r of prodRows) byDate.set(r.saleDate, (byDate.get(r.saleDate) ?? 0) + r.amount);
    let storeDays = 0;
    for (const [saleDate, amount] of Array.from(byDate.entries())) {
      await this.upsertStoreSale({ saleDate, sector: "store", amount, memo: "POS 자동 반영" } as any);
      storeDays += 1;
    }

    return { products: prodRows.length, hourly: hourRows.length, storeDays, from: p.from, to: p.to };
  }

  // 해당 기간에 이미 저장된 POS 데이터 규모 (업로드 시 덮어쓰기 안내용)
  async getPosRangeInfo(from: string, to: string): Promise<{ products: number; hourly: number; days: number; amount: number }> {
    const prod = db.select().from(posProductSales)
      .where(and(gte(posProductSales.saleDate, from), lte(posProductSales.saleDate, to))).all();
    const hour = db.select().from(posHourlySales)
      .where(and(gte(posHourlySales.saleDate, from), lte(posHourlySales.saleDate, to))).all();
    return {
      products: prod.length,
      hourly: hour.length,
      days: new Set(prod.map((r) => r.saleDate)).size,
      amount: prod.reduce((s, r) => s + r.amount, 0),
    };
  }

  async getPosSummary(from: string, to: string, category?: string, groupOrigin = true): Promise<PosSummary> {
    const catFilter = category && category !== "all" ? category : null;
    let prod = db.select().from(posProductSales)
      .where(and(gte(posProductSales.saleDate, from), lte(posProductSales.saleDate, to))).all();
    let hour = db.select().from(posHourlySales)
      .where(and(gte(posHourlySales.saleDate, from), lte(posHourlySales.saleDate, to))).all();

    // 카테고리 목록(필터 적용 전, 기간 내 존재하는 것)
    const catSet = new Set<string>();
    prod.forEach((r) => { if (r.category) catSet.add(r.category); });
    const categories = [...catSet].sort();

    if (catFilter) {
      prod = prod.filter((r) => r.category === catFilter);
      hour = hour.filter((r) => r.category === catFilter);
    }

    const bump = (m: Map<string, { qty: number; amount: number }>, k: string, qty: number, amount: number) => {
      const cur = m.get(k) || { qty: 0, amount: 0 };
      cur.qty += qty; cur.amount += amount; m.set(k, cur);
    };

    const catMap = new Map<string, { qty: number; amount: number }>();
    const prodMap = new Map<string, { category: string; product: string; qty: number; amount: number }>();
    const dateMap = new Map<string, { qty: number; amount: number }>();
    const monthMap = new Map<string, { qty: number; amount: number }>();
    let totalQty = 0, totalAmount = 0;
    const dateSet = new Set<string>();
    for (const r of prod) {
      totalQty += r.qty; totalAmount += r.amount;
      dateSet.add(r.saleDate);
      bump(catMap, r.category || "(미분류)", r.qty, r.amount);
      const nm = menuName(r.category, r.product || "(미상)", groupOrigin);
      const pk = `${r.category}||${nm}`;
      const pc = prodMap.get(pk) || { category: r.category || "(미분류)", product: nm, qty: 0, amount: 0 };
      pc.qty += r.qty; pc.amount += r.amount; prodMap.set(pk, pc);
      bump(dateMap, r.saleDate, r.qty, r.amount);
      bump(monthMap, r.saleDate.slice(0, 7), r.qty, r.amount);
    }

    const hourMap = new Map<number, { qty: number; amount: number }>();
    const wdMap = new Map<number, { qty: number; amount: number }>();
    for (const r of hour) {
      const hc = hourMap.get(r.hour) || { qty: 0, amount: 0 };
      hc.qty += r.qty; hc.amount += r.amount; hourMap.set(r.hour, hc);
      const wd = new Date(`${r.saleDate}T00:00:00Z`).getUTCDay(); // 0=일 … 6=토
      const wc = wdMap.get(wd) || { qty: 0, amount: 0 };
      wc.qty += r.qty; wc.amount += r.amount; wdMap.set(wd, wc);
    }

    // 전체 데이터 커버리지(기간 무관, 저장된 최소·최대 날짜)
    const minRow = db.select().from(posProductSales).orderBy(asc(posProductSales.saleDate)).limit(1).all();
    const maxRow = db.select().from(posProductSales).orderBy(desc(posProductSales.saleDate)).limit(1).all();
    const coverage = minRow.length && maxRow.length ? { from: minRow[0].saleDate, to: maxRow[0].saleDate } : null;

    return {
      from, to, coverage, categories,
      totals: { qty: totalQty, amount: totalAmount, days: dateSet.size },
      byCategory: [...catMap.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.amount - a.amount),
      byProduct: [...prodMap.values()].sort((a, b) => b.qty - a.qty),
      byDate: [...dateMap.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
      byMonth: [...monthMap.entries()].map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month)),
      byHour: [...hourMap.entries()].map(([hour, v]) => ({ hour, ...v })).sort((a, b) => a.hour - b.hour),
      byWeekday: [...wdMap.entries()].map(([weekday, v]) => ({ weekday, ...v })).sort((a, b) => a.weekday - b.weekday),
    };
  }

  // 월별 비교 — 저장된 전체 월 목록 + 선택한 두 달의 상세(카테고리·메뉴)
  async getPosCompare(
    monthA?: string,
    monthB?: string,
    category?: string,
    groupOrigin = true,
    // 월 단위 대신 임의 기간으로 비교할 때 사용 (둘 다 있어야 적용)
    range?: { aFrom?: string; aTo?: string; bFrom?: string; bTo?: string },
  ): Promise<PosCompare> {
    const catFilter = category && category !== "all" ? category : null;
    const all = db.select().from(posProductSales).all();

    // 카테고리 목록(필터 적용 전)
    const catSet = new Set<string>();
    all.forEach((r) => { if (r.category) catSet.add(r.category); });
    const categories = [...catSet].sort();

    const rows = catFilter ? all.filter((r) => r.category === catFilter) : all;

    // 월별 합계 (영업일수 포함)
    const mMap = new Map<string, { qty: number; amount: number; days: Set<string> }>();
    for (const r of rows) {
      const m = r.saleDate.slice(0, 7);
      const cur = mMap.get(m) || { qty: 0, amount: 0, days: new Set<string>() };
      cur.qty += r.qty; cur.amount += r.amount; cur.days.add(r.saleDate);
      mMap.set(m, cur);
    }
    const months: PosMonthStat[] = [...mMap.entries()]
      .map(([month, v]) => ({ month, qty: v.qty, amount: v.amount, days: v.days.size }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // 기본 비교 대상: B = 가장 최근 달, A = 그 직전 달
    const mb = monthB || months[months.length - 1]?.month || "";
    const mi = months.findIndex((m) => m.month === mb);
    const ma = monthA || (mi > 0 ? months[mi - 1].month : "");

    // label = 화면에 보일 이름, 필터는 (월) 또는 (시작~종료) 둘 중 하나
    const detail = (label: string, from?: string, to?: string): PosMonthDetail | null => {
      if (!label) return null;
      const rs = from && to
        ? rows.filter((r) => r.saleDate >= from && r.saleDate <= to)
        : rows.filter((r) => r.saleDate.slice(0, 7) === label);
      const days = new Set<string>();
      const cMap = new Map<string, { qty: number; amount: number }>();
      const pMap = new Map<string, { category: string; product: string; qty: number; amount: number }>();
      let qty = 0, amount = 0;
      for (const r of rs) {
        qty += r.qty; amount += r.amount; days.add(r.saleDate);
        const ck = r.category || "(미분류)";
        const cc = cMap.get(ck) || { qty: 0, amount: 0 };
        cc.qty += r.qty; cc.amount += r.amount; cMap.set(ck, cc);
        const nm = menuName(r.category, r.product || "(미상)", groupOrigin);
        const pk = `${r.category}||${nm}`;
        const pc = pMap.get(pk) || { category: r.category || "(미분류)", product: nm, qty: 0, amount: 0 };
        pc.qty += r.qty; pc.amount += r.amount; pMap.set(pk, pc);
      }
      return {
        month: label,
        totals: { qty, amount, days: days.size },
        byCategory: [...cMap.entries()].map(([c, v]) => ({ category: c, ...v })).sort((x, y) => y.amount - x.amount),
        byProduct: [...pMap.values()].sort((x, y) => y.qty - x.qty),
      };
    };

    // 임의 기간이 지정되면 그 기간으로, 아니면 월 단위로 비교
    const useRange = !!(range?.aFrom && range?.aTo && range?.bFrom && range?.bTo);
    if (useRange) {
      const lab = (f: string, t: string) => (f === t ? f : `${f} ~ ${t}`);
      return {
        months, categories,
        a: detail(lab(range!.aFrom!, range!.aTo!), range!.aFrom, range!.aTo),
        b: detail(lab(range!.bFrom!, range!.bTo!), range!.bFrom, range!.bTo),
      };
    }
    return { months, categories, a: detail(ma), b: detail(mb) };
  }

  // 재무제표 월별 추이 — 기간에 걸친 각 달의 손익을 한 줄씩 반환
  async getFinancialMonthly(from: string, to: string, allocate = true): Promise<FinancialMonth[]> {
    const out: FinancialMonth[] = [];
    // from~to 사이의 달을 순회 (최대 36개월로 제한해 과도한 조회 방지)
    let y = Number(from.slice(0, 4));
    let m = Number(from.slice(5, 7));
    const endY = Number(to.slice(0, 4));
    const endM = Number(to.slice(5, 7));
    for (let guard = 0; guard < 36; guard++) {
      if (y > endY || (y === endY && m > endM)) break;
      const mm = String(m).padStart(2, "0");
      const first = `${y}-${mm}-01`;
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 해당 월의 말일
      const last = `${y}-${mm}-${String(lastDay).padStart(2, "0")}`;
      // 조회 기간을 벗어나지 않도록 양끝을 자른다
      const s = first < from ? from : first;
      const e = last > to ? to : last;
      const fs = await this.getFinancialStatement(s, e, allocate);
      const t = fs.totals;
      out.push({
        month: `${y}-${mm}`,
        revenue: t.revenue, cogs: t.cogs, grossProfit: t.grossProfit,
        sga: t.sga, operatingProfit: t.operatingProfit,
        nonOperating: t.nonOperating, netProfit: t.netProfit,
      });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return out;
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
    const toTs = new Date(`${to}T23:59:59+09:00`).getTime() + 999; // .999 ms + offset 조합이 일부 런타임에서 파싱 실패(NaN) → 안전 형식

    // 원천 데이터 (기간 필터 적용)
    const allOrders = await this.listOrders();
    const orderRows = allOrders.filter(
      (o) => o.status !== "cancelled" && o.createdAt >= fromTs && o.createdAt <= toTs,
    );
    const storeSaleRows = await this.listStoreSales(from, to);
    // 발생주의: 공장 매입(발주)을 발주일 기준으로 홀세일 지출에 반영. (공장 '지급'은 지출로 잡지 않음)
    //  발주를 삭제하면 이 합산에서 자동으로 빠진다.
    const allPurchases = await this.listPurchases();
    const purchaseRows = allPurchases.filter((p) => p.purchaseDate >= from && p.purchaseDate <= to);
    const expenseRows = await this.listExpenses(from, to);

    // 매장 내부 계정(주문) / 매장 발주(segment=store) 구분 — 이중계상 방지
    const storeIds = new Set((await this.listCustomers()).filter((c) => (c as any).isStore).map((c) => c.id));
    // 주문에 기록된 스냅샷 우선 (거래처 삭제·매장여부 변경에도 과거 숫자 불변)
    const isStoreOrder = (o: any) =>
      typeof o.isStoreOrder === "number" && o.isStoreOrder >= 0 ? o.isStoreOrder === 1 : storeIds.has(o.customerId);
    const segOf = (p: any) => (p.segment === "store" ? "store" : "wholesale");
    // 손익 기준 = 부가세 포함(매출이 부가세 포함이므로 발주 원가도 ×1.1로 맞춘다)
    const vatInc = (a: number) => a + Math.round(a * 0.1);

    // D: 부문별 손익 비교 (항상 전체 부문 계산)
    const secInit = (): Record<Sector, { income: number; expense: number }> =>
      SECTORS.reduce((acc, s) => { acc[s] = { income: 0, expense: 0 }; return acc; }, {} as Record<Sector, { income: number; expense: number }>);
    const secAgg = secInit();
    // 도매주문 → wholesale 수입 (매장 내부 주문은 자기거래이므로 매출에서 제외)
    for (const o of orderRows) { if (!isStoreOrder(o)) secAgg.wholesale.income += o.supplyAmount; }
    // 매장/온라인 매출 → 행의 sector
    for (const r of storeSaleRows) {
      const s = (SECTORS as readonly string[]).includes(r.sector) ? (r.sector as Sector) : "store";
      secAgg[s].income += supplyOf(r.amount);
    }
    // 지출 집계 기준(공급가액) 준비 — 항목별 비용구분/과세여부를 한 번만 조회해 재사용
    const costItemsForDash = await this.listFixedCostItems(true);
    const noneCats = new Set(costItemsForDash.filter((i) => ((i as any).costType ?? "sga") === "none").map((i) => i.name));
    const noVatCats = new Set(costItemsForDash.filter((i) => ((i as any).vatIncluded ?? 1) === 0).map((i) => i.name));
    // 손익은 공급가액 기준 — 부가세 포함 지출만 ÷1.1 (재무제표와 동일 규칙)
    const expenseSupply = (e: { category: string; amount: number }) => (noVatCats.has(e.category) ? e.amount : supplyOf(e.amount));

    // 공장 매입(발주) → 부문(segment)별 지출: 매장 발주는 store, 그 외 wholesale (발생주의, 공급가액)
    for (const p of purchaseRows) secAgg[segOf(p)].expense += p.totalAmount;
    // 지출 → 행의 sector
    for (const e of expenseRows) {
      const s = (SECTORS as readonly string[]).includes((e as any).sector) ? ((e as any).sector as Sector) : "common";
      if (noneCats.has(e.category)) continue; // '비용 아님'은 손익에서 제외
      secAgg[s].expense += expenseSupply(e);
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

    // 수입 (매장 내부 주문은 자기거래이므로 도매 매출에서 제외)
    const wholesaleSales = includeWholesale ? orderRows.filter((o) => !isStoreOrder(o)).reduce((s, o) => s + o.supplyAmount, 0) : 0;
    const storeSalesTotal = filteredStoreSales.reduce((s, r) => s + supplyOf(r.amount), 0);
    const totalIncome = wholesaleSales + storeSalesTotal;

    // 지출 (발생주의: 공장 매입=발주액). 부문에 맞는 발주만 — all: 전체 / wholesale: 도매 / store: 매장
    const purchaseRowsForSector = sector === "all" ? purchaseRows : purchaseRows.filter((p) => segOf(p) === sector);
    const purchaseTotal = purchaseRowsForSector.reduce((s, p) => s + p.totalAmount, 0);
    // '비용 아님'(부가세 납부·자산 취득·사업주 개인 등)은 재무제표와 동일하게 지출에서 제외 — 두 화면 숫자가 어긋나지 않도록
    const otherExpense = filteredExpenses.filter((e) => !noneCats.has(e.category)).reduce((s, e) => s + expenseSupply(e), 0);
    const totalExpense = purchaseTotal + otherExpense;

    // 지출 항목별 비중 (공장 매입 + 지출 카테고리별)
    const catMap = new Map<string, number>();
    if (purchaseTotal > 0) catMap.set("공장 매입", purchaseTotal);
    for (const e of filteredExpenses) {
      if (noneCats.has(e.category)) continue; // 위 지출 합계와 동일 기준 유지
      catMap.set(e.category, (catMap.get(e.category) ?? 0) + expenseSupply(e));
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
      for (const o of orderRows) { if (!isStoreOrder(o)) bump(bucketKey(new Date(o.createdAt), granularity), "income", o.totalAmount); }
    }
    for (const p of purchaseRowsForSector) bump(bucketKey(dateFromYmd(p.purchaseDate), granularity), "expense", p.totalAmount);
    for (const r of filteredStoreSales) bump(bucketKey(dateFromYmd(r.saleDate), granularity), "income", r.amount);
    for (const e of filteredExpenses) {
      if (noneCats.has(e.category)) continue; // 지출 합계와 동일 기준
      bump(bucketKey(dateFromYmd(e.expenseDate), granularity), "expense", expenseSupply(e));
    }

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
      purchaseTotal,
      otherExpense,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      expenseByCategory,
      buckets,
    };
  }

  // ===== 재무제표 (내부 경영용): 업종별 손익계산서 + 채권·채무 요약 =====
  async getFinancialStatement(from: string, to: string, allocate = true): Promise<FinancialStatement> {
    const fromTs = new Date(`${from}T00:00:00+09:00`).getTime();
    const toTs = new Date(`${to}T23:59:59+09:00`).getTime() + 999; // .999 ms + offset 조합이 일부 런타임에서 파싱 실패(NaN) → 안전 형식

    // 원천 데이터 (기간 필터)
    const allOrders = await this.listOrders();
    const orderRows = allOrders.filter(
      (o) => o.status !== "cancelled" && o.createdAt >= fromTs && o.createdAt <= toTs,
    );
    const storeSaleRows = await this.listStoreSales(from, to);
    const allPurchases = await this.listPurchases();
    const purchaseRows = allPurchases.filter((p) => p.purchaseDate >= from && p.purchaseDate <= to);
    const expenseRows = await this.listExpenses(from, to);

    const norm = (s: string, fallback: Sector): Sector =>
      (SECTORS as readonly string[]).includes(s) ? (s as Sector) : fallback;

    // 부문별 매출/매출원가/판관비/영업외비용 집계
    const rev: Record<Sector, number> = SECTORS.reduce((a, s) => ((a[s] = 0), a), {} as Record<Sector, number>);
    const cogs: Record<Sector, number> = SECTORS.reduce((a, s) => ((a[s] = 0), a), {} as Record<Sector, number>);
    const sga: Record<Sector, number> = SECTORS.reduce((a, s) => ((a[s] = 0), a), {} as Record<Sector, number>);
    const nonop: Record<Sector, number> = SECTORS.reduce((a, s) => ((a[s] = 0), a), {} as Record<Sector, number>);

    // 매장 내부 계정(주문) 구분 — 매장 주문은 자기거래이므로 도매 매출에서 제외.
    // 주문에 기록된 스냅샷(isStoreOrder)을 우선 사용하고, 없으면(-1) 거래처의 현재 값으로 판정한다.
    // → 거래처를 삭제하거나 나중에 매장 여부를 바꿔도 과거 손익이 변하지 않는다.
    const storeIds = new Set((await this.listCustomers()).filter((c) => (c as any).isStore).map((c) => c.id));
    const isStoreOrder = (o: any): boolean =>
      typeof o.isStoreOrder === "number" && o.isStoreOrder >= 0 ? o.isStoreOrder === 1 : storeIds.has(o.customerId);
    // 매출(공급가액 기준): 도매주문은 supplyAmount, 매장·온라인 수기매출은 부가세 포함 금액이므로 ÷1.1
    for (const o of orderRows) { if (!isStoreOrder(o)) rev.wholesale += o.supplyAmount; }
    for (const r of storeSaleRows) rev[norm(r.sector, "store")] += supplyOf(r.amount);
    // 매출원가: 공장 매입(발주)을 부문(segment)별로 — 매장 발주(store)는 음식점업(store) 매출원가,
    //  그 외는 원두도매(wholesale) 매출원가. (같은 원두가 두 부문에 이중계상되지 않도록 발주 자체를 분할)
    //  손익 기준 = 부가세 포함(매출도 부가세 포함이므로 원가도 ×1.1로 맞춘다)
    for (const p of purchaseRows) {
      const seg: Sector = (p as any).segment === "store" ? "store" : "wholesale";
      cogs[seg] += p.totalAmount; // 발주 금액은 공급가액 기준이므로 그대로 사용
    }
    // 지출 분류: 항목(고정비 항목)에 지정된 비용 구분을 따른다.
    //  cogs 매출원가 / sga 판매관리비 / nonop 영업외비용 / none 손익 제외(부가세 납부·자산취득·사업주 개인 등)
    // 비활성 항목도 포함해야 함 — 항목을 숨기면 과거 지출의 비용 구분이 판관비로 바뀌어 손익이 소급 변경되는 것을 방지
    const costItems = await this.listFixedCostItems(true);
    const costTypeByName = new Map<string, string>(costItems.map((i) => [i.name, (i as any).costType || "sga"]));
    const vatIncByName = new Map<string, boolean>(costItems.map((i) => [i.name, ((i as any).vatIncluded ?? 1) === 1]));
    let excluded = 0;
    for (const e of expenseRows) {
      const s = norm((e as any).sector, "common");
      // 항목이 삭제되어 조회되지 않으면 기존 동작(원부자재=원가, 그 외 판관비)으로 대체
      const ct = costTypeByName.get(e.category) ?? (e.category === "원부자재" ? "cogs" : "sga");
      // 손익은 공급가액 기준 — 부가세가 포함된 지출만 ÷1.1
      const amt = vatIncByName.get(e.category) === false ? e.amount : supplyOf(e.amount);
      if (ct === "cogs") cogs[s] += amt;
      else if (ct === "nonop") nonop[s] += amt;
      else if (ct === "none") excluded += e.amount; // 손익 제외 금액은 실제 지출액 그대로 표기
      else sga[s] += amt;
    }

    // 공통비 배분: '공통' 부문에 남은 비용을 부문별 매출 비율로 나눠 실제 수익성에 가깝게 만든다.
    const allocatedCommon = allocate ? cogs.common + sga.common + nonop.common : 0;
    if (allocate) {
      const targets = (SECTORS as readonly Sector[]).filter((s) => s !== "common");
      const revSum = targets.reduce((n, t) => n + rev[t], 0);
      if (revSum > 0) {
        const spread = (pool: Record<Sector, number>) => {
          const amount = pool.common;
          if (amount === 0) return;
          let rest = amount;
          let biggest: Sector = targets[0];
          targets.forEach((t) => { if (rev[t] > rev[biggest]) biggest = t; });
          for (const t of targets) {
            if (t === biggest) continue;
            const part = Math.round((amount * rev[t]) / revSum);
            pool[t] += part;
            rest -= part;
          }
          pool[biggest] += rest; // 반올림 잔액은 매출이 가장 큰 부문에
          pool.common = 0;
        };
        spread(cogs); spread(sga); spread(nonop);
      }
    }

    const lines: FinancialStatement["lines"] = SECTORS.map((s) => {
      const revenue = rev[s];
      const c = cogs[s];
      const grossProfit = revenue - c;
      const g = sga[s];
      const operatingProfit = grossProfit - g;
      const n = nonop[s];
      return {
        sector: s,
        label: SECTOR_LABEL[s],
        revenue,
        cogs: c,
        grossProfit,
        sga: g,
        operatingProfit,
        nonOperating: n,
        netProfit: operatingProfit - n,
      };
    }).filter((l) => l.revenue !== 0 || l.cogs !== 0 || l.sga !== 0 || l.nonOperating !== 0);

    const totals = lines.reduce(
      (acc, l) => {
        acc.revenue += l.revenue;
        acc.cogs += l.cogs;
        acc.grossProfit += l.grossProfit;
        acc.sga += l.sga;
        acc.operatingProfit += l.operatingProfit;
        acc.nonOperating += l.nonOperating;
        acc.netProfit += l.netProfit;
        return acc;
      },
      { revenue: 0, cogs: 0, grossProfit: 0, sga: 0, operatingProfit: 0, nonOperating: 0, netProfit: 0 },
    );

    // 채권·채무 (현재 시점 스냅샷)
    const custBalances = await this.getCustomerBalances();
    const supBalances = await this.getSupplierBalances();
    const receivables = custBalances.reduce((s, b) => s + Math.max(0, b.balance), 0);
    const payables = supBalances.reduce((s, b) => s + Math.max(0, b.balance), 0);

    return {
      from,
      to,
      lines,
      totals,
      allocated: allocate,
      allocatedCommon,
      excluded,
      workingCapital: { receivables, payables, net: receivables - payables },
    };
  }

  // ===== 품목별 기간 집계 =====
  async getOrderItemSummary(from: string, to: string): Promise<ItemSummaryRow[]> {
    const fromTs = new Date(`${from}T00:00:00+09:00`).getTime();
    const toTs = new Date(`${to}T23:59:59+09:00`).getTime() + 999; // .999 ms + offset 조합이 일부 런타임에서 파싱 실패(NaN) → 안전 형식
    const orders = (await this.listOrders()).filter(
      (o) => o.status !== "cancelled" && o.createdAt >= fromTs && o.createdAt <= toTs,
    );
    const map = new Map<string, ItemSummaryRow>();
    for (const o of orders) {
      let items: any[] = [];
      try { items = JSON.parse(o.items); } catch { /* noop */ }
      for (const it of items) {
        const name = String(it.name ?? "(이름없음)");
        const cur = map.get(name) ?? { name, category: String(it.category ?? ""), qty: 0, amount: 0 };
        cur.qty += Number(it.qty) || 0;
        cur.amount += Number(it.amount) || 0;
        map.set(name, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty || b.amount - a.amount);
  }

  async getPurchaseItemSummary(from: string, to: string): Promise<ItemSummaryRow[]> {
    const purchaseRows = (await this.listPurchases()).filter((p) => p.purchaseDate >= from && p.purchaseDate <= to);
    const map = new Map<string, ItemSummaryRow>();
    for (const p of purchaseRows) {
      let items: any[] = [];
      try { items = JSON.parse(p.items); } catch { /* noop */ }
      for (const it of items) {
        const name = String(it.name ?? "(이름없음)");
        const cur = map.get(name) ?? { name, category: String(it.category ?? ""), qty: 0, amount: 0 };
        cur.qty += Number(it.qty) || 0;
        cur.amount += Number(it.amount) || 0;
        map.set(name, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty || b.amount - a.amount);
  }

  // 특정 품목의 거래처별 발주 내역 (품목별 집계 드릴다운)
  async getPurchaseItemDetail(name: string, from: string, to: string): Promise<ItemDetailRow[]> {
    const purchaseRows = (await this.listPurchases()).filter((p) => p.purchaseDate >= from && p.purchaseDate <= to);
    // customerName 비어있는 옛 자동발주는 주문(autoPurchaseId)에서 거래처명 보정
    const allOrders = await this.listOrders();
    const orderByAutoPid = new Map<number, any>();
    for (const o of allOrders) {
      const apid = (o as any).autoPurchaseId;
      if (apid) orderByAutoPid.set(apid, o);
    }
    const rows: ItemDetailRow[] = [];
    for (const p of purchaseRows) {
      let items: any[] = [];
      try { items = JSON.parse(p.items); } catch { /* noop */ }
      const matched = items.filter((it) => String(it.name ?? "") === name);
      if (matched.length === 0) continue;
      const qty = matched.reduce((s, it) => s + (Number(it.qty) || 0), 0);
      const amount = matched.reduce((s, it) => s + (Number(it.amount) || 0), 0);
      let cname = (p as any).customerName || "";
      if (!cname) {
        const ord = orderByAutoPid.get(p.id);
        if (ord) {
          try { cname = JSON.parse(ord.customerSnapshot)?.businessName || ""; } catch { /* noop */ }
          if (!cname) {
            const c = await this.getCustomer(ord.customerId);
            cname = c?.businessName || "";
          }
        }
      }
      if (!cname) cname = "(미지정)";
      rows.push({ customerName: cname, purchaseNo: p.purchaseNo, purchaseDate: p.purchaseDate, qty, amount });
    }
    // 날짜순 정렬 (같은 날짜면 거래처명 순)
    rows.sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate) || a.customerName.localeCompare(b.customerName));
    return rows;
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

  // ===== 관리자 알림 센터 =====
  async createNotification(n: { type: string; title: string; body?: string; link?: string }) {
    return db
      .insert(notifications)
      .values({
        type: n.type,
        title: n.title,
        body: n.body ?? "",
        link: n.link ?? "",
        readAt: null,
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }
  async listNotifications(limit = 30) {
    return db.select().from(notifications).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(limit).all();
  }
  async countUnreadNotifications(): Promise<number> {
    return db.select().from(notifications).all().filter((r) => r.readAt == null).length;
  }
  async markNotificationRead(id: number): Promise<void> {
    db.update(notifications).set({ readAt: Date.now() }).where(eq(notifications.id, id)).run();
  }
  async markAllNotificationsRead(): Promise<void> {
    db.update(notifications).set({ readAt: Date.now() }).run();
  }

  // ===== 거래처 1:1 채팅 =====
  async sendChatMessage(customerId: number, sender: "admin" | "customer", body: string): Promise<ChatMessage> {
    return db
      .insert(chatMessages)
      .values({
        customerId,
        sender,
        body,
        // 보낸 쪽은 이미 읽은 상태로 저장
        readByAdmin: sender === "admin" ? 1 : 0,
        readByCustomer: sender === "customer" ? 1 : 0,
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }

  async listChatMessages(customerId: number): Promise<ChatMessage[]> {
    return db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.customerId, customerId))
      .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
      .all();
  }

  // reader가 상대방이 보낸 메시지를 읽음 처리
  async markChatRead(customerId: number, reader: "admin" | "customer"): Promise<void> {
    if (reader === "admin") {
      db.update(chatMessages)
        .set({ readByAdmin: 1 })
        .where(and(eq(chatMessages.customerId, customerId), eq(chatMessages.sender, "customer")))
        .run();
    } else {
      db.update(chatMessages)
        .set({ readByCustomer: 1 })
        .where(and(eq(chatMessages.customerId, customerId), eq(chatMessages.sender, "admin")))
        .run();
    }
  }

  // 관리자용: 전체 거래처 채팅 미읽음(거래처 발신) 총합
  // 관리자 계정(자기 자신)과의 스레드나 삭제된 거래처의 메시지는 제외 — 열 수 없어 배지가 영구히 남는 것 방지.
  async countChatUnreadForAdmin(): Promise<number> {
    const rows = db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.sender, "customer"), eq(chatMessages.readByAdmin, 0)))
      .all();
    if (rows.length === 0) return 0;
    const ids = [...new Set(rows.map((m) => m.customerId))];
    const valid = new Set<number>();
    for (const id of ids) {
      const c = await this.getCustomer(id);
      if (c && c.role !== "admin") valid.add(id);
    }
    return rows.filter((m) => valid.has(m.customerId)).length;
  }

  // 채팅 스레드 전체 삭제 (관리자 계정과의 잘못된 스레드 정리 포함)
  async deleteChatThread(customerId: number): Promise<number> {
    const n = db.select().from(chatMessages).where(eq(chatMessages.customerId, customerId)).all().length;
    db.delete(chatMessages).where(eq(chatMessages.customerId, customerId)).run();
    return n;
  }

  // 채팅 메시지 1건 삭제
  async deleteChatMessage(id: number): Promise<void> {
    db.delete(chatMessages).where(eq(chatMessages.id, id)).run();
  }

  // 거래처용: 자기 스레드의 관리자 발신 미읽음 수
  async countChatUnreadForCustomer(customerId: number): Promise<number> {
    return db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.customerId, customerId), eq(chatMessages.sender, "admin"), eq(chatMessages.readByCustomer, 0)))
      .all().length;
  }

  // 관리자용: 채팅이 있는 거래처 스레드 목록 (최근 메시지 순)
  async listChatThreads(): Promise<ChatThread[]> {
    const all = db.select().from(chatMessages).all();
    const byCustomer = new Map<number, ChatMessage[]>();
    for (const m of all) {
      const arr = byCustomer.get(m.customerId) ?? [];
      arr.push(m);
      byCustomer.set(m.customerId, arr);
    }
    const threads: ChatThread[] = [];
    for (const [customerId, msgs] of byCustomer) {
      const cust = await this.getCustomer(customerId);
      if (!cust) continue; // 삭제된 거래처의 채팅은 건너뜀
      if (cust.role === "admin") continue; // 관리자 계정(자기 자신)과의 스레드는 목록에서 제외
      msgs.sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
      const last = msgs[msgs.length - 1];
      const unread = msgs.filter((m) => m.sender === "customer" && m.readByAdmin === 0).length;
      threads.push({
        customerId,
        businessName: cust.businessName,
        managerName: cust.managerName,
        lastBody: last.body,
        lastSender: last.sender,
        lastAt: last.createdAt,
        unread,
      });
    }
    threads.sort((a, b) => b.lastAt - a.lastAt);
    return threads;
  }

  // ===== 예비 거래처 견적서 =====
  private genQuoteNo(): string {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const prefix = `Q-${yy}${mm}${dd}-`;
    const todays = db.select().from(quotes).where(like(quotes.quoteNo, `${prefix}%`)).all();
    let maxSeq = 0;
    for (const q of todays) {
      const seq = Number(q.quoteNo.slice(prefix.length));
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    }
    return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
  }

  async createQuote(q: InsertQuote): Promise<Quote> {
    return db
      .insert(quotes)
      .values({
        quoteNo: this.genQuoteNo(),
        token: crypto.randomBytes(12).toString("hex"), // 24자 공개 토큰
        customerName: q.customerName ?? "",
        customerBizNo: q.customerBizNo ?? "",
        customerManager: q.customerManager ?? "",
        customerPhone: q.customerPhone ?? "",
        managerName: q.managerName ?? "",
        managerPhone: q.managerPhone ?? "",
        issueDate: q.issueDate,
        validDays: q.validDays ?? 30,
        usageHeaders: JSON.stringify(q.usageHeaders ?? []),
        beans: JSON.stringify(q.beans ?? []),
        consulting: JSON.stringify(q.consulting ?? []),
        consultingFee: q.consultingFee ?? "",
        appendix: JSON.stringify(q.appendix ?? []),
        createdAt: Date.now(),
      })
      .returning()
      .get();
  }

  async updateQuote(id: number, q: InsertQuote): Promise<Quote | undefined> {
    return db
      .update(quotes)
      .set({
        customerName: q.customerName ?? "",
        customerBizNo: q.customerBizNo ?? "",
        customerManager: q.customerManager ?? "",
        customerPhone: q.customerPhone ?? "",
        managerName: q.managerName ?? "",
        managerPhone: q.managerPhone ?? "",
        issueDate: q.issueDate,
        validDays: q.validDays ?? 30,
        usageHeaders: JSON.stringify(q.usageHeaders ?? []),
        beans: JSON.stringify(q.beans ?? []),
        consulting: JSON.stringify(q.consulting ?? []),
        consultingFee: q.consultingFee ?? "",
        appendix: JSON.stringify(q.appendix ?? []),
      })
      .where(eq(quotes.id, id))
      .returning()
      .get();
  }

  async listQuotes(): Promise<Quote[]> {
    return db.select().from(quotes).orderBy(desc(quotes.createdAt), desc(quotes.id)).all();
  }
  async getQuote(id: number): Promise<Quote | undefined> {
    return db.select().from(quotes).where(eq(quotes.id, id)).get();
  }
  async getQuoteByToken(token: string): Promise<Quote | undefined> {
    return db.select().from(quotes).where(eq(quotes.token, token)).get();
  }
  async deleteQuote(id: number): Promise<void> {
    db.delete(quotes).where(eq(quotes.id, id)).run();
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
    payments: Array<{ id: number; paidAt: string; amount: number; method: string; memo: string }>;
    totalAmount: number;
    paidAmount: number;
    unpaidAmount: number;
  }> {
    // 유효 주문일자 = 관리자 지정 주문 일자(ecountDate, YYYY-MM-DD) 있으면 그것, 없으면 생성일(KST)
    const effYmd = (o: any): string =>
      o.ecountDate && String(o.ecountDate).trim()
        ? String(o.ecountDate).trim()
        : new Date(o.createdAt + 9 * 3600 * 1000).toISOString().slice(0, 10);

    const custOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.customerId, customerId))
      .all();

    // 취소 제외 + 유효 주문일자 기준 기간 필터 + 유효 주문일자 오름차순 정렬
    const activeOrders = custOrders
      .filter((o) => o.status !== "cancelled")
      .filter((o) => {
        const d = effYmd(o);
        return d >= startDate && d <= endDate;
      })
      .sort((a, b) => {
        const da = effYmd(a), dbb = effYmd(b);
        return da < dbb ? -1 : da > dbb ? 1 : a.createdAt - b.createdAt;
      });

    const resultOrders = activeOrders.map((o) => {
      let parsedItems: Array<{ name: string; qty: number; unitPrice: number; amount: number }> = [];
      try {
        parsedItems = JSON.parse(o.items);
      } catch { /* noop */ }
      return { ...o, parsedItems };
    });

    const totalAmount = resultOrders.reduce((s, o) => s + o.totalAmount, 0);

    // 기간 내 입금 조회 (paidAt이 해당 기간 내) — 개별 내역도 함께 반환
    const allPayments = await this.listPaymentsByCustomer(customerId);
    const periodPayments = allPayments
      .filter((p) => p.paidAt >= startDate && p.paidAt <= endDate)
      .sort((a, b) => (a.paidAt < b.paidAt ? -1 : a.paidAt > b.paidAt ? 1 : a.id - b.id))
      .map((p) => ({ id: p.id, paidAt: p.paidAt, amount: p.amount, method: p.method, memo: p.memo }));
    const paidAmount = periodPayments.reduce((s, p) => s + p.amount, 0);

    return {
      orders: resultOrders,
      payments: periodPayments,
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

// ===== 상품 카테고리 기본 시드 (비어있을 때만) =====
export function seedProductCategories() {
  const existing = db.select().from(productCategories).all();
  if (existing.length > 0) return;
  const now = Date.now();
  // 사용자 요청 순서: 블렌드, 디카페인, 싱글 에스프레소, 싱글 필터, 드립백
  // 기존 상품 호환을 위해 'single'(싱글 오리진)은 유지하되 맨 뒤에 둠.
  const defaults: Array<{ key: string; label: string; isBean: number; sample: number }> = [
    { key: "blend", label: "블렌드", isBean: 1, sample: 1 },
    { key: "decaf", label: "디카페인", isBean: 1, sample: 1 },
    { key: "single_espresso", label: "싱글 오리진 에스프레소", isBean: 1, sample: 0 },
    { key: "single_filter", label: "싱글 오리진 필터", isBean: 1, sample: 0 },
    { key: "dripbag", label: "드립백", isBean: 0, sample: 0 },
    { key: "single", label: "싱글 오리진", isBean: 1, sample: 0 },
  ];
  defaults.forEach((c, i) => {
    db.insert(productCategories)
      .values({
        key: c.key,
        label: c.label,
        sortOrder: i,
        isBean: c.isBean,
        sampleEligible: c.sample,
        active: 1,
        createdAt: now,
      })
      .run();
  });
  console.log("[seed] 상품 카테고리 기본 6개 생성 완료");
}

// ===== 에스프레소 추출 환경 기본 시드 (비어있을 때만) =====
export function seedEspressoSetup() {
  const existing = db.select().from(espressoSetup).all();
  if (existing.length > 0) return;
  const now = Date.now();
  const defaults = [
    { icon: "☕", label: "ESPRESSO MACHINE", value: "LA MARZOCCO LINEA PB" },
    { icon: "⚙️", label: "GRINDER", value: "MAHLKONIG E80S, MAHLKONIG EK43S" },
    { icon: "💧", label: "WATER FILTER", value: "EVERPURE 4FC-LS" },
    { icon: "🧩", label: "PORTAFILTER BASKET", value: "IMS 26.5 58mm" },
  ];
  defaults.forEach((d, i) => {
    db.insert(espressoSetup).values({ icon: d.icon, label: d.label, value: d.value, sortOrder: i, createdAt: now }).run();
  });
  console.log("[seed] 에스프레소 추출 환경 기본 4개 생성 완료");
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
