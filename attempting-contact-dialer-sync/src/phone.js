export function hasValidPhone(phone) {
  if (!phone || typeof phone !== "string") {
    return false;
  }

  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}
