const { createClient } = require("@libsql/client");

const DEFAULT_PAYMENT_AMOUNT = Number(process.env.MAINTENANCE_PAYMENT_AMOUNT) || 100000;
const DEFAULT_BLOCK_MESSAGE =
  process.env.DEFAULT_BLOCK_MESSAGE ||
  "🌨️ Web đang tạm khóa. Vui lòng thanh toán 100.000đ để mở lại.";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:./turso.db",
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS site_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      is_blocked BOOLEAN DEFAULT false,
      payment_deadline DATETIME,
      last_payment_date DATETIME,
      payment_amount INTEGER DEFAULT 100000,
      block_message TEXT DEFAULT '🌨️ Web đang tạm khóa. Vui lòng thanh toán 100.000đ để mở lại.',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      price_display TEXT NOT NULL,
      icon TEXT DEFAULT 'fas fa-code',
      description TEXT,
      category TEXT,
      download_link TEXT,
      demo_media TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT,
      wallet INTEGER DEFAULT 2000,
      telegram_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      price INTEGER NOT NULL,
      price_display TEXT NOT NULL,
      download_link TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
  );`,
  `CREATE TABLE IF NOT EXISTS pending_deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      phone TEXT,
      code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
  );`,
  `CREATE TABLE IF NOT EXISTS maintenance_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount INTEGER DEFAULT 100000,
      payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      approved_by TEXT,
      note TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_type TEXT,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`,
  `INSERT OR IGNORE INTO site_config (id, is_blocked, payment_deadline)
   VALUES (1, false, datetime('now', '+30 days'));`,
];

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + Number(days));
  return next;
}

function formatSqliteDate(date = new Date()) {
  return new Date(date).toISOString().slice(0, 19).replace("T", " ");
}

function parseSqliteDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const raw = String(value);

  if (raw.includes("T")) {
    return new Date(raw);
  }

  return new Date(`${raw.replace(" ", "T")}Z`);
}

function toBoolean(value) {
  return value === true || value === 1 || value === "1";
}

function formatCurrency(amount) {
  return `${Number(amount || 0).toLocaleString("vi-VN")}đ`;
}

function parseLogDetails(raw) {
  if (!raw) {
    return null;
  }

  if (typeof raw === "object") {
    return raw;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return { value: String(raw) };
  }
}

function mapSiteConfigRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    isBlocked: toBoolean(row.is_blocked),
    paymentDeadline: row.payment_deadline || null,
    lastPaymentDate: row.last_payment_date || null,
    paymentAmount: Number(row.payment_amount || DEFAULT_PAYMENT_AMOUNT),
    blockMessage: row.block_message || DEFAULT_BLOCK_MESSAGE,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function queryOne(sql, args = []) {
  const result = await db.execute({ sql, args });
  return result.rows[0] || null;
}

async function bootstrapDatabase() {
  for (const statement of schemaStatements) {
    await db.execute(statement);
  }

  await ensureSiteConfigRow();
}

async function ensureSiteConfigRow() {
  const row = await queryOne("SELECT * FROM site_config WHERE id = 1 LIMIT 1");

  if (row) {
    return mapSiteConfigRow(row);
  }

  const deadline = addDays(new Date(), 30);

  await db.execute({
    sql: `INSERT OR IGNORE INTO site_config
      (id, is_blocked, payment_deadline, payment_amount, block_message, created_at, updated_at)
      VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    args: [0, formatSqliteDate(deadline), DEFAULT_PAYMENT_AMOUNT, DEFAULT_BLOCK_MESSAGE],
  });

  const created = await queryOne("SELECT * FROM site_config WHERE id = 1 LIMIT 1");
  return mapSiteConfigRow(created);
}

async function getSiteConfig() {
  await ensureSiteConfigRow();
  const row = await queryOne("SELECT * FROM site_config WHERE id = 1 LIMIT 1");
  return mapSiteConfigRow(row);
}

async function updateSiteConfig(fields = {}) {
  await ensureSiteConfigRow();

  const updates = [];
  const args = [];

  if (Object.prototype.hasOwnProperty.call(fields, "isBlocked")) {
    updates.push("is_blocked = ?");
    args.push(fields.isBlocked ? 1 : 0);
  }

  if (Object.prototype.hasOwnProperty.call(fields, "paymentDeadline")) {
    updates.push("payment_deadline = ?");
    args.push(
      fields.paymentDeadline ? formatSqliteDate(fields.paymentDeadline) : null,
    );
  }

  if (Object.prototype.hasOwnProperty.call(fields, "lastPaymentDate")) {
    updates.push("last_payment_date = ?");
    args.push(
      fields.lastPaymentDate ? formatSqliteDate(fields.lastPaymentDate) : null,
    );
  }

  if (Object.prototype.hasOwnProperty.call(fields, "paymentAmount")) {
    updates.push("payment_amount = ?");
    args.push(Number(fields.paymentAmount || DEFAULT_PAYMENT_AMOUNT));
  }

  if (Object.prototype.hasOwnProperty.call(fields, "blockMessage")) {
    updates.push("block_message = ?");
    args.push(fields.blockMessage || DEFAULT_BLOCK_MESSAGE);
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");

  await db.execute({
    sql: `UPDATE site_config SET ${updates.join(", ")} WHERE id = 1`,
    args,
  });

  return getSiteConfig();
}

async function enforceSiteBlockingIfNeeded() {
  const config = await getSiteConfig();
  const deadline = parseSqliteDate(config.paymentDeadline);

  if (!deadline) {
    return config;
  }

  if (deadline.getTime() <= Date.now() && !config.isBlocked) {
    return updateSiteConfig({
      isBlocked: true,
      blockMessage: config.blockMessage || DEFAULT_BLOCK_MESSAGE,
    });
  }

  return config;
}

async function logAdminAction(adminType, action, details = null) {
  await db.execute({
    sql: "INSERT INTO admin_logs (admin_type, action, details) VALUES (?, ?, ?)",
    args: [
      adminType || null,
      action,
      details ? JSON.stringify(details) : null,
    ],
  });
}

async function getConfiguredDeadlineDays() {
  const row = await queryOne(
    `SELECT details
     FROM admin_logs
     WHERE action = 'set_deadline_days'
     ORDER BY id DESC
     LIMIT 1`,
  );

  const details = parseLogDetails(row?.details);
  const days = Number(details?.days || 30);

  if (!Number.isInteger(days) || days <= 0) {
    return 30;
  }

  return days;
}

async function wipeDatabase() {
  await db.execute("BEGIN");

  try {
    await db.execute("DELETE FROM orders");
    await db.execute("DELETE FROM pending_deposits");
    await db.execute("DELETE FROM products");
    await db.execute("DELETE FROM users");
    await db.execute("DELETE FROM maintenance_payments");
    await db.execute("DELETE FROM admin_logs");
    await db.execute("DELETE FROM sqlite_sequence");
    await db.execute("DELETE FROM site_config");

    await db.execute({
      sql: `INSERT INTO site_config
        (id, is_blocked, payment_deadline, last_payment_date, payment_amount, block_message, created_at, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      args: [
        0,
        formatSqliteDate(addDays(new Date(), 30)),
        null,
        DEFAULT_PAYMENT_AMOUNT,
        DEFAULT_BLOCK_MESSAGE,
      ],
    });

    await db.execute("COMMIT");
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
}

module.exports = {
  DEFAULT_BLOCK_MESSAGE,
  DEFAULT_PAYMENT_AMOUNT,
  addDays,
  bootstrapDatabase,
  db,
  enforceSiteBlockingIfNeeded,
  formatCurrency,
  formatSqliteDate,
  getConfiguredDeadlineDays,
  getSiteConfig,
  logAdminAction,
  parseSqliteDate,
  queryOne,
  updateSiteConfig,
  wipeDatabase,
};
