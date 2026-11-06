const db = require("../config/db");
const { safeQuery, safeJsonParse, safeString, safeNumber, validateRequiredFields } = require("../utils/sqlSafety");
const { buildSafeUpdateClause, getTimestampField } = require("../utils/timestampFields");

/**
 * Check supplier onboarding status
 * Returns supplier data with selected_brands validation
 */
exports.checkSupplierStatus = (req, res) => {
  const { userId } = req.params;
  
  if (!userId || !Number.isInteger(Number(userId))) {
    return res.status(400).json({ 
      success: false, 
      message: "Valid user ID required" 
    });
  }

  const query = `
    SELECT u.id, u.email, u.role,
           sp.user_id, sp.full_name, sp.city, sp.area, sp.selected_brands
    FROM users u
    LEFT JOIN suppliers sp ON sp.user_id = u.id
    WHERE u.id = ? AND u.role = 'supplier'
  `;

  safeQuery(db, query, [userId], (err, rows) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: "Database error" 
      });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Supplier not found" 
      });
    }

    const supplier = rows[0];
    
    // Parse selected_brands safely - handle string, array, or null
    let selectedBrands = [];
    console.log('BACKEND STATUS: Raw selected_brands from DB:', supplier.selected_brands);
    console.log('BACKEND STATUS: Type of selected_brands:', typeof supplier.selected_brands);
    
    if (supplier.selected_brands) {
      if (Array.isArray(supplier.selected_brands)) {
        selectedBrands = supplier.selected_brands.filter(brand => typeof brand === 'string' && brand.trim().length > 0);
      } else if (typeof supplier.selected_brands === 'string') {
        try {
          const parsed = JSON.parse(supplier.selected_brands);
          selectedBrands = Array.isArray(parsed) ? parsed.filter(brand => typeof brand === 'string' && brand.trim().length > 0) : [];
        } catch (parseError) {
          console.error('BACKEND STATUS: JSON parse error:', parseError);
          // Try to split by comma if JSON parse fails
          selectedBrands = supplier.selected_brands.split(',').map(brand => brand.trim()).filter(brand => brand.length > 0);
        }
      }
    }
    
    console.log('BACKEND STATUS: Final processed selectedBrands:', selectedBrands);
    const hasSelectedBrands = Array.isArray(selectedBrands) && selectedBrands.length > 0;
    console.log('BACKEND STATUS: hasSelectedBrands:', hasSelectedBrands);

    // Check if supplier has pricing data
    const pricingQuery = `
      SELECT COUNT(*) as price_count
      FROM supplier_pricing sp
      WHERE sp.supplier_id = ?
    `;

    safeQuery(db, pricingQuery, [userId], (pricingErr, pricingRows) => {
      if (pricingErr) {
        console.error('Error checking pricing:', pricingErr);
        // Continue without pricing check
      }

      const hasPricing = pricingRows && pricingRows[0] && pricingRows[0].price_count > 0;
      
      // Determine redirect URL based on onboarding status
      let redirectUrl = '/supplier-dashboard';
      if (!hasSelectedBrands) {
        redirectUrl = '/choose-brands';
      } else if (!hasPricing) {
        redirectUrl = '/seller-set-prices';
      }

      const response = {
        success: true,
        supplier: {
          id: safeNumber(supplier.id),
          email: safeString(supplier.email),
          full_name: safeString(supplier.full_name),
          city: safeString(supplier.city),
          area: safeString(supplier.area),
          selected_brands: hasSelectedBrands ? selectedBrands : []
        },
        needsBrandSelection: !hasSelectedBrands,
        pricing_completed: hasPricing,
        redirectUrl: redirectUrl
      };

      res.json(response);
    });
  });
};

/**
 * Save supplier selected brands
 * Updates suppliers.selected_brands field
 */
exports.saveSelectedBrands = (req, res) => {
  console.log('BACKEND: saveSelectedBrands called');
  console.log('BACKEND: Request params:', req.params);
  console.log('BACKEND: Request body:', req.body);
  
  const { userId } = req.params;
  const { selected_brands } = req.body;  // FIXED: Use correct field name

  console.log('BACKEND: Extracted userId:', userId);
  console.log('BACKEND: Extracted selected_brands:', selected_brands);

  if (!userId || !Number.isInteger(Number(userId))) {
    console.error('BACKEND: Invalid user ID:', userId);
    return res.status(400).json({ 
      success: false, 
      message: "Valid user ID required" 
    });
  }

  if (!Array.isArray(selected_brands) || selected_brands.length === 0) {
    console.error('BACKEND: Invalid selected_brands:', selected_brands);
    return res.status(400).json({ 
      success: false, 
      message: "Selected brands array is required" 
    });
  }

  // Validate brand names (basic validation)
  const validBrands = selected_brands
    .filter(brand => typeof brand === 'string' && brand.trim().length > 0)
    .map(brand => safeString(brand).trim())
    .filter(brand => brand.length > 0);

  console.log('BACKEND: Validated brands:', validBrands);

  if (validBrands.length === 0) {
    console.error('BACKEND: No valid brands after validation');
    return res.status(400).json({ 
      success: false, 
      message: "At least one valid brand must be selected" 
    });
  }

  // Update supplier selected brands directly
  const query = `UPDATE suppliers SET selected_brands = ? WHERE user_id = ?`;
  const params = [JSON.stringify(validBrands), userId];

  console.log('BACKEND: Executing update query:', query);
  console.log('BACKEND: Query params:', params);

  safeQuery(db, query, params, (err, result) => {
    if (err) {
      console.error('BACKEND: Database error:', err);
      return res.status(500).json({
        success: false,
        message: "Database error: " + err.message
      });
    }

    console.log('BACKEND: Query result:', result);
    console.log('BACKEND: Affected rows:', result?.affectedRows);
    console.log('BACKEND: Final validBrands being returned:', validBrands);

    if (!result || result.affectedRows === 0) {
      console.error('BACKEND: No rows affected, supplier not found');
      return res.status(404).json({
        success: false,
        message: "Supplier not found"
      });
    }

    console.log('BACKEND: Brands saved successfully');
    res.json({
      success: true,
      message: "Brands saved successfully",
      selected_brands: validBrands
    });
  });
};

/**
 * Get selected brands for a supplier
 */
exports.getSelectedBrands = (req, res) => {
  const { supplierId } = req.params;
  
  if (!supplierId || !Number.isInteger(Number(supplierId))) {
    return res.status(400).json({ 
      success: false, 
      message: "Valid supplier ID required" 
    });
  }

  const query = `
    SELECT selected_brands
    FROM suppliers
    WHERE user_id = ?
  `;

  safeQuery(db, query, [supplierId], (err, rows) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: "Database error: " + err.message 
      });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Supplier not found" 
      });
    }

    let selectedBrands = [];
    try {
      selectedBrands = safeJsonParse(rows[0].selected_brands, []);
    } catch (e) {
      console.warn("Error parsing selected_brands for supplier", supplierId, e.message);
    }

    res.json({
      success: true,
      selectedBrands: Array.isArray(selectedBrands) ? selectedBrands : []
    });
  });
};

/**
 * Get supplier prices grouped by brand
 */
exports.getSupplierPricesGrouped = (req, res) => {
  const { supplierId } = req.params;
  
  if (!supplierId || !Number.isInteger(Number(supplierId))) {
    return res.status(400).json({ 
      success: false, 
      message: "Valid supplier ID required" 
    });
  }

  // Get timestamp field names for gas_prices table
  getTimestampField('gas_prices', 'created')
    .then(createdField => {
      return getTimestampField('gas_prices', 'updated')
        .then(updatedField => {
          // Build safe SELECT clause with existing timestamp fields
          const selectFields = ['brand', 'size', 'price', 'stock_quantity', 'available', 'product_type'];
          if (createdField) selectFields.push(createdField);
          if (updatedField) selectFields.push(updatedField);
          
          const query = `
            SELECT ${selectFields.join(', ')}
            FROM gas_prices
            WHERE supplier_id = ?
            ORDER BY brand, size
          `;

          return safeQuery(db, query, [supplierId]);
        });
    })
    .then((rows) => {
      // Group prices by brand
      const groupedPrices = {};
      rows.forEach(row => {
        if (!groupedPrices[row.brand]) {
          groupedPrices[row.brand] = [];
        }
        
        groupedPrices[row.brand].push({
          size: row.size,
          price: Number(row.price),
          stock_quantity: Number(row.stock_quantity || 0),
          available: Boolean(row.available),
          product_type: row.product_type || 'refill'
        });
      });

      res.json({
        success: true,
        supplierId: Number(supplierId),
        prices: groupedPrices
      });
    })
    .catch((err) => {
      console.error("Error getting grouped supplier prices:", err);
      res.status(500).json({ 
        success: false, 
        message: "Database error: " + err.message 
      });
    });
};

/**
 * Set supplier prices (bulk insert/update)
 */
exports.setSupplierPrices = (req, res) => {
  console.log('PRICING BACKEND: setSupplierPrices called');
  console.log('PRICING BACKEND: Request body:', req.body);
  
  const { supplierId, prices } = req.body;
  
  console.log('PRICING BACKEND: Extracted supplierId:', supplierId);
  console.log('PRICING BACKEND: Extracted prices:', prices);
  
  if (!supplierId || !Number.isInteger(Number(supplierId))) {
    console.error('PRICING BACKEND: Invalid supplier ID:', supplierId);
    return res.status(400).json({ 
      success: false, 
      message: "Valid supplier ID required" 
    });
  }

  if (!Array.isArray(prices) || prices.length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: "Prices array is required" 
    });
  }

  // Validate price data
  const validPrices = [];
  for (const item of prices) {
    if (item.brand && item.size && typeof item.price === 'number' && item.price > 0) {
      validPrices.push({
        supplier_id: Number(supplierId),
        brand: safeString(item.brand),
        size: safeString(item.size),
        price: Number(item.price)
      });
    }
  }

  if (validPrices.length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: "No valid prices provided" 
    });
  }

  // Get timestamp field names for gas_prices table
  getTimestampField('gas_prices', 'updated')
    .then(updatedField => {
      // Build INSERT ... ON DUPLICATE KEY UPDATE query
      let updateClause = 'price = VALUES(price)';
      if (updatedField) {
        updateClause += `, ${updatedField} = CURRENT_TIMESTAMP`;
      }

      const query = `
        INSERT INTO gas_prices (supplier_id, brand, size, price)
        VALUES ?
        ON DUPLICATE KEY UPDATE
        ${updateClause}
      `;

      return safeQuery(db, query, [validPrices]);
    })
    .then((result) => {
      console.log('PRICING: Prices saved successfully:', result);
      res.json({
        success: true,
        message: "Prices saved successfully",
        updatedCount: result.affectedRows || validPrices.length
      });
    })
    .catch((err) => {
      console.error("Error setting supplier prices:", err);
      res.status(500).json({ 
        success: false, 
        message: "Database error: " + err.message 
      });
    });
};

/**
 * List all active suppliers for customers
 */
exports.listSuppliers = (req, res) => {
  const query = `
    SELECT u.id AS supplier_id, u.email, u.role,
           sp.user_id, sp.full_name, sp.city, sp.area, sp.selected_brands
    FROM users u
    LEFT JOIN suppliers sp ON sp.user_id = u.id
    WHERE u.role = 'supplier' AND u.id IS NOT NULL
    ORDER BY sp.full_name ASC
  `;

  safeQuery(db, query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: "Database error: " + err.message 
      });
    }

    // Process suppliers and parse selected brands
    const suppliers = rows.map(row => {
      let selectedBrands = [];
      try {
        selectedBrands = safeJsonParse(row.selected_brands, []);
      } catch (e) {
        console.warn("Error parsing selected_brands for supplier", row.supplier_id, e.message);
      }

      return {
        id: Number(row.supplier_id),
        full_name: row.full_name || '',
        city: row.city || '',
        area: row.area || '',
        email: row.email,
        brands: Array.isArray(selectedBrands) ? selectedBrands : []
      };
    });

    console.log('SUPPLIERS: Returning suppliers list:', suppliers);

    res.json({
      success: true,
      suppliers: suppliers
    });
  });
};

/**
 * Get seller dashboard statistics
 */
exports.getSellerStats = (req, res) => {
  const { supplierId } = req.params;
  
  if (!supplierId || !Number.isInteger(Number(supplierId))) {
    return res.status(400).json({ 
      success: false, 
      message: "Valid supplier ID required" 
    });
  }

  console.log('STATS: Loading dashboard stats for supplier:', supplierId);

  // Get timestamp field names for orders table
  getTimestampField('orders', 'created')
    .then(createdField => {
      const dateField = createdField || 'created_at';
      
      // Build multiple queries for comprehensive stats
      const queries = [
        // Total orders count
        `SELECT COUNT(*) as totalOrders FROM orders WHERE supplier_id = ?`,
        
        // Total revenue
        `SELECT COALESCE(SUM(price), 0) as revenue FROM orders WHERE supplier_id = ? AND status IN ('completed', 'delivered')`,
        
        // Top brand
        `SELECT brand, COUNT(*) as count FROM orders WHERE supplier_id = ? GROUP BY brand ORDER BY count DESC LIMIT 1`,
        
        // Top cylinder size
        `SELECT size, COUNT(*) as count FROM orders WHERE supplier_id = ? GROUP BY size ORDER BY count DESC LIMIT 1`,
        
        // Daily orders for last 7 days
        `SELECT DATE(${dateField}) as date, COUNT(*) as orders 
         FROM orders 
         WHERE supplier_id = ? AND ${dateField} >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)
         GROUP BY DATE(${dateField}) 
         ORDER BY date`,
        
        // Order status counts
        `SELECT status, COUNT(*) as count FROM orders WHERE supplier_id = ? GROUP BY status`
      ];

      const promises = queries.map(query => 
        safeQuery(db, query, [supplierId])
      );

      return Promise.all(promises);
    })
    .then(([totalOrdersResult, revenueResult, topBrandResult, topSizeResult, dailyOrdersResult, statusResult]) => {
      const stats = {
        totalOrders: totalOrdersResult[0]?.totalOrders || 0,
        revenue: Number(revenueResult[0]?.revenue) || 0,
        topBrand: topBrandResult[0]?.brand || 'N/A',
        topCylinderSize: topSizeResult[0]?.size || 'N/A',
        dailyOrders: dailyOrdersResult.map(row => ({
          date: row.date,
          orders: row.orders
        })),
        pendingOrders: 0,
        completedOrders: 0
      };

      // Calculate status counts
      statusResult.forEach(row => {
        if (row.status === 'pending') {
          stats.pendingOrders = row.count;
        } else if (row.status === 'completed' || row.status === 'delivered') {
          stats.completedOrders += row.count;
        }
      });

      console.log('STATS: Dashboard stats calculated:', stats);

      res.json({
        success: true,
        stats: stats
      });
    })
    .catch((err) => {
      console.error("Error getting seller stats:", err);
      res.status(500).json({ 
        success: false, 
        message: "Database error: " + err.message 
      });
    });
};

/**
 * Get supplier with pricing from gas_prices table
 * Returns supplier data with current pricing
 */
exports.getSupplierWithPricing = (req, res) => {
  const { supplierId } = req.params;
  
  if (!supplierId || !Number.isInteger(Number(supplierId))) {
    return res.status(400).json({ 
      success: false, 
      message: "Valid supplier ID required" 
    });
  }

  const query = `
    SELECT u.id, u.email, u.phone,
           sp.full_name, sp.city, sp.area, sp.country, sp.latitude, sp.longitude,
           sp.selected_brands
    FROM users u
    INNER JOIN suppliers sp ON sp.user_id = u.id
    WHERE u.id = ? AND u.role = 'supplier'
  `;

  db.query(query, [supplierId], (err, rows) => {
    if (err) {
      console.error("Error getting supplier:", err);
      return res.status(500).json({ 
        success: false, 
        message: "Database error" 
      });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Supplier not found" 
      });
    }

    const supplier = rows[0];
    
    // Parse selected_brands safely
    let selectedBrands = [];
    try {
      if (supplier.selected_brands) {
        const parsed = JSON.parse(supplier.selected_brands);
        if (Array.isArray(parsed)) {
          selectedBrands = parsed;
        }
      }
    } catch (e) {
      console.warn("Error parsing selected_brands for supplier", supplierId, e.message);
    }

    // Get pricing from gas_prices table
    const pricingQuery = `
      SELECT brand, size, price
      FROM gas_prices
      WHERE supplier_id = ?
      ORDER BY brand, size
    `;

    db.query(pricingQuery, [supplierId], (pricingErr, pricingRows) => {
      if (pricingErr) {
        console.error("Error getting pricing:", pricingErr);
        // Return supplier data without pricing rather than failing
        return res.json({
          success: true,
          supplier: {
            id: supplier.id,
            email: supplier.email,
            phone: supplier.phone,
            full_name: supplier.full_name,
            city: supplier.city,
            area: supplier.area,
            country: supplier.country,
            latitude: supplier.latitude,
            longitude: supplier.longitude,
            selected_brands: selectedBrands,
            prices: {}
          }
        });
      }

      // Convert pricing rows to structured object
      const prices = {};
      pricingRows.forEach(row => {
        if (!prices[row.brand]) {
          prices[row.brand] = {};
        }
        prices[row.brand][row.size] = Number(row.price);
      });

      res.json({
        success: true,
        supplier: {
          id: supplier.id,
          email: supplier.email,
          phone: supplier.phone,
          full_name: supplier.full_name,
          city: supplier.city,
          area: supplier.area,
          country: supplier.country,
          latitude: supplier.latitude,
          longitude: supplier.longitude,
          selected_brands: selectedBrands,
          prices: prices
        }
      });
    });
  });
};
