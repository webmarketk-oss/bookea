"use client";

import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRoundPlus,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase";

type CenterRow = {
  id: string;
  name: string | null;
  slug: string | null;
  city: string | null;
  email: string | null;
  public_profile_enabled: boolean | null;
  owner_profile_id: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
};

type CenterMemberRow = {
  center_id: string;
  role: string | null;
  profiles:
    | {
        email: string | null;
        full_name: string | null;
      }
    | Array<{
        email: string | null;
        full_name: string | null;
      }>
    | null;
};

type CenterCardData = CenterRow & {
  members: Array<{
    email: string;
    name: string;
    role: string;
  }>;
};

const defaultSources = [
  { name: "Instagram", slug: "instagram", is_organic: true, display_order: 1 },
  { name: "Google", slug: "google", is_organic: true, display_order: 2 },
  { name: "Bookea", slug: "bookea", is_organic: true, display_order: 3 },
  { name: "Appel entrant", slug: "appel-entrant", is_organic: true, display_order: 4 },
];

export default function AdminCentresPage() {
  const supabase = useMemo(() => createClient(), []);
  const [centers, setCenters] = useState<CenterCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attachingCenterId, setAttachingCenterId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    city: "",
    email: "",
    ownerEmail: "",
  });

  useEffect(() => {
    void loadCenters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCenters() {
    setLoading(true);
    setNotice(null);

    try {
      const { data: centerRows, error: centersError } = await supabase
        .from("centers")
        .select("id,name,slug,city,email,public_profile_enabled,owner_profile_id,created_at")
        .order("created_at", { ascending: false });

      if (centersError) throw new Error(centersError.message);

      const centerIds = ((centerRows ?? []) as CenterRow[]).map((center) => center.id);
      let memberRows: CenterMemberRow[] = [];

      if (centerIds.length > 0) {
        const { data: members, error: membersError } = await supabase
          .from("center_members")
          .select("center_id,role,profiles(email,full_name)")
          .in("center_id", centerIds);

        if (membersError) throw new Error(membersError.message);
        memberRows = (members ?? []) as unknown as CenterMemberRow[];
      }

      setCenters(
        ((centerRows ?? []) as CenterRow[]).map((center) => ({
          ...center,
          members: memberRows
            .filter((member) => member.center_id === center.id)
            .map((member) => {
              const profile = relationObject(member.profiles);
              return {
                email: profile?.email ?? "Compte sans email",
                name: profile?.full_name ?? "Utilisateur Bookea",
                role: member.role ?? "viewer",
              };
            }),
        })),
      );
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Impossible de charger les centres.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCenter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      const name = form.name.trim();
      const slug = slugify(form.slug || form.name);
      const ownerEmail = form.ownerEmail.trim().toLowerCase();
      const owner = ownerEmail ? await findProfileByEmail(ownerEmail) : null;

      if (!name) {
        throw new Error("Le nom du centre est obligatoire.");
      }

      if (!slug) {
        throw new Error("Le slug du centre est obligatoire.");
      }

      const { data: center, error: centerError } = await supabase
        .from("centers")
        .insert({
          name,
          slug,
          city: form.city.trim() || null,
          email: form.email.trim() || null,
          owner_profile_id: owner?.id ?? null,
          country: "France",
          description: "Centre Bookea",
          public_profile_enabled: false,
          theme_color: "#2563eb",
        })
        .select("id")
        .single();

      if (centerError) throw new Error(centerError.message);

      const centerId = center.id as string;

      await Promise.all([
        createDefaultSettings(centerId),
        createDefaultRooms(centerId),
        createDefaultSources(centerId),
      ]);

      if (owner) {
        await attachOwner(centerId, owner);
      }

      setForm({ name: "", slug: "", city: "", email: "", ownerEmail: "" });
      setNotice({
        type: owner ? "success" : "info",
        message: owner
          ? "Centre créé et responsable rattaché."
          : "Centre créé vierge. Le responsable devra créer son compte avant rattachement.",
      });
      await loadCenters();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Le centre n'a pas pu être créé.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleAttachOwner(centerId: string, email: string) {
    setAttachingCenterId(centerId);
    setNotice(null);

    try {
      const ownerEmail = email.trim().toLowerCase();

      if (!ownerEmail) {
        throw new Error("Ajoutez l'email du responsable.");
      }

      const owner = await findProfileByEmail(ownerEmail);

      if (!owner) {
        throw new Error(
          "Aucun compte Bookea trouvé avec cet email. Le responsable doit d'abord créer son compte.",
        );
      }

      await attachOwner(centerId, owner);
      setNotice({
        type: "success",
        message: `Responsable rattaché : ${owner.email ?? ownerEmail}`,
      });
      await loadCenters();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Impossible de rattacher ce responsable.",
      });
    } finally {
      setAttachingCenterId(null);
    }
  }

  async function findProfileByEmail(email: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,full_name,role")
      .ilike("email", email)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data as ProfileRow | null;
  }

  async function attachOwner(centerId: string, profile: ProfileRow) {
    const { error: memberError } = await supabase
      .from("center_members")
      .upsert(
        {
          center_id: centerId,
          profile_id: profile.id,
          role: "owner",
          is_active: true,
        },
        { onConflict: "center_id,profile_id" },
      );

    if (memberError) throw new Error(memberError.message);
  }

  async function createDefaultSettings(centerId: string) {
    const { error } = await supabase.from("center_settings").upsert(
      {
        center_id: centerId,
        invoice_prefix: "FAC",
        default_vat_rate: 20,
        currency: "EUR",
      },
      { onConflict: "center_id" },
    );

    if (error) throw new Error(error.message);
  }

  async function createDefaultRooms(centerId: string) {
    const { error } = await supabase.from("rooms").insert([
      { center_id: centerId, name: "Cabine 1", color: "#6415E8", display_order: 1 },
      { center_id: centerId, name: "Cabine 2", color: "#247AF2", display_order: 2 },
    ]);

    if (error) throw new Error(error.message);
  }

  async function createDefaultSources(centerId: string) {
    const { error } = await supabase.from("lead_sources").insert(
      defaultSources.map((source) => ({
        center_id: centerId,
        ...source,
      })),
    );

    if (error) throw new Error(error.message);
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <div className="mx-auto max-w-[1800px] space-y-8 p-8">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-black text-violet-600">Bookea Admin</p>
            <h1 className="mt-1 text-5xl font-black tracking-tight">
              Admin centres
            </h1>
            <p className="mt-3 max-w-4xl text-xl font-medium text-slate-500">
              Créez un centre vierge, rattachez un responsable et gardez les
              données de chaque établissement séparées.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadCenters()}
            className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <RefreshCw className="h-5 w-5" />
            Actualiser
          </button>
        </header>

        {notice && (
          <div
            className={`flex items-center gap-3 rounded-2xl border p-4 font-bold ${
              notice.type === "success"
                ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                : notice.type === "error"
                  ? "border-rose-100 bg-rose-50 text-rose-700"
                  : "border-blue-100 bg-blue-50 text-blue-700"
            }`}
          >
            {notice.type === "success" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
            {notice.message}
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-[460px_1fr]">
          <form
            onSubmit={handleCreateCenter}
            className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <Plus className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black">Créer un centre</h2>
                <p className="font-medium text-slate-500">
                  Base vierge, prête pour CRM, agenda et factures.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <TextField
                label="Nom du centre"
                value={form.name}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    name: value,
                    slug: current.slug || slugify(value),
                  }))
                }
                placeholder="Clinique exemple Lyon"
                required
              />
              <TextField
                label="Slug"
                value={form.slug}
                onChange={(value) =>
                  setForm((current) => ({ ...current, slug: slugify(value) }))
                }
                placeholder="clinique-exemple-lyon"
                required
              />
              <TextField
                label="Ville"
                value={form.city}
                onChange={(value) => setForm((current) => ({ ...current, city: value }))}
                placeholder="Lyon"
              />
              <TextField
                label="Email public du centre"
                type="email"
                value={form.email}
                onChange={(value) => setForm((current) => ({ ...current, email: value }))}
                placeholder="contact@centre.fr"
              />
              <TextField
                label="Email responsable"
                type="email"
                value={form.ownerEmail}
                onChange={(value) =>
                  setForm((current) => ({ ...current, ownerEmail: value }))
                }
                placeholder="responsable@centre.fr"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
              Créer le centre vierge
            </button>

            <p className="mt-4 text-sm font-semibold text-slate-500">
              Si le responsable n&apos;a pas encore de compte, le centre sera
              créé sans responsable. Il faudra rattacher son email après son
              inscription.
            </p>
          </form>

          <div className="space-y-4">
            {loading ? (
              <div className="grid min-h-80 place-items-center rounded-[2rem] border border-slate-200 bg-white text-slate-500">
                <div className="flex items-center gap-3 font-black">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Chargement des centres...
                </div>
              </div>
            ) : centers.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-10 text-center">
                <Building2 className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-4 text-xl font-black">Aucun centre</p>
                <p className="mt-2 font-medium text-slate-500">
                  Créez le premier centre Bookea.
                </p>
              </div>
            ) : (
              centers.map((center) => (
                <CenterCard
                  key={center.id}
                  center={center}
                  attaching={attachingCenterId === center.id}
                  onAttachOwner={(email) => handleAttachOwner(center.id, email)}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function CenterCard({
  center,
  attaching,
  onAttachOwner,
}: {
  center: CenterCardData;
  attaching: boolean;
  onAttachOwner: (email: string) => void;
}) {
  const [ownerEmail, setOwnerEmail] = useState("");
  const [facebookPageId, setFacebookPageId] = useState("");
  const facebookConnectUrl =
    center.slug && facebookPageId.trim()
      ? `/api/meta/connect?center_slug=${encodeURIComponent(center.slug)}&page_id=${encodeURIComponent(facebookPageId.trim())}`
      : "";

  function submitOwner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAttachOwner(ownerEmail);
  }

  return (
    <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-600">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-2xl font-black">{center.name}</h3>
              <p className="font-mono text-sm font-bold text-slate-400">
                {center.slug}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {center.city && (
              <Badge icon={<MapPin className="h-4 w-4" />}>{center.city}</Badge>
            )}
            {center.email && (
              <Badge icon={<Mail className="h-4 w-4" />}>{center.email}</Badge>
            )}
            <Badge icon={<ShieldCheck className="h-4 w-4" />}>
              {center.public_profile_enabled ? "Profil public actif" : "Profil public masqué"}
            </Badge>
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4 xl:min-w-80">
          <p className="mb-3 text-sm font-black uppercase text-slate-400">
            Accès centre
          </p>
          {center.members.length > 0 ? (
            <div className="space-y-2">
              {center.members.map((member) => (
                <div
                  key={`${member.email}-${member.role}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-black">{member.name}</p>
                    <p className="truncate text-sm font-semibold text-slate-400">
                      {member.email}
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-white p-3 text-slate-500">
              <UserRoundPlus className="h-5 w-5" />
              <p className="font-bold">Aucun responsable rattaché.</p>
            </div>
          )}

          <form onSubmit={submitOwner} className="mt-4 space-y-2">
            <label className="block text-sm font-black text-slate-500">
              Rattacher un responsable
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={ownerEmail}
                onChange={(event) => setOwnerEmail(event.target.value)}
                placeholder="responsable@centre.fr"
                className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 font-bold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
              <button
                type="submit"
                disabled={attaching}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {attaching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserRoundPlus className="h-4 w-4" />
                )}
                Rattacher
              </button>
            </div>
            <p className="text-xs font-semibold text-slate-400">
              Le compte doit déjà avoir été créé sur la page connexion.
            </p>
          </form>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <label className="block text-sm font-black text-slate-500">
              Connecter les leads Facebook
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={facebookPageId}
                onChange={(event) => setFacebookPageId(event.target.value.replace(/\D/g, ""))}
                placeholder="ID de page Meta"
                inputMode="numeric"
                className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 font-bold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
              <a
                href={facebookConnectUrl || undefined}
                aria-disabled={!facebookConnectUrl}
                className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 font-black text-white transition ${
                  facebookConnectUrl
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "pointer-events-none bg-slate-300"
                }`}
              >
                <ExternalLink className="h-4 w-4" />
                Connecter
              </a>
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-400">
              Exemple GAP : collez l&apos;ID de la Page, puis connectez-vous avec
              le compte Meta admin de cette page.
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-black text-slate-700">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 font-bold text-slate-950 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function Badge({
  children,
  icon,
}: {
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-600">
      {icon}
      {children}
    </span>
  );
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function relationObject<T>(relation: T | T[] | null | undefined) {
  return Array.isArray(relation) ? relation[0] : relation;
}
