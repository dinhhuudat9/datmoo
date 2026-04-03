const express = require("express");

const {
  createProduct,
  deleteProduct,
  getProducts,
} = require("../controllers/productController");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/", getProducts);
router.post("/", requireAdmin, createProduct);
router.delete("/:id", requireAdmin, deleteProduct);

module.exports = router;
