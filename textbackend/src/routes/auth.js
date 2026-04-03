const express = require("express");

const {
  adminLogin,
  getMe,
  login,
  register,
} = require("../controllers/authController");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

router.post("/login", login);
router.post("/register", register);
router.post("/admin-login", adminLogin);
router.get("/me", authenticateToken, getMe);

module.exports = router;
