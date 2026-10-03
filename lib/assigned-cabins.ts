const allPattern = /^toutes?$/i;
const numberedCabin = /^(?:cabine[\s-]*)?(\d+)$/i;

export function resolveAssignedCabinNames(
  value: string,
  cabinNames: string[],
) {
  const names = cabinNames.map((name) => name.trim()).filter(Boolean);
  const selected = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && !allPattern.test(item));

  if (selected.length === 0) {
    return "Toutes";
  }

  const resolved = selected.map((item) => {
    const exact = names.find(
      (name) => name.toLowerCase() === item.toLowerCase(),
    );
    if (exact) {
      return exact;
    }

    const numbered = numberedCabin.exec(item);
    if (numbered) {
      return names[Number(numbered[1]) - 1] || item;
    }

    return item;
  });

  const unique = [...new Set(resolved)];
  if (names.length > 0 && unique.length >= names.length) {
    return "Toutes";
  }

  return unique.join(", ");
}
