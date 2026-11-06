const db = require("../config/db");
const { safeString, safeNumber } = require("../utils/sqlSafety");
const { getTimestampField, mapTimestampFields } = require("../utils/timestampFields");

/**
 * Get all prices for a supplier
 */
exports.getSupplierPrices = async (req, res) => {
  try {
    const { supplierId } = req.params;

    const [rows] = await db.query(
      "SELECT * FROM gas_prices WHERE supplier_id = ?",
      [supplierId]
    );

    // 🔥 GROUP BY BRAND
    const grouped = {};

    rows.forEach(row => {
      if (!grouped[row.brand]) {
        grouped[row.brand] = {};
      }

      grouped[row.brand][row.size] = row.price;
    });

    return res.json({
      success: true,
      data: grouped
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

/**
 * Update or insert prices for a supplier
 */
exports.updateSupplierPrices = async (req, res) => {
  const { supplierId } = req.params;
  const { prices } = req.body;
  
  if (!supplierId || !Number.isInteger(Number(supplierId))) {
    return res.status(400).json({ 
      success: false, 
      message: "Valid supplier ID required" 
    });
  }

  if (!prices || typeof prices !== 'object') {
    return res.status(400).json({ 
      success: false, 
      message: "Prices object is required" 
    });
  }

  try {
    // Verify supplier exists
    const checkQuery = "SELECT user_id FROM suppliers WHERE user_id = ?";
    const [checkRows] = await db.query(checkQuery, [supplierId]);

    if (!checkRows || checkRows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Supplier not found" 
      });
    }

    // Process price updates
    const updates = [];
    let hasError = false;

    Object.keys(prices).forEach(brand => {
      const brandPrices = prices[brand];
      if (typeof brandPrices === 'object' && brandPrices !== null) {
        Object.keys(brandPrices).forEach(size => {
          const price = brandPrices[size];
          if (typeof price === 'number' && price > 0) {
            updates.push([supplierId, brand, size, price]);
          }
        });
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No valid prices provided" 
      });
    }

    // Use INSERT IGNORE to handle duplicates gracefully with safe timestamp handling
    const updatedField = await getTimestampField('gas_prices', 'updated');
    
    let insertQuery = `
      INSERT INTO gas_prices (supplier_id, brand, size, price) 
      VALUES ? 
      ON DUPLICATE KEY UPDATE 
      price = VALUES(price)
    `;
    
    // Add timestamp update only if the column exists
    if (updatedField) {
      insertQuery += `, ${updatedField} = CURRENT_TIMESTAMP`;
    }

    const [result] = await db.query(insertQuery, [updates]);
    console.log("DB RESULT:", result);
    res.json({
      success: true,
      message: "Prices updated successfully",
      updatedCount: result?.affectedRows || 0
    });
  } catch (err) {
    console.error("Error updating prices:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to update prices: " + err.message 
    });
  }
};

/**
 * Get price for specific brand/size from supplier
 */
exports.getSupplierPrice = async (req, res) => {
  const { supplierId, brand, size } = req.params;
  
  if (!supplierId || !Number.isInteger(Number(supplierId)) || !brand || !size) {
    return res.status(400).json({ 
      success: false, 
      message: "Supplier ID, brand, and size are required" 
    });
  }

  try {
    // Get timestamp field names for gas_prices table
    const updatedField = await getTimestampField('gas_prices', 'updated');
    
    // Build safe SELECT clause with existing timestamp fields
    const selectFields = ['price'];
    if (updatedField) selectFields.push(updatedField);
    
    const query = `
      SELECT ${selectFields.join(', ')}
      FROM gas_prices
      WHERE supplier_id = ? AND brand = ? AND size = ?
    `;

    const [rows] = await db.query(query, [supplierId, brand, size]);
    
    if (!rows || rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Price not found" 
      });
    }

    // Map timestamp fields to standard names
    const mappedRow = mapTimestampFields('gas_prices', rows[0]);

    res.json({
      success: true,
      supplierId: Number(supplierId),
      brand: brand,
      size: size,
      price: Number(rows[0].price),
      updated_at: mappedRow.updated_at
    });
  } catch (err) {
    console.error("Error getting price:", err);
    res.status(500).json({ 
      success: false, 
      message: "Database error: " + err.message
    });
  }
};

/**
 * Delete a specific price
 */
exports.deleteSupplierPrice = async (req, res) => {
  const { supplierId, brand, size } = req.params;
  
  if (!supplierId || !Number.isInteger(Number(supplierId)) || !brand || !size) {
    return res.status(400).json({ 
      success: false, 
      message: "Supplier ID, brand, and size are required" 
    });
  }

  try {
    const query = `
      DELETE FROM gas_prices
      WHERE supplier_id = ? AND brand = ? AND size = ?
    `;

    const [result] = await db.query(query, [supplierId, brand, size]);
    console.log("DB RESULT:", result);
    
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Price not found" 
      });
    }

    res.json({
      success: true,
      message: "Price deleted successfully"
    });
  } catch (err) {
    console.error("Error deleting price:", err);
    res.status(500).json({ 
      success: false, 
      message: "Database error: " + err.message 
    });
  }
};

/**
 * Save gas prices (bulk insert/update) - dedicated endpoint for /api/gas-prices/save
 */
exports.saveGasPrices = async (req, res) => {
  try {
    const { supplierId, prices } = req.body;

    if (!Number.isInteger(Number(supplierId)) || !Array.isArray(prices) || prices.length === 0) {
      return res.status(400).json({ success: false, message: "A valid supplier and inventory list are required" });
    }

    const values = [];
    for (const item of prices) {
      const price = Number(item.price);
      const stock = Number(item.stock_quantity);
      if (!item.brand || !item.size || !Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) {
        return res.status(400).json({ success: false, message: "Each inventory item requires brand, size, positive price, and non-negative whole-number stock" });
      }
      values.push([
        Number(supplierId),
        safeString(item.brand).slice(0, 100),
        safeString(item.size).slice(0, 50),
        price,
        stock,
        stock > 0 ? 1 : 0,
        ["refill", "exchange", "new_cylinder"].includes(item.product_type) ? item.product_type : "refill",
      ]);
    }

    const query = `
      INSERT INTO gas_prices (supplier_id, brand, size, price, stock_quantity, available, product_type)
      VALUES ?
      ON DUPLICATE KEY UPDATE price = VALUES(price), stock_quantity = VALUES(stock_quantity),
        available = VALUES(available), product_type = VALUES(product_type)
    `;

    const [result] = await db.query(query, [values]);

    return res.json({
      success: true,
      inserted: result.affectedRows
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Could not save cooking gas inventory"
    });
  }
};
