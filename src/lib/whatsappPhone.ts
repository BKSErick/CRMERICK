export function normalizeWhatsappPhone(value?: string | null) {
  const hasExplicitCountryCode = value?.trim().startsWith("+") ?? false;
  let digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return "";

  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  }
  if (!hasExplicitCountryCode && !digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }
  return digits;
}

export function phoneMatchVariants(value?: string | null) {
  const canonical = normalizeWhatsappPhone(value);
  if (!canonical) return [];
  if (!canonical.startsWith("55")) return [canonical];

  const national = canonical.slice(2);
  const ddd = national.slice(0, 2);
  const subscriber = national.slice(2);
  const variants = [canonical];

  if (subscriber.length === 8 && /^[6-9]/.test(subscriber)) {
    variants.push(`55${ddd}9${subscriber}`);
  } else if (subscriber.length === 9 && subscriber.startsWith("9") && /^[6-9]/.test(subscriber.slice(1))) {
    variants.push(`55${ddd}${subscriber.slice(1)}`);
  }

  return [...new Set(variants)];
}
