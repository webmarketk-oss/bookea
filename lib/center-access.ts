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

type CenterRelation =
  | {
      id: string | null;
      name: string | null;
      slug: string | null;
      city: string | null;
    }
  | Array<{
      id: string | null;
      name: string | null;
      slug: string | null;
      city: string | null;
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
};

export async function loadAccessibleCenters(
  supabase: SupabaseClient = createClient(),
): Promise<AccessibleCenter[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!user) {
    return [];
  }

  const isAdmin = await getIsBookeaAdmin(supabase, user.id);

  if (isAdmin) {
    const { data, error } = await supabase
      .from("centers")
      .select("id,name,slug,city")
      .order("name", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return ((data ?? []) as CenterRow[]).map(toAccessibleCenter);
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

    if (center?.id) {
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
  const centers = await loadAccessibleCenters(supabase);
  const savedCenterId = readActiveCenterId();
  const activeCenter =
    centers.find((center) => center.id === savedCenterId) ?? centers[0];

  if (activeCenter) {
    saveActiveCenterId(activeCenter.id);

    return {
      centerId: activeCenter.id,
      centerName: activeCenter.name,
      centerSlug: activeCenter.slug,
    };
  }

  const slug = process.env.NEXT_PUBLIC_DEFAULT_CENTER_SLUG ?? "jfg-clinique-clermont";
  const { data: center, error } = await supabase
    .from("centers")
    .select("id,name,slug")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!center?.id) {
    throw new Error("Aucun centre accessible pour ce compte.");
  }

  return {
    centerId: center.id as string,
    centerName: (center.name as string | null) ?? "Centre Bookea",
    centerSlug: (center.slug as string | null) ?? slug,
  };
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

  window.localStorage.setItem(ACTIVE_CENTER_STORAGE_KEY, centerId);
  window.dispatchEvent(new CustomEvent("bookea-active-center-changed"));
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
