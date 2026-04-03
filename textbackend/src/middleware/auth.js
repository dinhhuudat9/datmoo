const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "change-me";

function signAccessToken(payload, expiresIn = "7d") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function readBearerToken(req) {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice(7).trim();
}

function getUserFromRequest(req) {
  const token = readBearerToken(req);

  if (!token) {
    return null;
  }

  return jwt.verify(token, JWT_SECRET);
}

function authenticateToken(req, res, next) {
  try {
    const user = getUserFromRequest(req);

    if (!user) {
      return res.status(401).json({ message: "Thiếu token đăng nhập." });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Token không hợp lệ hoặc đã hết hạn." });
  }
}

function requireAdmin(req, res, next) {
  try {
    const user = getUserFromRequest(req);

    if (!user) {
      return res.status(401).json({ message: "Thiếu token admin." });
    }

    if (!["secondary_admin", "main_admin"].includes(user.role)) {
      return res.status(403).json({ message: "Bạn không có quyền admin." });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Token admin không hợp lệ." });
  }
}

function requireMainAdmin(req, res, next) {
  const mainAdminSecret = req.headers["x-main-admin-secret"];

  if (
    process.env.MAIN_ADMIN_API_KEY &&
    mainAdminSecret &&
    mainAdminSecret === process.env.MAIN_ADMIN_API_KEY
  ) {
    req.user = {
      role: "main_admin",
      source: "api_key",
    };
    return next();
  }

  try {
    const user = getUserFromRequest(req);

    if (!user) {
      return res.status(401).json({ message: "Thiếu xác thực main admin." });
    }

    if (user.role !== "main_admin") {
      return res.status(403).json({ message: "Chỉ main admin mới có quyền này." });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Xác thực main admin không hợp lệ." });
  }
}

module.exports = {
  authenticateToken,
  requireAdmin,
  requireMainAdmin,
  signAccessToken,
};
