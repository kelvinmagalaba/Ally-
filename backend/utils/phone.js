function normalizeTanzaniaPhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("255")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+255${digits.slice(1)}`;
  if ((digits.startsWith("6") || digits.startsWith("7")) && digits.length === 9) return `+255${digits}`;
  return raw.startsWith("+") ? `+${digits}` : digits;
}

function isValidTanzaniaPhone(value) {
  return /^\+255[67]\d{8}$/.test(normalizeTanzaniaPhone(value));
}

module.exports = { normalizeTanzaniaPhone, isValidTanzaniaPhone };
