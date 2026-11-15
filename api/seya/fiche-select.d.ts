export const SEYA_FICHE_KEYS: string[];
export const SEYA_FICHE_SELECT: string;
export function ficheFromRow(
  row: unknown,
): Record<string, unknown> | null;
export function loadSeyaFicheColumns(
  supabase: unknown,
  centerId: string,
): Promise<Record<string, unknown> | null>;
