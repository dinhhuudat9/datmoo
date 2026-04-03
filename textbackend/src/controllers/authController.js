const CryptoJS = require("crypto-js");

const { db, queryOne } = require("../config/db");
const { signAccessToken } = require("../middleware/auth");

function hashPassword(password) {
  return CryptoJS.SHA256(String(password || "")).toString();
}

function normalizeIncomingPassword(password) {
  const raw = String(password || "").trim();

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return raw.toLowerCase();
  }

  return hashPassword(raw);
}

function sanitizeUser(row) {
  return {
    id: Number(row.id),
    username: row.username,
    email: row.email || "",
    wallet: Number(row.wallet || 0),
    telegramId: row.telegram_id || "",
    createdAt: row.created_at || null,
  };
}

async function register(req, res, next) {
  try {
    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim();
    const password = String(req.body.password || "");
    const telegramId = String(req.body.telegramId || "").trim();

    if (!username || !password) {
      return res.status(400).json({ message: "Thiếu username hoặc password." });
    }

    const existedUser = await queryOne(
      "SELECT id FROM users WHERE username = ? LIMIT 1",
      [username],
    );

    if (existedUser) {
      return res.status(409).json({ message: "Tên đăng nhập đã tồn tại." });
    }

    await db.execute({
      sql: `INSERT INTO users (username, password_hash, email, wallet, telegram_id)
            VALUES (?, ?, ?, 2000, ?)`,
      args: [username, normalizeIncomingPassword(password), email || null, telegramId || null],
    });

    const user = await queryOne(
      "SELECT * FROM users WHERE username = ? LIMIT 1",
      [username],
    );

    return res.status(201).json({
      message: "Đăng ký thành công.",
      token: signAccessToken({
        userId: Number(user.id),
        username: user.username,
        role: "user",
      }),
      user: sanitizeUser(user),
    });
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!username || !password) {
      return res.status(400).json({ message: "Thiếu username hoặc password." });
    }

    const user = await queryOne(
      "SELECT * FROM users WHERE username = ? LIMIT 1",
      [username],
    );

    if (!user || user.password_hash !== normalizeIncomingPassword(password)) {
      return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu." });
    }

    return res.json({
      message: "Đăng nhập thành công.",
      token: signAccessToken({
        userId: Number(user.id),
        username: user.username,
        role: "user",
      }),
      user: sanitizeUser(user),
    });
  } catch (error) {
    return next(error);
  }
}

async function adminLogin(req, res, next) {
  try {
    const inputPassword = String(req.body.adminPassword || "");
    const expectedHash = hashPassword(process.env.WEB_ADMIN_PASSWORD || "Dat166");

    if (!inputPassword) {
      return res.status(400).json({ message: "Thiếu mật khẩu admin." });
    }

    if (hashPassword(inputPassword) !== expectedHash) {
      return res.status(401).json({ message: "Sai mật khẩu admin." });
    }

    return res.json({
      message: "Đăng nhập admin thành công.",
      token: signAccessToken({
        role: "secondary_admin",
        adminType: "web",
      }),
      role: "secondary_admin",
    });
  } catch (error) {
    return next(error);
  }
}

async function getMe(req, res, next) {
  try {
    const user = await queryOne("SELECT * FROM users WHERE id = ? LIMIT 1", [
      Number(req.user.userId),
    ]);

    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng." });
    }

    return res.json({
      user: sanitizeUser(user),
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  adminLogin,
  getMe,
  hashPassword,
  login,
  normalizeIncomingPassword,
  register,
  sanitizeUser,
};
