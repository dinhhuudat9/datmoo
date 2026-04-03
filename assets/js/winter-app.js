const LOCAL_API_BASE_URL = "http://localhost:4000/api";
const PRODUCTION_API_BASE_URL = "https://server-datdev-shopmmo.onrender.com/api";
const isLocalEnvironment = ["localhost", "127.0.0.1"].includes(
  window.location.hostname,
);

window.API_BASE_URL =
  window.WINTER_CLOUD_SHOP_API ||
  (isLocalEnvironment ? LOCAL_API_BASE_URL : PRODUCTION_API_BASE_URL);

let currentCategory = "all";

function renderProducts() {
  const filtered =
    currentCategory === "all"
      ? products
      : products.filter((product) => product.category === currentCategory);
  const grid = document.getElementById("productsGrid");
  if (!grid) return;
  grid.innerHTML = filtered
    .map(
      (product) =>
        `<div class="product-card"><div><i class="${product.icon}" style="font-size:2rem"></i></div><h3>${escapeHtml(product.name)} ${product.downloadLink ? '<span style="background:#ff66aa60; border-radius:20px; padding:2px 8px; font-size:0.7rem;">🔗 link</span>' : ""}</h3><p>${escapeHtml(product.desc)}</p><div style="font-size:1.8rem; color:#ffbbcc;">${product.priceDisplay}</div><div style="display:flex; gap:0.5rem; margin-top:1rem;"><button class="btn-glow" style="padding:0.4rem 1rem;" onclick="event.stopPropagation(); openDemo(${product.id})"><i class="fas fa-play"></i> Demo</button><button class="btn-glow" style="padding:0.4rem 1rem;" onclick="event.stopPropagation(); openBuyModal(${product.id})">Mua ngay</button></div></div>`,
    )
    .join("");
}

async function filterCategoryWithLoader(cat) {
  showLoader("🐕 Đang chuyển luồng sản phẩm...");
  await new Promise((resolve) => setTimeout(resolve, 300));
  currentCategory = cat;
  document
    .querySelectorAll(".filter-btn")
    .forEach((btn) => btn.classList.remove("active"));
  if (event && event.target) event.target.classList.add("active");
  renderProducts();
  hideLoader();
}

function searchProductsWithLoader() {
  const kw = document.getElementById("searchInput").value.toLowerCase();
  showLoader("🔍 Đang tìm kiếm...");
  setTimeout(() => {
    const filtered = products.filter(
      (product) =>
        product.name.toLowerCase().includes(kw) ||
        product.desc.toLowerCase().includes(kw),
    );
    const grid = document.getElementById("productsGrid");
    if (kw === "") renderProducts();
    else if (filtered.length === 0)
      grid.innerHTML = `<div style="text-align:center;padding:3rem;"><p>Không tìm thấy "${kw}"</p></div>`;
    else
      grid.innerHTML = filtered
        .map(
          (product) =>
            `<div class="product-card"><h3>${escapeHtml(product.name)}</h3><p>${product.priceDisplay}</p><button class="btn-glow" onclick="openBuyModal(${product.id})">Mua</button></div>`,
        )
        .join("");
    hideLoader();
  }, 300);
}

async function confirmBuyWithLoader() {
  if (!selectedProduct || !currentUser) return;
  if ((currentUser.wallet || 0) < selectedProduct.price) {
    Swal.fire("Số dư không đủ", "Vui lòng nạp thêm", "warning");
    closeBuyModal();
    return;
  }
  showLoader("🐕 Đang xử lý giao dịch...");
  try {
    const data = await apiFetch("/buy", {
      method: "POST",
      auth: true,
      body: {
        productId: selectedProduct.id,
      },
    });
    currentUser.wallet = data.wallet;
    saveUserSession(userToken, currentUser);
    if (data.order) orders.unshift(data.order);
    closeBuyModal();
    hideLoader();
    updateWalletDisplay();
    renderHistory();
    if (data.downloadLink)
      Swal.fire({
        title: "Mua thành công!",
        html: `Bạn đã mua <strong>${escapeHtml(
          selectedProduct.name,
        )}</strong>.<br>Nhấn nút để tải file.`,
        icon: "success",
        confirmButtonText: "Tải ngay",
      }).then((result) => {
        if (result.isConfirmed) window.open(data.downloadLink, "_blank");
      });
    else
      Swal.fire(
        "Thông báo",
        "Cảm ơn bạn đã mua. Admin sẽ gửi link qua email.",
        "info",
      );
  } catch (err) {
    hideLoader();
    Swal.fire("Lỗi", err.message, "error");
  }
}

async function requestDepositWithLoader() {
  if (!currentUser) {
    Swal.fire("Vui lòng đăng nhập", "", "warning");
    openAuthModal();
    return;
  }
  const amt = parseInt(document.getElementById("depositAmount").value, 10);
  const phone = document.getElementById("depositPhone").value;
  if (!amt || amt < 10000)
    return Swal.fire("Lỗi", "Số tiền tối thiểu 10,000đ", "error");
  showLoader("🐕 Đang gửi yêu cầu nạp...");
  try {
    const data = await apiFetch("/deposit/request", {
      method: "POST",
      auth: true,
      body: {
        amount: amt,
        phone,
      },
    });
    hideLoader();
    Swal.fire(
      "Đã gửi yêu cầu",
      `Chuyển khoản ${amt.toLocaleString()}đ với nội dung: ${
        data.deposit.code
      }.\nSau khi admin xác nhận, tiền sẽ được cộng.`,
      "success",
    );
    document.getElementById("depositAmount").value = "";
    document.getElementById("depositPhone").value = "";
    if (
      adminToken &&
      document.getElementById("adminPanel").style.display === "block"
    ) {
      await refreshPendingDeposits();
      renderPending();
    }
  } catch (err) {
    hideLoader();
    Swal.fire("Lỗi", err.message, "error");
  }
}

async function addProductWithLoader() {
  const name = document.getElementById("prodName").value.trim();
  const price = parseInt(document.getElementById("prodPrice").value, 10);
  const category = document.getElementById("prodCategory").value;
  const icon = document.getElementById("prodIcon").value.trim() || "fas fa-code";
  const desc = document.getElementById("prodDesc").value.trim();
  const link = document.getElementById("prodDownloadLink").value.trim();
  const fileInput = document.getElementById("prodDemoFile");
  let demoMediaData = "";

  if (!name || Number.isNaN(price) || price <= 0) {
    Swal.fire(
      "Lỗi",
      "Vui lòng nhập tên và giá hợp lệ (số dương)",
      "error",
    );
    return;
  }
  if (!link) {
    Swal.fire("Lỗi", "Vui lòng nhập link tải sản phẩm", "error");
    return;
  }

  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      Swal.fire(
        "File quá lớn",
        "Vui lòng chọn file nhỏ hơn 5MB. File lớn nên dùng link ngoài.",
        "warning",
      );
      return;
    }
    showLoader("🐕 Đang xử lý file demo...");
    try {
      demoMediaData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (event) => reject(event);
        reader.readAsDataURL(file);
      });
    } catch (err) {
      hideLoader();
      Swal.fire(
        "Lỗi đọc file",
        "Không thể đọc file demo, vui lòng thử lại",
        "error",
      );
      return;
    }
  }

  showLoader("🐕 Đang thêm sản phẩm vào backend...");
  try {
    const data = await apiFetch("/products", {
      method: "POST",
      admin: true,
      body: {
        name,
        price,
        priceDisplay: `${price.toLocaleString()}đ`,
        icon,
        desc,
        category,
        downloadLink: link,
        demoMedia: demoMediaData,
      },
    });
    products.unshift(data.product);
    hideLoader();
    Swal.fire("Thành công", `Đã thêm "${name}" vào cửa hàng!`, "success");
    document.getElementById("prodName").value = "";
    document.getElementById("prodPrice").value = "";
    document.getElementById("prodDesc").value = "";
    document.getElementById("prodDownloadLink").value = "";
    document.getElementById("prodDemoFile").value = "";
    renderProducts();
    renderAdminProducts();
  } catch (err) {
    hideLoader();
    Swal.fire("Lỗi lưu dữ liệu", err.message, "error");
  }
}

async function deleteProduct(id) {
  showLoader("🐕 Đang xóa sản phẩm...");
  try {
    await apiFetch(`/products/${id}`, {
      method: "DELETE",
      admin: true,
    });
    products = products.filter((product) => product.id !== id);
    hideLoader();
    renderProducts();
    renderAdminProducts();
    Swal.fire("Đã xóa", "", "success");
  } catch (err) {
    hideLoader();
    Swal.fire("Lỗi", err.message, "error");
  }
}

async function approveDeposit(id) {
  showLoader("🐕 Đang duyệt giao dịch...");
  try {
    const data = await apiFetch("/deposit/approve", {
      method: "POST",
      admin: true,
      body: {
        id,
        action: "approve",
      },
    });
    pendingTransactions = pendingTransactions.filter((tx) => tx.id !== id);
    if (
      currentUser &&
      currentUser.username === data.result.deposit.username &&
      data.result.wallet !== null
    ) {
      currentUser.wallet = data.result.wallet;
      saveUserSession(userToken, currentUser);
    }
    hideLoader();
    updateWalletDisplay();
    renderPending();
    Swal.fire("Đã duyệt", data.message, "success");
  } catch (err) {
    hideLoader();
    Swal.fire("Lỗi", err.message, "error");
  }
}

async function cancelDeposit(id) {
  showLoader("🐕 Đang hủy giao dịch...");
  try {
    const data = await apiFetch("/deposit/approve", {
      method: "POST",
      admin: true,
      body: {
        id,
        action: "cancel",
      },
    });
    pendingTransactions = pendingTransactions.filter((tx) => tx.id !== id);
    hideLoader();
    renderPending();
    Swal.fire("Đã hủy", data.message, "info");
  } catch (err) {
    hideLoader();
    Swal.fire("Lỗi", err.message, "error");
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>]/g, (match) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
  })[match]);
}

function copyZalo() {
  navigator.clipboard.writeText("0986327665");
  Swal.fire("Đã copy", "Zalo: 0986327665", "success");
}

function updateWalletDisplay() {
  const walletDiv = document.getElementById("walletDisplay");
  const authBtn = document.getElementById("authBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const amountSpan = document.getElementById("walletAmount");

  if (currentUser) {
    authBtn.style.display = "none";
    walletDiv.style.display = "flex";
    logoutBtn.style.display = "block";
    amountSpan.innerText = (currentUser.wallet || 0).toLocaleString();
  } else {
    authBtn.style.display = "block";
    walletDiv.style.display = "none";
    logoutBtn.style.display = "none";
  }
}

function openAuthModal() {
  document.getElementById("authModal").style.display = "flex";
  document.getElementById("loginError").style.display = "none";
  document.getElementById("registerError").style.display = "none";
}

function closeAuthModal() {
  document.getElementById("authModal").style.display = "none";
}

function switchAuth(tab) {
  document.getElementById("loginForm").style.display =
    tab === "login" ? "block" : "none";
  document.getElementById("registerForm").style.display =
    tab === "register" ? "block" : "none";
  document.getElementById("loginError").style.display = "none";
  document.getElementById("registerError").style.display = "none";
}

async function login() {
  const un = document.getElementById("loginUsername").value.trim();
  const pwd = document.getElementById("loginPassword").value;

  try {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      body: {
        username: un,
        password: pwd,
      },
    });
    saveUserSession(data.token, data.user);
    await refreshOrders();
    closeAuthModal();
    updateWalletDisplay();
    renderHistory();
    Swal.fire(
      "Chào mừng!",
      `Xin chào ${un}! Số dư: ${(currentUser.wallet || 0).toLocaleString()}đ`,
      "success",
    );
  } catch (err) {
    const errorDiv = document.getElementById("loginError");
    errorDiv.innerText = `❌ ${err.message}`;
    errorDiv.style.display = "block";
  }
}

function logout() {
  clearUserSession();
  updateWalletDisplay();
  renderHistory();
  Swal.fire("Đã đăng xuất", "Hẹn gặp lại!", "success");
}

async function register() {
  const un = document.getElementById("regUsername").value.trim();
  const em = document.getElementById("regEmail").value.trim();
  const pwd = document.getElementById("regPassword").value;
  const cf = document.getElementById("regConfirm").value;
  const errorDiv = document.getElementById("registerError");

  if (!un || !em || !pwd) {
    errorDiv.innerText = "❌ Vui lòng nhập đủ thông tin";
    errorDiv.style.display = "block";
    return;
  }
  if (pwd !== cf) {
    errorDiv.innerText = "❌ Mật khẩu không khớp";
    errorDiv.style.display = "block";
    return;
  }

  try {
    await apiFetch("/auth/register", {
      method: "POST",
      body: {
        username: un,
        email: em,
        password: pwd,
      },
    });
    Swal.fire(
      "Thành công!",
      "Đăng ký thành công! Tài khoản mới có sẵn 2.000đ.",
      "success",
    ).then(() => switchAuth("login"));
  } catch (err) {
    errorDiv.innerText = `❌ ${err.message}`;
    errorDiv.style.display = "block";
  }
}

function openBuyModal(id) {
  if (!currentUser) {
    Swal.fire("Vui lòng đăng nhập", "", "warning");
    openAuthModal();
    return;
  }
  selectedProduct = products.find((product) => product.id === id);
  document.getElementById("buyProductName").innerText = selectedProduct.name;
  document.getElementById("buyProductPrice").innerHTML =
    selectedProduct.priceDisplay;
  document.getElementById("currentBalance").innerText = (
    currentUser.wallet || 0
  ).toLocaleString();
  document.getElementById("buyModal").style.display = "flex";
}

function closeBuyModal() {
  document.getElementById("buyModal").style.display = "none";
  selectedProduct = null;
}

async function renderHistory() {
  const div = document.getElementById("historyList");
  if (!div) return;
  const myOrders = currentUser ? orders : [];
  if (!currentUser || myOrders.length === 0) {
    div.innerHTML =
      '<div style="text-align:center;padding:2rem;"><i class="fas fa-history"></i><p>Chưa có lịch sử</p></div>';
    return;
  }
  div.innerHTML = myOrders
    .map(
      (order) =>
        `<div class="history-item"><div><strong>${escapeHtml(order.productName)}</strong><br><small>${order.date}</small><div>${order.priceDisplay}</div></div><div>${order.downloadLink ? `<button class="download-btn" onclick="window.open('${order.downloadLink}','_blank')"><i class="fas fa-download"></i> Tải lại</button>` : "<span>Không link</span>"}</div></div>`,
    )
    .join("");
}

async function checkAdmin() {
  if (adminToken) {
    try {
      document.getElementById("adminPanel").style.display = "block";
      await refreshPendingDeposits();
      renderAdminProducts();
      renderPending();
    } catch (err) {
      clearAdminSession();
      Swal.fire("Phiên admin hết hạn", "Vui lòng đăng nhập admin lại.", "warning");
    }
    return;
  }

  Swal.fire({
    title: "Xác thực Admin",
    html: `<input id="adminPass" type="password" class="swal2-input" placeholder="Mật khẩu admin">`,
    preConfirm: async () => {
      const adminPassword = document.getElementById("adminPass").value.trim();
      if (!adminPassword) {
        Swal.showValidationMessage("Vui lòng nhập mật khẩu admin");
        return false;
      }

      try {
        const data = await apiFetch("/auth/admin-login", {
          method: "POST",
          body: {
            adminPassword,
          },
        });
        saveAdminSession(data.token);
        return true;
      } catch (err) {
        Swal.showValidationMessage(err.message);
        return false;
      }
    },
  }).then(async (result) => {
    if (!result.isConfirmed) return;
    document.getElementById("adminPanel").style.display = "block";
    await refreshPendingDeposits();
    renderAdminProducts();
    renderPending();
    Swal.fire("Thành công", "Chào mừng Admin!", "success");
  });
}

function renderAdminProducts() {
  const grid = document.getElementById("adminProductsGrid");
  if (!grid) return;
  grid.innerHTML = products
    .map(
      (product) =>
        `<div class="product-card" style="position:relative;"><button onclick="deleteProduct(${product.id})" style="position:absolute; top:10px; right:10px; background:#ff5555; border:none; border-radius:50%; width:30px; height:30px; color:white; cursor:pointer;"><i class="fas fa-trash"></i></button><h3>${escapeHtml(product.name)}</h3><div>${product.priceDisplay}</div><div>🔗 ${product.downloadLink ? "Có link" : "Không link"}</div><div>📂 Demo: ${product.demoMedia ? (product.demoMedia.startsWith("data:") ? "File tải lên" : "Link") : "Chưa có"}</div></div>`,
    )
    .join("");
}

function renderPending() {
  const div = document.getElementById("pendingTransactions");
  if (!div) return;
  div.innerHTML = pendingTransactions
    .map(
      (transaction) =>
        `<div class="history-item"><div><strong>${transaction.username}</strong><br>${transaction.amount.toLocaleString()}đ<br>Mã: ${transaction.code}</div><div><button class="btn-glow" style="padding:0.3rem 1rem;" onclick="approveDeposit(${transaction.id})">✅ Duyệt</button><button class="btn-glow" style="padding:0.3rem 1rem; background:#aa5555;" onclick="cancelDeposit(${transaction.id})">❌ Hủy</button></div></div>`,
    )
    .join("");
}

function checkProductsList() {
  const msg = products
    .map(
      (product) =>
        `- ${product.name}: demo ${product.demoMedia ? (product.demoMedia.startsWith("data:") ? "file upload" : "link") : "none"}`,
    )
    .join("\n");
  Swal.fire("Danh sách sản phẩm", msg || "Chưa có sản phẩm", "info");
}

function openDemo(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product) return;
  document.getElementById("demoContent").innerHTML =
    `<h3>✨ ${escapeHtml(product.name)} ✨</h3><p>${escapeHtml(product.desc)}</p><p>💰 Giá: ${product.priceDisplay}</p>`;
  const mediaDiv = document.getElementById("demoMediaContainer");
  if (product.demoMedia && product.demoMedia.trim() !== "") {
    const media = product.demoMedia;
    if (media.startsWith("data:image/")) {
      mediaDiv.innerHTML = `<img src="${media}" alt="Demo Image" style="max-width:100%; border-radius:1rem;">`;
    } else if (media.startsWith("data:video/")) {
      mediaDiv.innerHTML = `<video controls autoplay muted><source src="${media}" type="${media.split(";")[0].split(":")[1]}">Your browser does not support video.</video>`;
    } else {
      const ext = media.split(".").pop().split("?")[0].toLowerCase();
      if (ext === "mp4" || ext === "webm")
        mediaDiv.innerHTML = `<video controls autoplay muted><source src="${media}" type="video/mp4"></video>`;
      else
        mediaDiv.innerHTML = `<img src="${media}" alt="Demo Image" style="max-width:100%; border-radius:1rem;">`;
    }
  } else {
    mediaDiv.innerHTML = "";
  }
  document.getElementById("demoModal").style.display = "flex";
}

function closeDemoModal() {
  document.getElementById("demoModal").style.display = "none";
}

function generateHeartQR() {
  const content = document.getElementById("qrHeartContent").value.trim();
  if (!content) {
    Swal.fire("Nhập nội dung", "", "warning");
    return;
  }
  const container = document.getElementById("qrCodeContainer");
  container.innerHTML = "";
  new QRCode(container, {
    text: content,
    width: 220,
    height: 220,
    colorDark: "#ff66aa",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H,
  });
  document.getElementById("qrHeartResult").style.display = "block";
}

function downloadHeartQR() {
  const canvas = document.querySelector("#qrCodeContainer canvas");
  if (canvas) {
    const link = document.createElement("a");
    link.href = canvas.toDataURL();
    link.download = "winter_qr.png";
    link.click();
  } else {
    Swal.fire("Lỗi", "Chưa có QR", "error");
  }
}

function generateQRPopup() {
  Swal.fire({
    title: "Tạo QR nhanh",
    html: `<input id="quickQR" placeholder="Nhập nội dung QR" class="swal2-input">`,
    preConfirm: () => {
      const val = document.getElementById("quickQR").value;
      if (val) {
        document.getElementById("qrHeartContent").value = val;
        generateHeartQR();
        navigateWithLoader("qrlove");
      } else {
        Swal.fire("Nội dung trống", "", "warning");
      }
    },
  });
}

const chatbotMsgs = document.getElementById("chatbotMessages");
const chatbotInput = document.getElementById("chatbotInput");
const sendBtn = document.getElementById("sendChatbotBtn");

function addMsg(txt, isUser) {
  const div = document.createElement("div");
  div.style.padding = "8px 12px";
  div.style.margin = "4px 0";
  div.style.borderRadius = "20px";
  div.style.background = isUser ? "#ff88bb" : "rgba(255,255,255,0.2)";
  div.innerHTML = txt;
  chatbotMsgs.appendChild(div);
  chatbotMsgs.scrollTop = chatbotMsgs.scrollHeight;
}

function botReply(msg) {
  const lower = msg.toLowerCase();
  if (lower.includes("mua"))
    return "🛒 Đăng nhập, chọn sản phẩm, nhấn MUA NGAY, link tải xuất hiện ngay!";
  if (lower.includes("nạp"))
    return "💰 Vào mục NẠP TIỀN, chuyển khoản với nội dung NAP+code, admin duyệt sẽ cộng tiền.";
  if (lower.includes("sản phẩm"))
    return "🌟 Có Python tool, website tình yêu, QR code, thẻ... và dữ liệu đã đồng bộ qua backend Turso.";
  return "🐕 Chào bạn! Hỏi về mua hàng, nạp tiền, liên hệ FB/Zalo 0986327665 nhé! ❄️";
}

sendBtn.onclick = () => {
  const txt = chatbotInput.value.trim();
  if (!txt) return;
  addMsg(txt, true);
  chatbotInput.value = "";
  setTimeout(() => addMsg(botReply(txt), false), 200);
};

document.getElementById("closeChatbotBtn").onclick = () =>
  (document.getElementById("chatbotWidget").style.display = "none");
document.querySelector(".chatbot-toggle-btn").onclick = () =>
  (document.getElementById("chatbotWidget").style.display = "block");

const suggestions = [
  "Cách mua hàng?",
  "Nạp tiền thế nào?",
  "Sản phẩm nổi bật",
  "Liên hệ admin",
];

suggestions.forEach((suggestion) => {
  const button = document.createElement("div");
  button.innerText = suggestion;
  button.style.background = "rgba(255,200,220,0.3)";
  button.style.borderRadius = "30px";
  button.style.padding = "5px 12px";
  button.style.cursor = "pointer";
  button.onclick = () => {
    chatbotInput.value = suggestion;
    sendBtn.click();
  };
  document.getElementById("suggestionButtons").appendChild(button);
});

const bgMusic = document.getElementById("bgMusic");
let musicPlaying = false;

document.getElementById("playPauseBtn").onclick = () => {
  if (musicPlaying) bgMusic.pause();
  else bgMusic.play();
  musicPlaying = !musicPlaying;
  document.getElementById("playPauseBtn").className = musicPlaying
    ? "fas fa-pause"
    : "fas fa-play";
};

document.body.addEventListener(
  "click",
  () => {
    if (!musicPlaying) bgMusic.play().catch(() => {});
  },
  { once: true },
);

setInterval(() => {
  const heart = document.createElement("div");
  heart.className = "floating-heart";
  heart.innerHTML = ["❤️", "💖", "💕", "❄️", "🐾"][
    Math.floor(Math.random() * 5)
  ];
  heart.style.left = `${Math.random() * 100}%`;
  heart.style.fontSize = `${Math.random() * 20 + 15}px`;
  heart.style.animationDuration = `${Math.random() * 4 + 4}s`;
  document.body.appendChild(heart);
  setTimeout(() => heart.remove(), 8000);
}, 800);

function initFilters() {
  const cats = ["all", "python", "website", "love", "qrlove", "card"];
  const container = document.getElementById("categoryFilters");
  container.innerHTML = cats
    .map(
      (cat) =>
        `<button class="filter-btn ${cat === "all" ? "active" : ""}" onclick="filterCategoryWithLoader('${cat}')">${cat.toUpperCase()}</button>`,
    )
    .join("");
}

window.addEventListener("load", async () => {
  try {
    await loadDataFromCloud();
  } catch (err) {
    console.error(err);
    Swal.fire("Lỗi kết nối", err.message, "error");
  }
  initFilters();
  renderProducts();
  updateWalletDisplay();
  renderHistory();
  addMsg(
    "Xin chào! Website đã chuyển sang backend Node.js + Turso. Mọi thay đổi sẽ đồng bộ qua API mới.",
    false,
  );
  setTimeout(() => hideLoader(), 500);
});

window.filterCategoryWithLoader = filterCategoryWithLoader;
window.searchProductsWithLoader = searchProductsWithLoader;
window.confirmBuyWithLoader = confirmBuyWithLoader;
window.requestDepositWithLoader = requestDepositWithLoader;
window.addProductWithLoader = addProductWithLoader;
window.deleteProduct = deleteProduct;
window.approveDeposit = approveDeposit;
window.cancelDeposit = cancelDeposit;
window.openBuyModal = openBuyModal;
window.closeBuyModal = closeBuyModal;
window.openDemo = openDemo;
window.closeDemoModal = closeDemoModal;
window.login = login;
window.register = register;
window.logout = logout;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchAuth = switchAuth;
window.checkAdmin = checkAdmin;
window.checkProductsList = checkProductsList;
window.generateHeartQR = generateHeartQR;
window.downloadHeartQR = downloadHeartQR;
window.copyZalo = copyZalo;
window.navigateWithLoader = navigateWithLoader;
window.generateQRPopup = generateQRPopup;
