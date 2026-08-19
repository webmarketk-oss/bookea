export const BOOKEA_ROUTES = {
  public: "/",
  clientAccount: "/client/compte",
  proDashboard: "/dashboard",
  admin: "/admin",
} as const;

export const BOOKEA_DEFAULT_CATEGORY_SLUGS = [
  "coiffeur",
  "institut-beaute",
  "beaute-des-ongles",
  "beaute-du-regard",
  "bien-etre",
  "spa",
  "barbier",
  "minceur",
  "soin-du-visage",
] as const;

export type BookeaRuntime = "public" | "pro" | "admin";

export function getSupabaseEnv(env: NodeJS.ProcessEnv = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean) as string[];

  return {
    url,
    anonKey,
    serviceRoleKey,
    ready: missing.length === 0,
    missing,
  };
}

export function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

export function normalizePhone(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  if (digits.startsWith("33")) return `+${digits}`;
  if (digits.startsWith("0")) return `+33${digits.slice(1)}`;
  return `+${digits}`;
}

export function normalizeName(value?: string | null) {
  return (
    value
      ?.trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ") || null
  );
}

export type ClientIdentityInput = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  birthdate?: string | null;
};

export function buildClientIdentityKeys(input: ClientIdentityInput) {
  const identities: Array<{ type: "email" | "phone" | "name_birthdate"; value: string }> = [];
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const firstName = normalizeName(input.firstName);
  const lastName = normalizeName(input.lastName);

  if (email) identities.push({ type: "email", value: email });
  if (phone) identities.push({ type: "phone", value: phone });
  if (firstName && lastName && input.birthdate) {
    identities.push({
      type: "name_birthdate",
      value: `${firstName}:${lastName}:${input.birthdate}`,
    });
  }

  return identities;
}

export function findStrongDuplicateReason(input: ClientIdentityInput) {
  const identities = buildClientIdentityKeys(input);
  return identities.find((identity) => identity.type === "email")?.type
    ?? identities.find((identity) => identity.type === "phone")?.type
    ?? identities.find((identity) => identity.type === "name_birthdate")?.type
    ?? null;
}

export type PublicBookingIntake = ClientIdentityInput & {
  centerId: string;
  serviceId: string;
  appointmentDate: string;
  startsAt: string;
  endsAt: string;
  campaignId?: string | null;
};

export function toOrganicBookingLead(input: PublicBookingIntake) {
  return {
    centerId: input.centerId,
    serviceId: input.serviceId,
    campaignId: input.campaignId ?? null,
    sourceSlug: "organique",
    origin: "public_bookea",
    status: "RDV confirmé",
    nextAction: "Rendez-vous confirme automatiquement depuis Bookea public.",
    appointmentDate: input.appointmentDate,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    identities: buildClientIdentityKeys(input),
  };
}
