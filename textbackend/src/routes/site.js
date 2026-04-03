const express = require("express");

const {
  blockSite,
  getSiteStatus,
  unblockSite,
} = require("../controllers/siteController");
const { requireMainAdmin } = require("../middleware/auth");

const router = express.Router();

router.get("/status", getSiteStatus);
router.post("/block", requireMainAdmin, blockSite);
router.post("/unblock", requireMainAdmin, unblockSite);

module.exports = router;
