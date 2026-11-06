const db = require("../config/db");
const { validateCoordinates } = require("../utils/coordinates");

// Haversine formula to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in kilometers
}

exports.saveLocation = (req, res) => {
  const { user_id, order_id, latitude, longitude } = req.body;
  if (!user_id || latitude == null || longitude == null) {
    return res.status(400).json({ message: "user_id, latitude, longitude required" });
  }
  let coords;
  try {
    coords = validateCoordinates(latitude, longitude);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  const lat = coords.lat;
  const lng = coords.lng;
  const oid = order_id || null;

  db.query(
    "INSERT INTO locations (user_id, order_id, latitude, longitude) VALUES (?, ?, ?, ?)",
    [user_id, oid, lat, lng],
    (err) => {
      if (err) return res.status(500).json({ message: err.message });

      // Update user's current location in users table
      db.query(
        "UPDATE users SET latitude = ?, longitude = ?, last_updated_location = CURRENT_TIMESTAMP WHERE id = ?",
        [lat, lng, user_id],
        (updateErr) => {
          if (updateErr) console.error("Error updating user location:", updateErr.message);
        }
      );

      if (oid) {
        db.query(
          "UPDATE orders SET delivery_lat = ?, delivery_lng = ? WHERE id = ?",
          [lat, lng, oid],
          () => {
            db.query(
              `UPDATE delivery_guy dg
               INNER JOIN orders o ON o.id = ? AND o.driver_id = dg.id
               SET dg.latitude = ?, dg.longitude = ?
               WHERE dg.user_id = ?`,
              [oid, lat, lng, user_id],
              () => res.json({ success: true })
            );
          }
        );
      } else {
        res.json({ success: true });
      }
    }
  );
};

// Update user location (new endpoint for GPS tracking)
exports.updateUserLocation = (req, res) => {
  const { user_id, latitude, longitude } = req.body;
  if (!user_id || latitude == null || longitude == null) {
    return res.status(400).json({ message: "user_id, latitude, longitude required" });
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  // Validate coordinates
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ message: "Invalid coordinates" });
  }

  db.query(
    "UPDATE users SET latitude = ?, longitude = ?, last_updated_location = CURRENT_TIMESTAMP WHERE id = ?",
    [lat, lng, user_id],
    (err, result) => {
      if (err) return res.status(500).json({ message: err.message });
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ success: true, latitude: lat, longitude: lng });
    }
  );
};

// Get nearby users/drivers/suppliers
exports.getNearbyUsers = (req, res) => {
  const { latitude, longitude, radius = 5, role } = req.query;
  
  if (!latitude || !longitude) {
    return res.status(400).json({ message: "latitude and longitude required" });
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  const searchRadius = Number(radius);

  if (isNaN(lat) || isNaN(lng) || isNaN(searchRadius)) {
    return res.status(400).json({ message: "Invalid parameters" });
  }

  let whereClause = "WHERE u.latitude IS NOT NULL AND u.longitude IS NOT NULL";
  let params = [lat, lng, searchRadius];

  if (role) {
    whereClause += " AND u.role = ?";
    params.push(role);
  }

  const query = `
    SELECT u.id, u.email, u.role, u.latitude, u.longitude, u.last_updated_location,
           c.full_name, c.phone, c.profile_image,
           (${calculateDistance.toString().replace(/function.*?\{/, '').replace(/\}$/, '')}) AS distance_km
    FROM users u
    LEFT JOIN customers c ON c.user_id = u.id
    ${whereClause}
    HAVING distance_km <= ?
    ORDER BY distance_km ASC
    LIMIT 50
  `;

  // Simplified distance calculation for SQL
  const distanceQuery = `
    SELECT u.id, u.email, u.role, u.latitude, u.longitude, u.last_updated_location,
           c.full_name, c.phone, c.profile_image,
           (6371 * acos(cos(radians(?)) * cos(radians(u.latitude)) * 
            cos(radians(u.longitude) - radians(?)) + sin(radians(?)) * 
            sin(radians(u.latitude)))) AS distance_km
    FROM users u
    LEFT JOIN customers c ON c.user_id = u.id
    ${whereClause}
    HAVING distance_km <= ?
    ORDER BY distance_km ASC
    LIMIT 50
  `;

  db.query(distanceQuery, params, (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json({ users: rows, center: { latitude: lat, longitude: lng }, radius: searchRadius });
  });
};

// Get nearby suppliers
exports.getNearbySuppliers = (req, res) => {
  const { latitude, longitude, radius = 5 } = req.query;
  
  if (!latitude || !longitude) {
    return res.status(400).json({ message: "latitude and longitude required" });
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  const searchRadius = Number(radius);

  const query = `
    SELECT s.user_id, s.full_name, s.phone, s.profile_image, s.latitude, s.longitude,
           s.city, s.area, s.selected_brands, s.prices,
           (6371 * acos(cos(radians(?)) * cos(radians(s.latitude)) * 
            cos(radians(s.longitude) - radians(?)) + sin(radians(?)) * 
            sin(radians(s.latitude)))) AS distance_km
    FROM suppliers s
    WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL
    HAVING distance_km <= ?
    ORDER BY distance_km ASC
    LIMIT 50
  `;

  db.query(query, [lat, lng, lat, searchRadius], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json({ suppliers: rows, center: { latitude: lat, longitude: lng }, radius: searchRadius });
  });
};

// Get nearby drivers
exports.getNearbyDrivers = (req, res) => {
  const { latitude, longitude, radius = 5 } = req.query;
  
  if (!latitude || !longitude) {
    return res.status(400).json({ message: "latitude and longitude required" });
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  const searchRadius = Number(radius);

  const query = `
    SELECT dg.id, dg.user_id, dg.full_name, dg.phone, dg.vehicle_type, dg.plate_number,
           dg.status, dg.latitude, dg.longitude,
           (6371 * acos(cos(radians(?)) * cos(radians(dg.latitude)) * 
            cos(radians(dg.longitude) - radians(?)) + sin(radians(?)) * 
            sin(radians(dg.latitude)))) AS distance_km
    FROM delivery_guy dg
    WHERE dg.latitude IS NOT NULL AND dg.longitude IS NOT NULL AND dg.status = 'available'
    HAVING distance_km <= ?
    ORDER BY distance_km ASC
    LIMIT 50
  `;

  db.query(query, [lat, lng, lat, searchRadius], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json({ drivers: rows, center: { latitude: lat, longitude: lng }, radius: searchRadius });
  });
};

// Create report with GPS location
exports.createReport = (req, res) => {
  const { user_id, latitude, longitude, description } = req.body;
  
  if (!user_id || latitude == null || longitude == null || !description) {
    return res.status(400).json({ message: "user_id, latitude, longitude, and description required" });
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ message: "Invalid coordinates" });
  }

  db.query(
    "INSERT INTO reports (user_id, latitude, longitude, description) VALUES (?, ?, ?, ?)",
    [user_id, lat, lng, description],
    (err, result) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json({ success: true, report_id: result.insertId });
    }
  );
};

// Get all reports filtered by region
exports.getAllReports = (req, res) => {
  const { latitude, longitude, radius = 10 } = req.query;
  
  if (!latitude || !longitude) {
    // Return all reports if no location provided
    db.query(
      `SELECT r.*, u.email, c.full_name 
       FROM reports r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN customers c ON c.user_id = r.user_id
       ORDER BY r.created_at DESC`,
      (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json({ reports: rows });
      }
    );
    return;
  }

  const lat = Number(latitude);
  const lng = Number(longitude);
  const searchRadius = Number(radius);

  const query = `
    SELECT r.*, u.email, c.full_name,
           (6371 * acos(cos(radians(?)) * cos(radians(r.latitude)) * 
            cos(radians(r.longitude) - radians(?)) + sin(radians(?)) * 
            sin(radians(r.latitude)))) AS distance_km
    FROM reports r
    LEFT JOIN users u ON u.id = r.user_id
    LEFT JOIN customers c ON c.user_id = r.user_id
    HAVING distance_km <= ?
    ORDER BY r.created_at DESC
  `;

  db.query(query, [lat, lng, lat, searchRadius], (err, rows) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json({ reports: rows, center: { latitude: lat, longitude: lng }, radius: searchRadius });
  });
};

exports.latestForOrder = (req, res) => {
  const orderId = req.params.orderId;
  db.query(
    `SELECT l.*, u.full_name AS user_name
     FROM locations l
     LEFT JOIN users u ON u.id = l.user_id
     WHERE l.order_id = ?
     ORDER BY l.created_at DESC
     LIMIT 1`,
    [orderId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json(rows[0] || null);
    }
  );
};
