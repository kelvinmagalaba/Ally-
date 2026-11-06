function createRateLimiter({ windowMs, max, key = (req) => req.ip }) {
  const buckets = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [bucketKey, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(bucketKey);
    }
  }, Math.max(30_000, windowMs));
  timer.unref();

  return (req, res, next) => {
    const now = Date.now();
    const bucketKey = String(key(req) || req.ip || "unknown");
    let value = buckets.get(bucketKey);
    if (!value || value.resetAt <= now) {
      value = { count: 0, resetAt: now + windowMs };
      buckets.set(bucketKey, value);
    }
    value.count += 1;
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - value.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(value.resetAt / 1000)));
    if (value.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((value.resetAt - now) / 1000)));
      return res.status(429).json({ message: "Too many attempts. Please wait and try again." });
    }
    next();
  };
}

module.exports = { createRateLimiter };
