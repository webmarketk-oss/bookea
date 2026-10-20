import { createClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createClient>;

export type AccessibleCenter = {
  id: string;
  name: string;
  slug: string;
  city: string;
  role?: string;
};

export type ActiveCenterContext = {
  centerId: string;
  centerName: string;
  centerSlug: string;
};

export const ACTIVE_CENTER_STORAGE_KEY = "bookea-active-center-id";

const CENTERS_CACHE_MS = 60000;
const CENTERS_LOAD_TIMEOUT_MS = 8000;

let cachedCenters: { at: number; value: AccessibleCenter[] } | null = null;
let centersInFlight: Promise<AccessibleCenter[]> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type CenterRelation =
  | {
      id: string | null;
      name: string | null;
      slug: string | null;
      city: string | null;
      settings?: CenterRow["settings"];
    }
  | Array<{
      id: string | null;
      name: string | null;
      slug: string | null;
      city: string | null;
      settings?: CenterRow["settings"];
    }>
  | null;

type CenterMemberRow = {
  center_id: string;
  role: string | null;
  centers: CenterRelation;
};

type CenterRow = {
  id: string;
  name: string | null;
  slug: string | null;
  city: string | null;
  settings?: {
    admin?: {
      isActive?: boolean;
    };
  } | null;
};

export async function loadAccessibleCenters(
  supabase: SupabaseClient = createClient(),
): Promise<AccessibleCenter[]> {
  if (cachedCenters && Date.now() - cachedCenters.at < CENTERS_CACHE_MS) {
    return cachedCenters.value;
  }
  if (!centersInFlight) {
    centersInFlight = fetchAccessibleCenters(supabase)
      .then((value) => {
        cachedCenters = value.length ? { at: Date.now(), value } : null;
        return value;
      })
      .finally(() => {
        centersInFlight = null;
      });
  }
  return withTimeout(
    centersInFlight,
    CENTERS_LOAD_TIMEOUT_MS,
    "timeout loading centers",
  );
}

// Session lue dans le navigateur : getUser() interrogeait le service de connexion Supabase à chaque
// rafraîchissement de chaque onglet. Les droits restent vérifiés par la base (RLS) sur chaque requête.
async function sessionUserId(supabase: SupabaseClient) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  return session?.user?.id ?? null;
}

async function fetchAccessibleCenters(
  supabase: SupabaseClient,
): Promise<AccessibleCenter[]> {
  const userId = await sessionUserId(supabase);

  // Sans session (expirée ou fermée) : c'est une reconnexion qu'il faut, pas « aucun centre ».
  if (!userId) {
    throw new Error("Auth session missing");
  }

  const user = { id: userId };

  const isAdmin = await getIsBookeaAdmin(supabase, user.id);

  if (isAdmin) {
    const { data, error } = await supabase
      .from("centers")
      .select("id,name,slug,city")
      .order("name", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return ((data ?? []) as CenterRow[])
      .filter(isCenterActiveRow)
      .map(toAccessibleCenter);
  }

  const { data, error } = await supabase
    .from("center_members")
    .select("center_id,role,centers(id,name,slug,city)")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const accessibleCenters: AccessibleCenter[] = [];

  for (const row of (data ?? []) as unknown as CenterMemberRow[]) {
    const center = relationObject(row.centers);

    if (center?.id && isCenterActiveRow(center)) {
      accessibleCenters.push({
        id: center.id,
        name: center.name ?? "Centre Bookea",
        slug: center.slug ?? "",
        city: center.city ?? "",
        role: row.role ?? undefined,
      });
    }
  }

  return accessibleCenters;
}

export async function getActiveCenterContext(
  supabase: SupabaseClient = createClient(),
): Promise<ActiveCenterContext> {
  let centers: AccessibleCenter[] = [];
  try {
    centers = await loadAccessibleCenters(supabase);
  } catch {
    centers = [];
  }
  const savedCenterId = readActiveCenterId();
  const activeCenter =
    centers.find((center) => center.id === savedCenterId) ?? centers[0];

  if (activeCenter) {
    if (savedCenterId !== activeCenter.id && typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_CENTER_STORAGE_KEY, activeCenter.id);
    }

    return {
      centerId: activeCenter.id,
      centerName: activeCenter.name,
      centerSlug: activeCenter.slug,
    };
  }

  if (savedCenterId) {
    return {
      centerId: savedCenterId,
      centerName: "le centre",
      centerSlug: "",
    };
  }

  throw new Error(
    "Aucun centre accessible pour ce compte. Reconnecte-toi : on n’ouvre plus un autre centre par défaut.",
  );
}

export function readActiveCenterId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACTIVE_CENTER_STORAGE_KEY);
}

export function saveActiveCenterId(centerId: string) {
  if (typeof window === "undefined") {
    return;
  }

  cachedCenters = null;
  window.localStorage.setItem(ACTIVE_CENTER_STORAGE_KEY, centerId);
  window.dispatchEvent(new CustomEvent("bookea-active-center-changed"));
}

export async function loadIsBookeaAdmin(
  supabase: SupabaseClient = createClient(),
) {
  const userId = await sessionUserId(supabase).catch(() => null);
  if (!userId) {
    return false;
  }
  return getIsBookeaAdmin(supabase, userId);
}

async function getIsBookeaAdmin(supabase: SupabaseClient, profileId: string) {
  const { data, error } = await supabase
    .from("bookea_admins")
    .select("profile_id")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data?.profile_id);
}

function isCenterActiveRow(center: { settings?: CenterRow["settings"] | unknown }) {
  const settings =
    center.settings && typeof center.settings === "object"
      ? (center.settings as Record<string, unknown>)
      : {};
  const admin =
    settings.admin && typeof settings.admin === "object"
      ? (settings.admin as { isActive?: boolean })
      : {};

  return admin.isActive !== false;
}

function toAccessibleCenter(center: CenterRow): AccessibleCenter {
  return {
    id: center.id,
    name: center.name ?? "Centre Bookea",
    slug: center.slug ?? "",
    city: center.city ?? "",
  };
}

function relationObject<T>(relation: T | T[] | null | undefined) {
  return Array.isArray(relation) ? relation[0] : relation;
}
