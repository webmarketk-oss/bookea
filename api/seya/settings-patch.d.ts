export function normalizeTreatmentName(value?: string | null): string;
export function mergeTreatmentBriefLists<T extends { name?: string }>(
  remote: T[] | null | undefined,
  incoming: T[] | null | undefined,
  removedNames?: string[],
): T[];
export function applySettingsPatch<T extends Record<string, unknown>>(
  base: T,
  settings: T,
  changedKeys?: string[],
): T;
