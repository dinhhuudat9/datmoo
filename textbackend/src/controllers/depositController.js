const { db, formatCurrency, logAdminAction, queryOne } = require("../config/db");
const {
  notifyDepositProcessed,
  notifyPendingDeposit,
} = require("../utils/telegram");

function mapPendingDepositRow(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    username: row.username || "",
    amount: Number(row.amount || 0),
    phone: row.phone || "",
    code: row.code,
    status: row.status,
    createdAt: row.created_at,
  };
}

async function generateUniqueDepositCode() {
  for (let index = 0; index < 5; index += 1) {
    const code = `NAP${Date.now().toString().slice(-6)}${Math.floor(
      Math.random() * 90 + 10,
    )}`;

    const existed = await queryOne(
      "SELECT id FROM pending_deposits WHERE code = ? LIMIT 1",
      [code],
    );

    if (!existed) {
      return code;
    }
  }

  const error = new Error("Không thể tạo mã nạp tiền duy nhất.");
  error.status = 500;
  throw error;
}

async function listPendingDeposits() {
  const result = await db.execute(`
    SELECT pd.*, u.username
    FROM pending_deposits pd
    INNER JOIN users u ON u.id = pd.user_id
    WHERE pd.status = 'pending'
    ORDER BY pd.id DESC
  `);

  return result.rows.map(mapPendingDepositRow);
}

async function createPendingDeposit({ userId, amount, phone }) {
  const normalizedAmount = Number(amount || 0);

  if (!Number.isFinite(normalizedAmount) || normalizedAmount < 10000) {
    const error = new Error("Số tiền nạp tối thiểu là 10.000đ.");
    error.status = 400;
    throw error;
  }

  const code = await generateUniqueDepositCode();

  const insertResult = await db.execute({
    sql: `INSERT INTO pending_deposits (user_id, amount, phone, code, status)
          VALUES (?, ?, ?, ?, 'pending')`,
    args: [Number(userId), normalizedAmount, phone || null, code],
  });

  const depositId = Number(insertResult.lastInsertRowid || 0);
  const deposit = depositId
    ? await queryOne(
        `SELECT pd.*, u.username
         FROM pending_deposits pd
         INNER JOIN users u ON u.id = pd.user_id
         WHERE pd.id = ?
         LIMIT 1`,
        [depositId],
      )
    : await queryOne(
        `SELECT pd.*, u.username
         FROM pending_deposits pd
         INNER JOIN users u ON u.id = pd.user_id
         WHERE pd.code = ?
         LIMIT 1`,
        [code],
      );

  const mapped = mapPendingDepositRow(deposit);
  await notifyPendingDeposit(mapped);
  return mapped;
}

async function processDepositRequest({ depositId, action = "approve", actor = "web_admin" }) {
  const deposit = await queryOne(
    `SELECT pd.*, u.username
     FROM pending_deposits pd
     INNER JOIN users u ON u.id = pd.user_id
     WHERE pd.id = ? AND pd.status = 'pending'
     LIMIT 1`,
    [Number(depositId)],
  );

  if (!deposit) {
    const error = new Error("Không tìm thấy giao dịch chờ duyệt.");
    error.status = 404;
    throw error;
  }

  const normalizedAction = action === "cancel" ? "cancel" : "approve";

  if (normalizedAction === "approve") {
    await db.execute("BEGIN");

    try {
      await db.execute({
        sql: "UPDATE users SET wallet = wallet + ? WHERE id = ?",
        args: [Number(deposit.amount), Number(deposit.user_id)],
      });

      await db.execute({
        sql: "UPDATE pending_deposits SET status = 'approved' WHERE id = ?",
        args: [Number(depositId)],
      });

      await db.execute("COMMIT");
    } catch (error) {
      await db.execute("ROLLBACK");
      throw error;
    }
  } else {
    await db.execute({
      sql: "UPDATE pending_deposits SET status = 'cancelled' WHERE id = ?",
      args: [Number(depositId)],
    });
  }

  await logAdminAction("secondary", `${normalizedAction}_deposit`, {
    actor,
    depositId: Number(deposit.id),
    username: deposit.username,
    amount: Number(deposit.amount),
    code: deposit.code,
  });

  const updatedUser =
    normalizedAction === "approve"
      ? await queryOne("SELECT wallet FROM users WHERE id = ? LIMIT 1", [
          Number(deposit.user_id),
        ])
      : null;

  return {
    action: normalizedAction,
    deposit: mapPendingDepositRow(deposit),
    wallet: updatedUser ? Number(updatedUser.wallet || 0) : null,
  };
}

async function requestDeposit(req, res, next) {
  try {
    const deposit = await createPendingDeposit({
      userId: req.user.userId,
      amount: req.body.amount,
      phone: String(req.body.phone || "").trim(),
    });

    return res.status(201).json({
      message: `Đã tạo yêu cầu nạp ${formatCurrency(deposit.amount)}.`,
      deposit,
    });
  } catch (error) {
    return next(error);
  }
}

async function getPendingDeposits(req, res, next) {
  try {
    const pending = await listPendingDeposits();
    return res.json({ pending });
  } catch (error) {
    return next(error);
  }
}

async function approveDeposit(req, res, next) {
  try {
    const id = Number(req.body.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "id giao dịch không hợp lệ." });
    }

    const result = await processDepositRequest({
      depositId: id,
      action: req.body.action,
      actor: req.user?.role === "main_admin" ? "main_admin" : "web_admin",
    });

    const payload = {
      message:
        result.action === "approve"
          ? `Đã cộng ${formatCurrency(result.deposit.amount)} cho ${result.deposit.username}.`
          : `Đã hủy giao dịch ${result.deposit.code}.`,
      result,
    };

    await notifyDepositProcessed({
      deposit: result.deposit,
      action: result.action,
      actor: req.user?.role === "main_admin" ? "main_admin" : "web_admin",
    });

    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  approveDeposit,
  createPendingDeposit,
  getPendingDeposits,
  listPendingDeposits,
  processDepositRequest,
  requestDeposit,
};
