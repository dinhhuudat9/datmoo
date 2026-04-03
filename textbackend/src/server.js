require("dotenv").config();

const cors = require("cors");
const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

const { initMainBot } = require("./bots/mainBot");
const { initSecondaryBot } = require("./bots/secondaryBot");
const { bootstrapDatabase } = require("./config/db");
const { startSiteMonitor } = require("./controllers/siteController");
const { siteStatusMiddleware } = require("./middleware/siteStatus");
const authRoutes = require("./routes/auth");
const depositRoutes = require("./routes/deposits");
const orderRoutes = require("./routes/orders");
const productRoutes = require("./routes/products");
const siteRoutes = require("./routes/site");

const app = express();
const port = Number(process.env.PORT || 4000);
const allowedOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
let mainBotInstance = null;
let secondaryBotInstance = null;

const startupState = {
  databaseReady: false,
  botsReady: false,
  ready: false,
  stage: "starting",
  error: null,
};

const corsOptions =
  allowedOrigins.length === 0
    ? {}
    : {
        origin(origin, callback) {
          if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
          }

          return callback(new Error("Origin không được phép."));
        },
      };

app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);
app.use(cors(corsOptions));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message: "Bạn thao tác quá nhanh, vui lòng thử lại sau.",
    },
  }),
);
app.use(
  express.json({
    limit: process.env.JSON_BODY_LIMIT || "6mb",
  }),
);
app.use(
  express.urlencoded({
    extended: true,
    limit: process.env.JSON_BODY_LIMIT || "6mb",
  }),
);

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "HuuDatDev Winter Cloud Shop Backend",
    date: new Date().toISOString(),
    startup: startupState,
  });
});

app.use((req, res, next) => {
  if (req.path === "/health") {
    return next();
  }

  if (!startupState.databaseReady) {
    return res.status(503).json({
      message: "Backend đang khởi động, database chưa sẵn sàng.",
      startup: startupState,
    });
  }

  return next();
});

app.use("/api", siteStatusMiddleware);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api", orderRoutes);
app.use("/api/deposit", depositRoutes);
app.use("/api/site", siteRoutes);

app.use((error, req, res, next) => {
  console.error("[server-error]", error);

  const statusCode = Number(error.status || 500);

  res.status(statusCode).json({
    message: error.message || "Internal Server Error",
  });
});

async function initializeServices() {
  try {
    startupState.stage = "database";
    console.log("[bootstrap] initializing database...");
    await bootstrapDatabase();
    startupState.databaseReady = true;
    console.log("[bootstrap] database ready");

    startupState.stage = "main_bot";
    console.log("[bootstrap] initializing main bot...");
    try {
      mainBotInstance = await initMainBot();
      console.log("[bootstrap] main bot ready");
    } catch (error) {
      console.error("[bootstrap] main bot failed:", error.message);
    }

    startupState.stage = "secondary_bot";
    console.log("[bootstrap] initializing secondary bot...");
    try {
      secondaryBotInstance = await initSecondaryBot();
      console.log("[bootstrap] secondary bot ready");
    } catch (error) {
      console.error("[bootstrap] secondary bot failed:", error.message);
    }

    startupState.botsReady = true;
    startupState.ready = true;
    startupState.stage = "ready";
    startupState.error = null;

    startSiteMonitor();
    console.log("[bootstrap] startup complete");
  } catch (error) {
    startupState.ready = false;
    startupState.stage = "failed";
    startupState.error = error.message;
    console.error("[bootstrap]", error);
  }
}

const server = app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});

const shutdown = async (signal) => {
  try {
    if (mainBotInstance) {
      mainBotInstance.stop(signal);
    }

    if (secondaryBotInstance) {
      secondaryBotInstance.stop(signal);
    }

    server.close(() => {
      process.exit(0);
    });
  } catch (error) {
    console.error("[shutdown]", error);
    process.exit(1);
  }
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

initializeServices();
