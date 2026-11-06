function safeString(val, fallback = "") {
  return val != null ? String(val) : fallback;
}

function safeNumber(val, fallback = 0) {
  const num = Number(val);
  return isNaN(num) ? fallback : num;
}

function safeQuery(db, query, params = [], callback) {
  if (typeof params === 'function') {
    callback = params;
    params = [];
  }

  if (!db || typeof db.query !== 'function') {
    const err = new Error('Invalid database connection');
    if (typeof callback === 'function') {
      return callback(err);
    }
    return Promise.reject(err);
  }

  if (typeof callback === 'function') {
    return db.query(query, params, callback);
  }

  return new Promise((resolve, reject) => {
    db.query(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function safeJsonParse(val, fallback = null) {
  if (val == null || val === "") return fallback;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function validateRequiredFields(obj, requiredFields) {
  const missing = requiredFields.filter(field => !obj[field]);
  return missing.length === 0 ? null : `Missing required fields: ${missing.join(", ")}`;
}

module.exports = {
  safeString,
  safeNumber,
  safeQuery,
  safeJsonParse,
  validateRequiredFields
};