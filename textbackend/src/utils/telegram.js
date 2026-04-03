const { Markup } = require("telegraf");

let mainBot = null;
let secondaryBot = null;
let mainAdminChatId = null;
let secondaryAdminChatIds = [];

const maintenanceApprovalRequests = new Map();
const WEB_ADMIN_URL = String(process.env.WEB_ADMIN_URL || "").trim();

function formatCurrency(amount) {
  return `${Number(amount || 0).toLocaleString("vi-VN")}đ`;
}

function registerBots({
  mainBot: nextMainBot,
  secondaryBot: nextSecondaryBot,
  mainAdminId,
  secondaryAdminIds,
} = {}) {
  if (nextMainBot) {
    mainBot = nextMainBot;
  }

  if (nextSecondaryBot) {
    secondaryBot = nextSecondaryBot;
  }

  if (mainAdminId) {
    mainAdminChatId = String(mainAdminId);
  }

  if (Array.isArray(secondaryAdminIds)) {
    secondaryAdminChatIds = secondaryAdminIds.map((id) => String(id));
  }
}

async function sendMessageSafe(bot, chatId, text, extra = {}) {
  if (!bot || !chatId) {
    return false;
  }

  try {
    await bot.telegram.sendMessage(chatId, text, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...extra,
    });
    return true;
  } catch (error) {
    console.error("[telegram-send]", error.message);
    return false;
  }
}

async function broadcastToSecondaryAdmins(text, extra = {}) {
  if (!secondaryBot || secondaryAdminChatIds.length === 0) {
    return;
  }

  await Promise.all(
    secondaryAdminChatIds.map((chatId) =>
      sendMessageSafe(secondaryBot, chatId, text, extra),
    ),
  );
}

async function notifyPendingDeposit(deposit) {
  const text = [
    "💳 <b>Co yeu cau nap tien moi</b>",
    "",
    `• User: <b>${deposit.username}</b>`,
    `• So tien: <b>${formatCurrency(deposit.amount)}</b>`,
    `• SDT: ${deposit.phone || "khong co"}`,
    `• Code: <code>${deposit.code}</code>`,
    "",
    "Ban co the duyet tren Web Admin hoac bam nut duoi day de xu ly ngay trong Telegram.",
  ].join("\n");

  const keyboardRows = [
    [
      Markup.button.callback("✅ Duyet ngay", `secondary:approve:${deposit.id}`),
      Markup.button.callback("❌ Huy", `secondary:cancel:${deposit.id}`),
    ],
  ];

  if (WEB_ADMIN_URL) {
    keyboardRows.push([Markup.button.url("🌐 Mo Web Admin", WEB_ADMIN_URL)]);
  }

  await broadcastToSecondaryAdmins(
    text,
    Markup.inlineKeyboard(keyboardRows),
  );
}

async function notifyDepositProcessed({ deposit, action, actor }) {
  if (!deposit || actor === "secondary_bot") {
    return;
  }

  const actionText = action === "approve" ? "da duyet" : "da huy";
  const icon = action === "approve" ? "✅" : "❌";

  const text = [
    `${icon} <b>Giao dich nap tien da duoc cap nhat</b>`,
    "",
    `• User: <b>${deposit.username}</b>`,
    `• So tien: <b>${formatCurrency(deposit.amount)}</b>`,
    `• Code: <code>${deposit.code}</code>`,
    `• Trang thai: <b>${actionText}</b>`,
    `• Xu ly boi: <code>${actor}</code>`,
  ].join("\n");

  await broadcastToSecondaryAdmins(text);
}

async function notifyMaintenanceRequired(config) {
  const text = [
    "🚨 Website đang bị khóa do quá hạn thanh toán bảo trì",
    `- Số tiền: <b>${formatCurrency(config.paymentAmount)}</b>`,
    `- Deadline: <code>${config.paymentDeadline || "không có"}</code>`,
    `- Message: ${config.blockMessage}`,
    "",
    "Nếu đã chuyển khoản 100k, bấm nút bên dưới để gửi yêu cầu xác nhận sang Bot 1.",
  ].join("\n");

  await broadcastToSecondaryAdmins(
    text,
    Markup.inlineKeyboard([
      [Markup.button.callback("✅ Tôi đã thanh toán 100k", "secondary:maintenance:paid")],
    ]),
  );
}

async function createMaintenanceApprovalRequest(payload) {
  const requestId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  maintenanceApprovalRequests.set(requestId, {
    ...payload,
    createdAt: new Date().toISOString(),
  });

  const text = [
    "📨 Có yêu cầu xác nhận thanh toán bảo trì 100k",
    `- Người báo: <b>${payload.requestedByName}</b>`,
    `- Telegram ID: <code>${payload.requestedByChatId}</code>`,
    `- Deadline hiện tại: <code>${payload.paymentDeadline || "không có"}</code>`,
    `- Blocked: ${payload.blocked ? "Có" : "Không"}`,
  ].join("\n");

  await sendMessageSafe(
    mainBot,
    mainAdminChatId,
    text,
    Markup.inlineKeyboard([
      [
        Markup.button.callback("✅ Duyệt", `main:maintenance:approve:${requestId}`),
        Markup.button.callback("❌ Từ chối", `main:maintenance:reject:${requestId}`),
      ],
    ]),
  );

  return requestId;
}

function getMaintenanceApprovalRequest(requestId) {
  return maintenanceApprovalRequests.get(requestId) || null;
}

function removeMaintenanceApprovalRequest(requestId) {
  maintenanceApprovalRequests.delete(requestId);
}

async function notifyMaintenanceRequestResult(requestId, approved, note = "") {
  const request = getMaintenanceApprovalRequest(requestId);

  if (!request) {
    return;
  }

  const text = approved
    ? `✅ Main Admin đã duyệt thanh toán 100k. ${note}`.trim()
    : `❌ Main Admin đã từ chối yêu cầu xác nhận 100k. ${note}`.trim();

  if (request.requestedByChatId) {
    await sendMessageSafe(secondaryBot, request.requestedByChatId, text);
  }

  removeMaintenanceApprovalRequest(requestId);
}

async function notifyMainAdmin(text, extra = {}) {
  return sendMessageSafe(mainBot, mainAdminChatId, text, extra);
}

module.exports = {
  createMaintenanceApprovalRequest,
  getMaintenanceApprovalRequest,
  notifyDepositProcessed,
  notifyMainAdmin,
  notifyMaintenanceRequestResult,
  notifyMaintenanceRequired,
  notifyPendingDeposit,
  registerBots,
  removeMaintenanceApprovalRequest,
  sendMessageSafe,
};
