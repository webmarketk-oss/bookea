export function asRecord(value: unknown): Record<string, unknown>;
export function cloneJson<T>(value: T): T;
export function stableStringify(value: unknown): string;
export function mutateCenterSettings(
  supabase: unknown,
  centerId: string,
  mutate: (
    draft: Record<string, unknown>,
    current: Record<string, unknown>,
  ) => Record<string, unknown>,
  options?: { attempts?: number },
): Promise<{
  settings: Record<string, unknown>;
  changed: boolean;
  attempts: number;
  cas: boolean;
}>;
export function patchCenterSeya(
  supabase: unknown,
  centerId: string,
  patchSeya: (
    seya: Record<string, unknown>,
    settings: Record<string, unknown>,
  ) => Record<string, unknown>,
  options?: { attempts?: number },
): Promise<{
  settings: Record<string, unknown>;
  changed: boolean;
  attempts: number;
  cas: boolean;
}>;
