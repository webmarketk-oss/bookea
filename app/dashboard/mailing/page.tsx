"use client";

import {
  ArrowLeft,
  CheckCircle2,
  ImagePlus,
  Mail,
  Save,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { leadStatuses } from "@/lib/lead-statuses";
import {
  builtinMailingTemplates,
  loadMailingWorkspace,
  persistMailingWorkspace,
  type MailContact,
  type MailingCampaign,
  type MailingTemplate,
} from "@/lib/mailing-settings";
import { loadMailingProvider, sendBookeaMailing } from "@/lib/send-mailing";
import type { CrmClientStatus } from "@/lib/crm-supabase";

type ContactKindFilter = "tous" | "lead" | "client";

const clientStatuses: CrmClientStatus[] = [
  "Actif",
  "Cure en cours",
  "À relancer",
  "Inactif",
];

const statusStyles: Record<MailingCampaign["status"], string> = {
  Envoyée: "bg-emerald-50 text-emerald-700",
  Brouillon: "bg-slate-100 text-slate-600",
};

export default function MailingPage() {
  const [centerId, setCenterId] = useState("");
  const [contacts, setContacts] = useState<MailContact[]>([]);
  const [templates, setTemplates] = useState<MailingTemplate[]>(
    builtinMailingTemplates,
  );
  const [campaigns, setCampaigns] = useState<MailingCampaign[]>([]);
  const [name, setName] = useState("Campagne fidélité");
  const [subject, setSubject] = useState("Votre prochaine visite");
  const [message, setMessage] = useState(
    "Bonjour {{prenom}},\n\nVotre centre vous propose un créneau pour votre prochain soin.\n\nÀ bientôt,",
  );
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [kindFilter, setKindFilter] = useState<ContactKindFilter>("tous");
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState("");
  const [openedExample, setOpenedExample] = useState<MailingTemplate | null>(
    null,
  );
  const [sending, setSending] = useState(false);
  const [providerReady, setProviderReady] = useState(false);
  const [senderEmail, setSenderEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    setIsLoadingContacts(true);

    void (async () => {
      try {
        const loaded = await loadMailingWorkspace();

        if (cancelled) {
          return;
        }

        setCenterId(loaded.centerId);
        setTemplates(loaded.templates);
        setCampaigns(loaded.campaigns);
        setContacts(loaded.contacts);

        const provider = await loadMailingProvider(loaded.centerId);
        if (!cancelled) {
          setProviderReady(provider.configured);
          setSenderEmail(provider.senderEmail);
        }
      } catch {
        if (!cancelled) {
          setContacts([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingContacts(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const availableStatuses = useMemo(() => {
    const present = new Set(
      contacts
        .filter((contact) => kindFilter === "tous" || contact.kind === kindFilter)
        .map((contact) => contact.status),
    );
    const catalog: string[] =
      kindFilter === "lead"
        ? [...leadStatuses]
        : kindFilter === "client"
          ? [...clientStatuses]
          : [...leadStatuses, ...clientStatuses];

    return [
      ...catalog.filter((status) => present.has(status)),
      ...Array.from(present).filter((status) => !catalog.includes(status)),
    ];
  }, [contacts, kindFilter]);

  const visibleContacts = useMemo(() => {
    const query = normalize(contactSearch);

    return contacts.filter((contact) => {
      const matchesKind = kindFilter === "tous" || contact.kind === kindFilter;
      const matchesStatus =
        statusFilters.length === 0 || statusFilters.includes(contact.status);
      const matchesSearch =
        query.length === 0 ||
        normalize(`${contact.firstName} ${contact.lastName}`).includes(query) ||
        normalize(contact.email).includes(query) ||
        normalize(contact.status).includes(query);

      return matchesKind && matchesStatus && matchesSearch;
    });
  }, [contactSearch, contacts, kindFilter, statusFilters]);

  const selectedContacts = useMemo(
    () =>
      contacts.filter(
        (contact) => selectedIds.includes(contact.id) && Boolean(contact.email),
      ),
    [contacts, selectedIds],
  );

  function persistTemplates(nextTemplates: MailingTemplate[]) {
    setTemplates(nextTemplates);
    if (centerId) {
      void persistMailingWorkspace(centerId, { templates: nextTemplates });
    }
  }

  function persistCampaigns(nextCampaigns: MailingCampaign[]) {
    setCampaigns(nextCampaigns);
    if (centerId) {
      void persistMailingWorkspace(centerId, { campaigns: nextCampaigns });
    }
  }

  function applyTemplate(template: MailingTemplate) {
    setActiveTemplateId(template.id);
    setName(template.name);
    setSubject(template.subject);
    setMessage(template.message);
    setImageDataUrl(template.imageDataUrl ?? "");
    setTemplateName(template.builtin ? "" : template.name);
    setNotice(`Exemple « ${template.name} » chargé.`);
    setIsError(false);
  }

  function openExample(template: MailingTemplate) {
    applyTemplate(template);
    setKind("tous");
    setStatusFilters([]);
    setContactSearch("");
    setOpenedExample(template);
  }

  function saveCurrentAsTemplate() {
    const nextName = templateName.trim() || name.trim() || "Exemple mailing";

    if (!subject.trim() || !message.trim()) {
      setIsError(true);
      setNotice("Ajoutez un objet et un message avant d’enregistrer l’exemple.");
      return;
    }

    const existing = templates.find(
      (template) => !template.builtin && template.name === nextName,
    );
    const nextTemplate: MailingTemplate = {
      id: existing?.id ?? crypto.randomUUID(),
      name: nextName,
      subject: subject.trim(),
      message: message.trim(),
      imageDataUrl: imageDataUrl || undefined,
    };

    persistTemplates(
      existing
        ? templates.map((template) =>
            template.id === existing.id ? nextTemplate : template,
          )
        : [nextTemplate, ...templates],
    );
    setTemplateName(nextName);
    setActiveTemplateId(nextTemplate.id);
    setIsError(false);
    setNotice(`Exemple « ${nextName} » enregistré.`);
  }

  function deleteTemplate(templateId: string) {
    persistTemplates(
      templates.filter((template) => template.id !== templateId),
    );
  }

  async function onPickImage(file?: File) {
    if (!file) {
      return;
    }

    try {
      setImageDataUrl(await readImageAsDataUrl(file));
    } catch {
      setIsError(true);
      setNotice("La photo n’a pas pu être ajoutée.");
    }
  }

  function setKind(nextKind: ContactKindFilter) {
    setKindFilter(nextKind);
    setStatusFilters([]);
  }

  function toggleStatus(status: string) {
    setStatusFilters((current) =>
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status],
    );
  }

  function toggleContact(contactId: string) {
    setSelectedIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId],
    );
  }

  function selectVisibleContacts() {
    const ids = visibleContacts
      .filter((contact) => contact.email)
      .map((contact) => contact.id);
    setSelectedIds((current) => Array.from(new Set([...current, ...ids])));
  }

  function clearVisibleContacts() {
    const visibleIds = new Set(visibleContacts.map((contact) => contact.id));
    setSelectedIds((current) => current.filter((id) => !visibleIds.has(id)));
  }

  function selectByKind(kind?: "lead" | "client") {
    if (kind) {
      setKind(kind);
    } else {
      setKind("tous");
    }
    setStatusFilters([]);
    setSelectedIds(
      contacts
        .filter((contact) => contact.email && (!kind || contact.kind === kind))
        .map((contact) => contact.id),
    );
  }

  function clearAllContacts() {
    setSelectedIds([]);
  }

  async function sendCampaign(status: MailingCampaign["status"]) {
    if (selectedContacts.length === 0) {
      setIsError(true);
      setNotice("Sélectionnez au moins un contact avec un email.");
      return;
    }

    if (!subject.trim() || !message.trim()) {
      setIsError(true);
      setNotice("Ajoutez un objet et un message avant d’envoyer.");
      return;
    }

    const audience =
      statusFilters.length > 0
        ? `${kindLabel(kindFilter)} · ${statusFilters.join(", ")}`
        : kindLabel(kindFilter);

    if (status === "Brouillon") {
      const nextCampaign: MailingCampaign = {
        id: crypto.randomUUID(),
        name: name.trim() || subject.trim(),
        subject: subject.trim(),
        audience: `${audience} · ${selectedContacts.length} choisi(s)`,
        sentAt: formatCampaignDate(),
        recipients: selectedContacts.length,
        status,
      };
      persistCampaigns([nextCampaign, ...campaigns]);
      setIsError(false);
      setNotice(`Brouillon enregistré pour ${selectedContacts.length} contact(s).`);
      return;
    }

    setSending(true);
    setIsError(false);
    setNotice("Envoi du mailing via Brevo…");

    try {
      const result = await sendBookeaMailing({
        centerId,
        subject: subject.trim(),
        message: message.trim(),
        imageDataUrl,
        recipients: selectedContacts,
      });

      if (!result.ok) {
        throw new Error(result.error || "Impossible d’envoyer le mailing.");
      }

      const nextCampaign: MailingCampaign = {
        id: crypto.randomUUID(),
        name: name.trim() || subject.trim(),
        subject: subject.trim(),
        audience: `${audience} · ${result.sent} envoyé(s)`,
        sentAt: formatCampaignDate(),
        recipients: result.sent,
        status: "Envoyée",
      };
      persistCampaigns([nextCampaign, ...campaigns]);
      setNotice(
        result.failed
          ? `${result.sent} email(s) envoyés, ${result.failed} échec(s).`
          : `${result.sent} email(s) envoyés via Brevo.`,
      );
    } catch (error) {
      setIsError(true);
      setNotice(
        error instanceof Error ? error.message : "Impossible d’envoyer le mailing.",
      );
    } finally {
      setSending(false);
    }
  }

  const previewName =
    selectedContacts[0]?.firstName ||
    visibleContacts[0]?.firstName ||
    "Marie";

  return (
    <main className="min-h-screen bg-slate-100 px-6 py-6 text-slate-950">
      <section className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-600">Bookea CRM</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Mailing</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Ajoutez une photo, enregistrez un exemple, puis cliquez dessus pour
            l’ouvrir et choisir les leads ou les clients.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {providerReady
              ? `Envoi réel via Brevo${senderEmail ? ` · ${senderEmail}` : ""}.`
              : "Brevo n’est pas encore prêt : ajoutez BREVO_API_KEY et BREVO_EMAIL_SENDER."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={sending}
            onClick={() => void sendCampaign("Brouillon")}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            Brouillon
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => void sendCampaign("Envoyée")}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {sending ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <StatCard
          title="Contacts sélectionnés"
          value={selectedContacts.length}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="Exemples enregistrés"
          value={templates.filter((template) => !template.builtin).length}
          icon={<Save className="h-5 w-5" />}
        />
        <StatCard
          title="Campagnes envoyées"
          value={campaigns.filter((campaign) => campaign.status === "Envoyée").length}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
      </section>

      {notice ? (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm font-medium ${
            isError
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {notice}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-600">
              <Mail className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold">Composer</h2>
              <p className="text-sm text-slate-500">
                Variables : {"{{prenom}}"} {"{{nom}}"}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nom interne" value={name} onChange={setName} />
            <Field
              label="Nom de l’exemple"
              value={templateName}
              onChange={setTemplateName}
              placeholder="Fidélité septembre…"
            />
            <div className="md:col-span-2">
              <Field label="Objet" value={subject} onChange={setSubject} />
            </div>
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-xs font-medium text-slate-500">Message</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={8}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-blue-500"
              />
            </label>
            <div className="md:col-span-2">
              <p className="mb-1.5 text-xs font-medium text-slate-500">Photo</p>
              {imageDataUrl ? (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <img
                    src={imageDataUrl}
                    alt="Visuel du mailing"
                    className="h-40 w-full object-cover"
                  />
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <label className="cursor-pointer text-sm font-medium text-slate-600">
                      Remplacer
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(event) =>
                          void onPickImage(event.target.files?.[0])
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setImageDataUrl("")}
                      className="inline-flex items-center gap-1 text-sm font-medium text-slate-500"
                    >
                      <X className="h-3.5 w-3.5" />
                      Retirer
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-sm font-medium text-slate-500 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700">
                  <ImagePlus className="h-4 w-4" />
                  Ajouter une photo
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => void onPickImage(event.target.files?.[0])}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveCurrentAsTemplate}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700"
            >
              <Save className="h-4 w-4" />
              Enregistrer en exemple
            </button>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">Aperçu</h2>
            <p className="mt-1 text-sm text-slate-500">
              Tel que vu par {previewName}.
            </p>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {imageDataUrl ? (
                <img
                  src={imageDataUrl}
                  alt=""
                  className="h-36 w-full object-cover"
                />
              ) : null}
              <div className="p-4">
                <p className="text-xs font-medium text-slate-400">
                  {selectedContacts.length} destinataire
                  {selectedContacts.length > 1 ? "s" : ""}
                </p>
                <h3 className="mt-2 text-sm font-semibold">{subject}</h3>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {fillPreview(message, previewName)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">Exemples</h2>
            <p className="mt-1 text-sm text-slate-500">
              Cliquez pour ouvrir l’exemple et choisir les destinataires.
            </p>
            <div className="mt-4 grid gap-2">
              {templates.map((template) => (
                <ExampleCard
                  key={template.id}
                  active={activeTemplateId === template.id}
                  template={template}
                  onApply={openExample}
                  onDelete={deleteTemplate}
                />
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">Destinataires</h2>
            <p className="mt-1 text-sm text-slate-500">
              Leads et clients, au choix ou par statut. {selectedContacts.length}{" "}
              sélectionné{selectedContacts.length > 1 ? "s" : ""}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterChip
              active={kindFilter === "tous"}
              onClick={() => setKind("tous")}
            >
              Tous
            </FilterChip>
            <FilterChip
              active={kindFilter === "lead"}
              onClick={() => setKind("lead")}
            >
              Leads
            </FilterChip>
            <FilterChip
              active={kindFilter === "client"}
              onClick={() => setKind("client")}
            >
              Clients
            </FilterChip>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={contactSearch}
              onChange={(event) => setContactSearch(event.target.value)}
              placeholder="Rechercher un nom, un email, un statut…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={() => selectByKind()}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700"
          >
            Tous leads + clients
          </button>
          <button
            type="button"
            onClick={() => selectByKind("lead")}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700"
          >
            Tous les leads
          </button>
          <button
            type="button"
            onClick={() => selectByKind("client")}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700"
          >
            Tous les clients
          </button>
          <button
            type="button"
            onClick={selectVisibleContacts}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700"
          >
            Les filtrés
          </button>
          <button
            type="button"
            onClick={clearVisibleContacts}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-500"
          >
            Retirer les filtrés
          </button>
          <button
            type="button"
            onClick={clearAllContacts}
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-500"
          >
            Tout retirer
          </button>
        </div>

        {availableStatuses.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {availableStatuses.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatus(status)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  statusFilters.includes(status)
                    ? "bg-slate-950 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-4 max-h-80 overflow-y-auto rounded-xl border border-slate-200">
          {isLoadingContacts ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Chargement des leads et clients…
            </p>
          ) : visibleContacts.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              {contacts.length === 0
                ? "Aucun lead ou client à afficher pour ce centre."
                : "Aucun contact pour ce filtre."}
            </p>
          ) : (
            visibleContacts.map((contact) => {
              const checked = selectedIds.includes(contact.id);
              const noEmail = !contact.email;

              return (
                <label
                  key={contact.id}
                  className={`flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0 ${
                    noEmail ? "opacity-50" : "hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={noEmail}
                    onChange={() => toggleContact(contact.id)}
                    className="h-4 w-4"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {contact.firstName} {contact.lastName}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {contact.email || "Pas d’email"} · {contact.status}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    {contact.kind === "lead" ? "Lead" : "Client"}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </section>

      {openedExample ? (
        <ExampleSendPage
          contacts={visibleContacts}
          imageDataUrl={imageDataUrl}
          isLoadingContacts={isLoadingContacts}
          kindFilter={kindFilter}
          loading={sending}
          message={message}
          notice={notice}
          noticeError={isError}
          previewName={previewName}
          selectedCount={selectedContacts.length}
          selectedIds={selectedIds}
          statuses={availableStatuses}
          statusFilters={statusFilters}
          subject={subject}
          template={openedExample}
          totalClients={contacts.filter((contact) => contact.kind === "client" && contact.email).length}
          totalLeads={contacts.filter((contact) => contact.kind === "lead" && contact.email).length}
          onClearAll={clearAllContacts}
          onClearVisible={clearVisibleContacts}
          onClose={() => setOpenedExample(null)}
          onSearch={setContactSearch}
          onSelectAll={() => selectByKind()}
          onSelectClients={() => selectByKind("client")}
          onSelectLeads={() => selectByKind("lead")}
          onSelectVisible={selectVisibleContacts}
          onSend={() => void sendCampaign("Envoyée")}
          onSetKind={setKind}
          onToggleContact={toggleContact}
          onToggleStatus={toggleStatus}
          search={contactSearch}
        />
      ) : null}

      {campaigns.length > 0 ? (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">Historique</h2>
          <div className="mt-4 grid gap-2">
            {campaigns.map((campaign) => (
              <article
                key={campaign.id}
                className="grid gap-2 rounded-xl border border-slate-200 px-4 py-3 md:grid-cols-[1fr_1fr_auto_auto]"
              >
                <div>
                  <p className="text-sm font-medium">{campaign.name}</p>
                  <p className="text-xs text-slate-500">{campaign.subject}</p>
                </div>
                <p className="self-center text-sm text-slate-600">
                  {campaign.audience}
                </p>
                <p className="self-center text-sm text-slate-600">
                  {campaign.recipients} contacts
                </p>
                <span
                  className={`self-center rounded-full px-2.5 py-1 text-center text-xs font-medium ${statusStyles[campaign.status]}`}
                >
                  {campaign.status}
                </span>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ExampleSendPage({
  contacts,
  imageDataUrl,
  isLoadingContacts,
  kindFilter,
  loading,
  message,
  notice,
  noticeError,
  onClearAll,
  onClearVisible,
  onClose,
  onSearch,
  onSelectAll,
  onSelectClients,
  onSelectLeads,
  onSelectVisible,
  onSend,
  onSetKind,
  onToggleContact,
  onToggleStatus,
  previewName,
  search,
  selectedCount,
  selectedIds,
  statuses,
  statusFilters,
  subject,
  template,
  totalClients,
  totalLeads,
}: {
  contacts: MailContact[];
  imageDataUrl: string;
  isLoadingContacts: boolean;
  kindFilter: ContactKindFilter;
  loading: boolean;
  message: string;
  notice: string;
  noticeError: boolean;
  onClearAll: () => void;
  onClearVisible: () => void;
  onClose: () => void;
  onSearch: (value: string) => void;
  onSelectAll: () => void;
  onSelectClients: () => void;
  onSelectLeads: () => void;
  onSelectVisible: () => void;
  onSend: () => void;
  onSetKind: (kind: ContactKindFilter) => void;
  onToggleContact: (id: string) => void;
  onToggleStatus: (status: string) => void;
  previewName: string;
  search: string;
  selectedCount: number;
  selectedIds: string[];
  statuses: string[];
  statusFilters: string[];
  subject: string;
  template: MailingTemplate;
  totalClients: number;
  totalLeads: number;
}) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-100">
      <div className="mx-auto min-h-screen max-w-6xl px-4 py-5 sm:px-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </button>
          <div className="flex flex-wrap gap-2">
            <p className="self-center text-sm font-medium text-slate-500">
              {selectedCount} destinataire{selectedCount > 1 ? "s" : ""}
            </p>
            <button
              type="button"
              disabled={loading}
              onClick={onSend}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {loading ? "Envoi…" : "Envoyer"}
            </button>
          </div>
        </div>

        {notice ? (
          <div
            className={`mb-5 rounded-xl border px-4 py-3 text-sm font-medium ${
              noticeError
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {notice}
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-violet-600">
                Exemple
              </p>
              <h2 className="mt-1 text-xl font-semibold">{template.name}</h2>
              <p className="mt-1 text-sm text-slate-500">
                Aperçu tel que vu par {previewName}.
              </p>
            </div>
            {imageDataUrl ? (
              <img
                src={imageDataUrl}
                alt=""
                className="h-56 w-full object-cover"
              />
            ) : (
              <div className="grid h-32 place-items-center bg-slate-50 text-sm text-slate-400">
                Aucune photo sur cet exemple
              </div>
            )}
            <div className="p-5">
              <p className="text-xs font-medium text-slate-400">Objet</p>
              <h3 className="mt-1 text-base font-semibold">{subject}</h3>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">
                {fillPreview(message, previewName)}
              </p>
            </div>
          </article>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">Destinataires</h2>
            <p className="mt-1 text-sm text-slate-500">
              Choisissez certains leads, certains clients, tout le fichier, ou
              tout puis retirez-en quelques-uns. {totalLeads} leads · {totalClients}{" "}
              clients avec email.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <FilterChip active={kindFilter === "tous"} onClick={() => onSetKind("tous")}>
                Tous
              </FilterChip>
              <FilterChip active={kindFilter === "lead"} onClick={() => onSetKind("lead")}>
                Leads
              </FilterChip>
              <FilterChip active={kindFilter === "client"} onClick={() => onSetKind("client")}>
                Clients
              </FilterChip>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onSelectAll}
                className="h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700"
              >
                Tout le fichier
              </button>
              <button
                type="button"
                onClick={onSelectLeads}
                className="h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700"
              >
                Tous les leads
              </button>
              <button
                type="button"
                onClick={onSelectClients}
                className="h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700"
              >
                Tous les clients
              </button>
              <button
                type="button"
                onClick={onSelectVisible}
                className="h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700"
              >
                Les filtrés
              </button>
              <button
                type="button"
                onClick={onClearVisible}
                className="h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-500"
              >
                Retirer les filtrés
              </button>
              <button
                type="button"
                onClick={onClearAll}
                className="h-9 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-500"
              >
                Tout retirer
              </button>
            </div>

            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Rechercher un nom, un email, un statut…"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-500"
              />
            </div>

            {statuses.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {statuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => onToggleStatus(status)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      statusFilters.includes(status)
                        ? "bg-slate-950 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-4 max-h-[28rem] overflow-y-auto rounded-xl border border-slate-200">
              {isLoadingContacts ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  Chargement des leads et clients…
                </p>
              ) : contacts.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  Aucun contact pour ce filtre.
                </p>
              ) : (
                contacts.map((contact) => {
                  const checked = selectedIds.includes(contact.id);
                  const noEmail = !contact.email;

                  return (
                    <label
                      key={contact.id}
                      className={`flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0 ${
                        noEmail ? "opacity-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={noEmail}
                        onChange={() => onToggleContact(contact.id)}
                        className="h-4 w-4"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {contact.firstName} {contact.lastName}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {contact.email || "Pas d’email"} · {contact.status}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {contact.kind === "lead" ? "Lead" : "Client"}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ExampleCard({
  active,
  onApply,
  onDelete,
  template,
}: {
  active: boolean;
  onApply: (template: MailingTemplate) => void;
  onDelete: (templateId: string) => void;
  template: MailingTemplate;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 ${
        active
          ? "border-violet-300 bg-violet-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <button
        type="button"
        onClick={() => onApply(template)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {template.imageDataUrl ? (
          <img
            src={template.imageDataUrl}
            alt=""
            className="h-11 w-11 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400">
            <Mail className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{template.name}</span>
          <span className="block truncate text-xs text-slate-500">
            {template.subject}
          </span>
        </span>
      </button>
      {template.builtin ? (
        <span className="shrink-0 pt-0.5 text-[11px] font-medium text-slate-400">
          Exemple
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onDelete(template.id)}
          className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
          aria-label={`Supprimer ${template.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500"
      />
    </label>
  );
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-xl px-3 text-sm font-medium ${
        active
          ? "bg-slate-950 text-white"
          : "border border-slate-200 bg-white text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({
  icon,
  title,
  value,
}: {
  icon: ReactNode;
  title: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-slate-500">
          {icon}
        </div>
      </div>
    </div>
  );
}

function formatCampaignDate() {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function kindLabel(kind: ContactKindFilter) {
  if (kind === "lead") return "Leads";
  if (kind === "client") return "Clients";
  return "Leads et clients";
}

function fillPreview(message: string, firstName: string) {
  return message
    .replaceAll("{{prenom}}", firstName)
    .replaceAll("{{nom}}", firstName);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function readImageAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      const maxWidth = 1200;
      const scale = Math.min(1, maxWidth / image.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");

      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("canvas"));
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image"));
    };

    image.src = objectUrl;
  });
}
