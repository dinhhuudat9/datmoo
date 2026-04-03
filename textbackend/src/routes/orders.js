const express = require("express");

const {
  buyProduct,
  getMyOrders,
} = require("../controllers/productController");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

router.post("/buy", authenticateToken, buyProduct);
router.get("/orders/me", authenticateToken, getMyOrders);

module.exports = router;
