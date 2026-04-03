const { db, formatCurrency, logAdminAction, queryOne } = require("../config/db");

function mapProductRow(row) {
  return {
    id: Number(row.id),
    name: row.name,
    price: Number(row.price || 0),
    priceDisplay: row.price_display || formatCurrency(row.price),
    icon: row.icon || "fas fa-code",
    desc: row.description || "",
    description: row.description || "",
    category: row.category || "",
    downloadLink: row.download_link || "",
    demoMedia: row.demo_media || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapOrderRow(row) {
  return {
    id: Number(row.id),
    productId: row.product_id ? Number(row.product_id) : null,
    productName: row.product_name,
    price: Number(row.price || 0),
    priceDisplay: row.price_display || formatCurrency(row.price),
    downloadLink: row.download_link || "",
    date: row.created_at,
    createdAt: row.created_at,
  };
}

async function listProducts() {
  const result = await db.execute("SELECT * FROM products ORDER BY id DESC");
  return result.rows.map(mapProductRow);
}

async function createProductRecord(input, actor = "secondary_admin") {
  const name = String(input.name || "").trim();
  const price = Number(input.price || 0);
  const category = String(input.category || "").trim();
  const icon = String(input.icon || "fas fa-code").trim();
  const description = String(input.description || input.desc || "").trim();
  const downloadLink = String(input.downloadLink || input.download_link || "").trim();
  const demoMedia = String(input.demoMedia || input.demo_media || "").trim();

  if (!name || !Number.isFinite(price) || price <= 0) {
    const error = new Error("Tên sản phẩm hoặc giá không hợp lệ.");
    error.status = 400;
    throw error;
  }

  const insertResult = await db.execute({
    sql: `INSERT INTO products
      (name, price, price_display, icon, description, category, download_link, demo_media, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    args: [
      name,
      price,
      String(input.priceDisplay || formatCurrency(price)),
      icon || "fas fa-code",
      description || null,
      category || null,
      downloadLink || null,
      demoMedia || null,
    ],
  });

  const insertedId = Number(insertResult.lastInsertRowid || 0);
  const product = insertedId
    ? await queryOne("SELECT * FROM products WHERE id = ? LIMIT 1", [insertedId])
    : await queryOne(
        "SELECT * FROM products WHERE name = ? ORDER BY id DESC LIMIT 1",
        [name],
      );

  await logAdminAction("secondary", "create_product", {
    actor,
    productId: Number(product.id),
    name: product.name,
  });

  return mapProductRow(product);
}

async function deleteProductRecord(productId, actor = "secondary_admin") {
  const row = await queryOne("SELECT * FROM products WHERE id = ? LIMIT 1", [
    Number(productId),
  ]);

  if (!row) {
    return null;
  }

  await db.execute({
    sql: "DELETE FROM products WHERE id = ?",
    args: [Number(productId)],
  });

  await logAdminAction("secondary", "delete_product", {
    actor,
    productId: Number(productId),
    name: row.name,
  });

  return mapProductRow(row);
}

async function listOrdersForUser(userId) {
  const result = await db.execute({
    sql: "SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC",
    args: [Number(userId)],
  });

  return result.rows.map(mapOrderRow);
}

async function buyProductForUser({ userId, productId }) {
  const product = await queryOne("SELECT * FROM products WHERE id = ? LIMIT 1", [
    Number(productId),
  ]);

  if (!product) {
    const error = new Error("Không tìm thấy sản phẩm.");
    error.status = 404;
    throw error;
  }

  await db.execute("BEGIN");

  try {
    const walletUpdate = await db.execute({
      sql: `UPDATE users
            SET wallet = wallet - ?
            WHERE id = ? AND wallet >= ?`,
      args: [Number(product.price), Number(userId), Number(product.price)],
    });

    if (!walletUpdate.rowsAffected) {
      const error = new Error("Số dư không đủ để mua sản phẩm.");
      error.status = 400;
      throw error;
    }

    const insertOrderResult = await db.execute({
      sql: `INSERT INTO orders
        (user_id, product_id, product_name, price, price_display, download_link)
        VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        Number(userId),
        Number(product.id),
        product.name,
        Number(product.price),
        product.price_display || formatCurrency(product.price),
        product.download_link || null,
      ],
    });

    const walletRow = await queryOne("SELECT wallet FROM users WHERE id = ? LIMIT 1", [
      Number(userId),
    ]);

    const orderId = Number(insertOrderResult.lastInsertRowid || 0);
    const order = orderId
      ? await queryOne("SELECT * FROM orders WHERE id = ? LIMIT 1", [orderId])
      : await queryOne(
          "SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 1",
          [Number(userId)],
        );

    await db.execute("COMMIT");

    return {
      wallet: Number(walletRow.wallet || 0),
      order: mapOrderRow(order),
      product: mapProductRow(product),
    };
  } catch (error) {
    await db.execute("ROLLBACK");
    throw error;
  }
}

async function getProducts(req, res, next) {
  try {
    const products = await listProducts();
    return res.json({ products });
  } catch (error) {
    return next(error);
  }
}

async function createProduct(req, res, next) {
  try {
    const actor = req.user?.role === "main_admin" ? "main_admin" : "web_admin";
    const product = await createProductRecord(req.body, actor);
    return res.status(201).json({
      message: "Thêm sản phẩm thành công.",
      product,
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const deleted = await deleteProductRecord(
      req.params.id,
      req.user?.role === "main_admin" ? "main_admin" : "web_admin",
    );

    if (!deleted) {
      return res.status(404).json({ message: "Không tìm thấy sản phẩm." });
    }

    return res.json({
      message: "Xóa sản phẩm thành công.",
      product: deleted,
    });
  } catch (error) {
    return next(error);
  }
}

async function buyProduct(req, res, next) {
  try {
    const productId = Number(req.body.productId || req.body.id);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: "productId không hợp lệ." });
    }

    const result = await buyProductForUser({
      userId: Number(req.user.userId),
      productId,
    });

    return res.json({
      message: "Mua sản phẩm thành công.",
      wallet: result.wallet,
      order: result.order,
      downloadLink: result.order.downloadLink || "",
    });
  } catch (error) {
    return next(error);
  }
}

async function getMyOrders(req, res, next) {
  try {
    const orders = await listOrdersForUser(req.user.userId);
    return res.json({ orders });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  buyProduct,
  buyProductForUser,
  createProduct,
  createProductRecord,
  deleteProduct,
  deleteProductRecord,
  getMyOrders,
  getProducts,
  listOrdersForUser,
  listProducts,
};
