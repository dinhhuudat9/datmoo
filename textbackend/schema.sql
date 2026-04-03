-- HuuDatDev Winter Cloud Shop
-- Paste file này vào Turso khi khởi tạo DB

CREATE TABLE IF NOT EXISTS site_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    is_blocked BOOLEAN DEFAULT false,
    payment_deadline DATETIME,
    last_payment_date DATETIME,
    payment_amount INTEGER DEFAULT 100000,
    block_message TEXT DEFAULT '🌨️ Web đang tạm khóa. Vui lòng thanh toán 100.000đ để mở lại.',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
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
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT,
    wallet INTEGER DEFAULT 2000,
    telegram_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    price INTEGER NOT NULL,
    price_display TEXT NOT NULL,
    download_link TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS pending_deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    phone TEXT,
    code TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS maintenance_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount INTEGER DEFAULT 100000,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_by TEXT,
    note TEXT
);

CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_type TEXT, -- 'main' hoặc 'secondary'
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO site_config (id, is_blocked, payment_deadline)
VALUES (1, false, datetime('now', '+30 days'));
