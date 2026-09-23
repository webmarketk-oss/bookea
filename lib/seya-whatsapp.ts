export function last9Phone(value: string) {
  return String(value || "").replace(/\D/g, "").slice(-9);
}

export function toIntlPhone(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `33${digits.slice(1)}`;
  }
  return digits;
}

export function sharedWhatsAppNumber() {
  return (
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
    process.env.WHATSAPP_DISPLAY_NUMBER ||
    ""
  ).trim();
}

export function formatSharedWhatsAppNumber(value = sharedWhatsAppNumber()) {
  const digits = toIntlPhone(value);
  if (digits.startsWith("33") && digits.length === 11) {
    return `+33 ${digits.slice(2, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  }
  return value || "Numéro Bookea unique";
}
