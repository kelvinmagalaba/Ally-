function safeUser(user) {
  if (!user) return null;

  // Remove sensitive fields like passwords
  const { password_hash, ...safe } = user;

  return safe;
}

module.exports = {
  safeUser
};