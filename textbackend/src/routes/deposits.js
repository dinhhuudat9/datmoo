const express = require("express");

const {
  approveDeposit,
  getPendingDeposits,
  requestDeposit,
} = require("../controllers/depositController");
const { authenticateToken, requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.post("/request", authenticateToken, requestDeposit);
router.get("/pending", requireAdmin, getPendingDeposits);
router.post("/approve", requireAdmin, approveDeposit);

module.exports = router;
