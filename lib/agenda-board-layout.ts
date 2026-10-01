export const CABIN_COLUMN_MIN_PX = 260;

export function cabinColumnWidth(availableWidth: number, cabinCount: number) {
  const available = Math.max(1, Math.floor(availableWidth));
  const count = Math.max(1, cabinCount);
  if (count === 1) {
    return available;
  }
  const even = Math.floor(available / count);
  return even >= CABIN_COLUMN_MIN_PX ? even : CABIN_COLUMN_MIN_PX;
}
