"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Euro,
  Eye,
  FileText,
  Gift,
  MessageCircle,
  MoreVertical,
  Phone,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cabins, practitioners } from "@/lib/agenda-data";
import { loadCrmAppointments } from "@/lib/agenda-supabase";
import type { Appointment } from "@/types/agenda";
import {
  getSourceNames,
  publicCenterCategories,
  readCenterSettings,
} from "@/lib/center-settings";
import {
  addCrmClientDocument as persistCrmClientDocument,
  addCrmClientNote,
  createCrmClient,
  loadCrmClients,
  updateCrmClient,
  type CrmClient as Client,
  type CrmClientCare as ClientCare,
  type CrmClientDocument as ClientDocument,
  type CrmClientNote as ClientNote,
  type CrmClientStatus as ClientStatus,
} from "@/lib/crm-supabase";
import { syncBirthdaySms } from "@/lib/send-sms";

const statusStyles: Record<ClientStatus, string> = {
  Actif: "bg-emerald-50 text-emerald-700 border-emerald-100",
  "Cure en cours": "bg-blue-50 text-blue-700 border-blue-100",
  "À relancer": "bg-amber-50 text-amber-700 border-amber-100",
  Inactif: "bg-slate-100 text-slate-600 border-slate-200",
};

const defaultProvenanceOptions = [
  "Organique",
  "Facebook",
  "Instagram",
  "Google",
  "Google Ads",
  "Site web",
  "WhatsApp",
  "Recommandation",
  "Parrainage",
  "Autre",
];

const emptyClientForm: Omit<Client, "id" | "notes" | "cares" | "documents"> = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  birthDate: "",
  gender: "",
  address: "",
  postalCode: "",
  city: "",
  mainCare: "",
  category: "",
  source: "",
  campaign: "",
  status: "Actif",
  commercial: "Samantha",
  nextAppointment: "Aucun RDV",
  lastVisit: new Date().toISOString().slice(0, 10),
  totalSpent: 0,
  balanceDue: 0,
};

const emptyDocumentForm: Omit<ClientDocument, "id"> = {
  label: "",
  date: todayFrenchDate(),
  status: "À envoyer",
  type: "Consentement",
};

export default function CRMClientsPage() {
  const [clientList, setClientList] = useState<Client[]>([]);
  const [appointmentList, setAppointmentList] = useState<Appointment[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"Tous" | ClientStatus>(
    "Tous"
  );
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [clientError, setClientError] = useState("");
  const [provenanceOptions, setProvenanceOptions] = useState(
    defaultProvenanceOptions,
  );
  const [noteDraft, setNoteDraft] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<"private" | "shared">(
    "private"
  );
  const [isClientFormOpen, setIsClientFormOpen] = useState(false);
  const [isFullClientOpen, setIsFullClientOpen] = useState(false);
  const [clientForm, setClientForm] = useState(emptyClientForm);
  const openedFicheFromUrlRef = useRef(false);

  async function refreshClients() {
    setIsLoadingClients(true);
    setClientError("");

    try {
      const { clientId } = getClientFicheParams();
      const [{ clients }, loadedAppointments] = await Promise.all([
        loadCrmClients({ includeClientId: clientId }),
        loadCrmAppointments(),
      ]);

      setClientList(clients);
      setAppointmentList(loadedAppointments);
      setSelectedClientId((currentId) => {
        const fromUrl = findClientFromFicheParams(clients);

        if (fromUrl) {
          return fromUrl.id;
        }

        if (currentId && clients.some((client) => client.id === currentId)) {
          return currentId;
        }

        return clients[0]?.id;
      });
    } catch (error) {
      setClientError(
        error instanceof Error
          ? error.message
          : "Impossible de charger les clients.",
      );
      setClientList([]);
      setAppointmentList([]);
      setSelectedClientId(undefined);
    } finally {
      setIsLoadingClients(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshClients();
  }, []);

  useEffect(() => {
    if (isLoadingClients || openedFicheFromUrlRef.current) {
      return;
    }

    const params = getClientFicheParams();

    if (!params.clientId && !params.phone && !params.query) {
      return;
    }

    const match = findClientFromFicheParams(clientList);

    if (!match) {
      if (params.query) {
        setSearch(params.query);
      }
      return;
    }

    openedFicheFromUrlRef.current = true;
    setSelectedClientId(match.id);
    if (params.openFiche) {
      setIsFullClientOpen(true);
    }
  }, [clientList, isLoadingClients]);

  useEffect(() => {
    function syncSourceSettings() {
      const settingSources = getSourceNames(readCenterSettings());
      setProvenanceOptions(
        Array.from(new Set([...settingSources, ...defaultProvenanceOptions])),
      );
    }

    syncSourceSettings();
    window.addEventListener("bookea-center-settings-updated", syncSourceSettings);
    window.addEventListener("storage", syncSourceSettings);

    return () => {
      window.removeEventListener(
        "bookea-center-settings-updated",
        syncSourceSettings,
      );
      window.removeEventListener("storage", syncSourceSettings);
    };
  }, []);

  const filteredClients = useMemo(() => {
    const query = normalize(search);

    return clientList.filter((client) => {
      const matchesSearch =
        query.length === 0 ||
        normalize(`${client.firstName} ${client.lastName}`).includes(query) ||
        normalize(client.phone).includes(query) ||
        normalize(client.email).includes(query) ||
        normalize(client.mainCare).includes(query) ||
        normalize(client.category).includes(query);
      const matchesStatus =
        statusFilter === "Tous" || client.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [clientList, search, statusFilter]);

  const selectedClient =
    clientList.find((client) => client.id === selectedClientId) ??
    filteredClients[0] ??
    clientList[0];
  const stats = getClientStats(clientList);

  async function addNote() {
    const text = noteDraft.trim();

    if (!text || !selectedClient) {
      return;
    }

    const optimisticNote: ClientNote = {
      id: crypto.randomUUID(),
      author: noteVisibility === "shared" ? "Équipe" : "Samantha",
      date: formatActivityDate(),
      text,
      visibility: noteVisibility,
    };

    setClientList((currentClients) =>
      currentClients.map((client) =>
        client.id === selectedClient.id
          ? {
              ...client,
              notes: [optimisticNote, ...client.notes],
            }
          : client
      )
    );
    setNoteDraft("");

    try {
      await addCrmClientNote(selectedClient, text, noteVisibility);
    } catch (error) {
      setClientError(
        error instanceof Error
          ? error.message
          : "La note n'a pas pu être sauvegardée.",
      );
      await refreshClients();
    }
  }

  function openRdvForClient(client: Client) {
    const params = new URLSearchParams({
      newRdv: "1",
      name: `${client.firstName} ${client.lastName}`,
      phone: client.phone,
      treatment: client.mainCare,
      source: "Client",
    });

    window.open(`/dashboard/agenda?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  function openNewClientForm() {
    setClientForm(emptyClientForm);
    setIsClientFormOpen(true);
  }

  async function addClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const client = await createCrmClient(clientForm);

      if (client.birthDate && client.phone) {
        void syncBirthdaySms({
          clientId: client.id,
          birthDate: client.birthDate,
          phone: client.phone,
          firstName: client.firstName,
          lastName: client.lastName,
        }).catch(() => null);
      }

      setClientList((currentClients) => [client, ...currentClients]);
      setSelectedClientId(client.id);
      setIsClientFormOpen(false);
    } catch (error) {
      setClientError(
        error instanceof Error
          ? error.message
          : "Le client n'a pas pu être créé.",
      );
    }
  }

  async function saveFullClient(updatedClient: Client) {
    try {
      await updateCrmClient(updatedClient);
      if (updatedClient.phone) {
        void syncBirthdaySms({
          clientId: updatedClient.id,
          birthDate: updatedClient.birthDate,
          phone: updatedClient.phone,
          firstName: updatedClient.firstName,
          lastName: updatedClient.lastName,
          enabled: Boolean(
            updatedClient.birthDate && updatedClient.birthDate !== "À compléter",
          ),
        }).catch(() => null);
      }
    } catch (error) {
      setClientError(
        error instanceof Error
          ? error.message
          : "La fiche client n'a pas pu être sauvegardée.",
      );
      return;
    }

    setClientList((currentClients) =>
      currentClients.map((client) =>
        client.id === updatedClient.id ? updatedClient : client
      )
    );
    setSelectedClientId(updatedClient.id);
    setIsFullClientOpen(false);
  }

  async function saveBirthDate(birthDate: string) {
    if (!selectedClient) return;

    const updatedClient = {
      ...selectedClient,
      birthDate: birthDate || "À compléter",
    };

    try {
      await updateCrmClient(updatedClient);
      if (updatedClient.phone) {
        void syncBirthdaySms({
          clientId: updatedClient.id,
          birthDate,
          phone: updatedClient.phone,
          firstName: updatedClient.firstName,
          lastName: updatedClient.lastName,
          enabled: Boolean(birthDate),
        }).catch(() => null);
      }
    } catch (error) {
      setClientError(
        error instanceof Error
          ? error.message
          : "La date d'anniversaire n'a pas pu être sauvegardée.",
      );
      return;
    }

    setClientList((currentClients) =>
      currentClients.map((client) =>
        client.id === updatedClient.id ? updatedClient : client,
      ),
    );
  }

  async function addClientDocument(
    clientId: string,
    document: Omit<ClientDocument, "id">
  ) {
    let newDocument: ClientDocument;

    try {
      newDocument = await persistCrmClientDocument(clientId, document);
    } catch (error) {
      setClientError(
        error instanceof Error
          ? error.message
          : "Le document n'a pas pu être ajouté.",
      );
      return;
    }

    setClientList((currentClients) =>
      currentClients.map((client) =>
        client.id === clientId
          ? {
              ...client,
              documents: [newDocument, ...client.documents],
            }
          : client
      )
    );
  }

  return (
    <main className="min-h-screen bg-slate-100" data-sidebar-collapse-area="true">
      <div className="mx-auto max-w-[1800px] space-y-6 p-8">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold text-violet-600">Bookea CRM</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              Clients
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Suivez les clientes, les cures, les paiements et les prochains
              rendez-vous.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-11 bg-white"
              onClick={() => void refreshClients()}
              disabled={isLoadingClients}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Actualiser
            </Button>
            <Button type="button" className="h-11 bg-slate-950" onClick={openNewClientForm}>
              <Plus className="mr-2 h-4 w-4" />
              Nouveau client
            </Button>
          </div>
        </header>

        {clientError && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Connexion aux données clients à vérifier</p>
              <p className="mt-1">{clientError}</p>
            </div>
          </div>
        )}

        {isLoadingClients && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-700">
            Chargement des clients...
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ClientStatCard
            label="Clients du mois"
            value={stats.monthClients}
            icon={<UserRound />}
            color="text-blue-600"
          />
          <ClientStatCard
            label="Cures en cours"
            value={stats.inCare}
            icon={<CheckCircle2 />}
            color="text-emerald-600"
          />
          <ClientStatCard
            label="CA clients"
            value={formatCurrency(stats.monthRevenue)}
            icon={<Euro />}
            color="text-violet-600"
          />
          <ClientStatCard
            label="En attente de validation"
            value={formatCurrency(stats.pendingValidation)}
            icon={<CreditCard />}
            color="text-amber-600"
          />
        </section>

        <Card className="border-slate-200 py-0 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher une cliente, téléphone, email, soin..."
                className="h-11 pl-11"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "Tous" | ClientStatus)
              }
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option>Tous</option>
              <option>Actif</option>
              <option>Cure en cours</option>
              <option>À relancer</option>
              <option>Inactif</option>
            </select>
          </CardContent>
        </Card>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card className="overflow-hidden border-slate-200 py-0 shadow-sm">
            <CardContent className="p-0">
              <div className="grid grid-cols-[minmax(0,2.2fr)_1fr_1fr_96px] border-b border-slate-100 bg-white px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>Cliente</span>
                <span>Soin principal</span>
                <span>Prochain RDV</span>
                <span className="text-right">CA</span>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredClients.length === 0 && (
                  <div className="bg-white px-5 py-12 text-center">
                    <p className="text-sm font-medium text-slate-900">
                      Aucun client trouvé
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-500">
                      Modifiez la recherche ou créez une nouvelle fiche client.
                    </p>
                  </div>
                )}

                {filteredClients.map((client) => {
                  const selected = selectedClient?.id === client.id;
                  const birthdayGift = getBirthdayGift(client.birthDate);

                  return (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => setSelectedClientId(client.id)}
                      onDoubleClick={() => {
                        setSelectedClientId(client.id);
                        setIsFullClientOpen(true);
                      }}
                      className={`grid w-full grid-cols-[minmax(0,2.2fr)_1fr_1fr_96px] items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-blue-50/70 ${
                        selected ? "bg-blue-50 ring-1 ring-inset ring-blue-200" : "bg-white"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                            {client.firstName[0]}
                            {client.lastName[0]}
                          </span>
                          <div className="min-w-0">
                            <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-950">
                              <span className="truncate">
                                {client.firstName} {client.lastName}
                              </span>
                              {birthdayGift && birthdayGift.tone !== "month" ? (
                                <Gift
                                  className="h-4 w-4 shrink-0 text-rose-500"
                                  aria-label={birthdayGift.title}
                                />
                              ) : null}
                            </p>
                            <p className="truncate text-xs font-medium text-slate-500">
                              {client.phone} · {client.email}
                            </p>
                          </div>
                        </div>
                      </div>
                      <span className="truncate text-sm font-medium text-slate-700">
                        {client.mainCare}
                      </span>
                      <span className="truncate text-sm font-medium text-slate-500">
                        {client.nextAppointment}
                      </span>
                      <span className="text-right text-sm font-semibold text-emerald-600">
                        {formatCurrency(client.totalSpent)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {selectedClient && (
            <ClientPanel
              client={selectedClient}
              appointments={appointmentList}
              noteDraft={noteDraft}
              noteVisibility={noteVisibility}
              onNoteDraftChange={setNoteDraft}
              onNoteVisibilityChange={setNoteVisibility}
              onAddNote={addNote}
              onAddDocument={(document) =>
                addClientDocument(selectedClient.id, document)
              }
              onOpenFull={() => setIsFullClientOpen(true)}
              onOpenRdv={() => openRdvForClient(selectedClient)}
              onBirthDateChange={saveBirthDate}
            />
          )}
        </section>
      </div>

      {isClientFormOpen && (
        <ClientFormModal
          form={clientForm}
          title="Nouveau client"
          onChange={setClientForm}
          onClose={() => setIsClientFormOpen(false)}
          onSubmit={addClient}
          sourceOptions={provenanceOptions}
        />
      )}

      {selectedClient && isFullClientOpen && (
        <FullClientModal
          client={selectedClient}
          appointments={appointmentList}
          onClose={() => setIsFullClientOpen(false)}
          onSave={saveFullClient}
          sourceOptions={provenanceOptions}
        />
      )}
    </main>
  );
}

function ClientPanel({
  client,
  appointments,
  noteDraft,
  noteVisibility,
  onAddNote,
  onAddDocument,
  onNoteDraftChange,
  onNoteVisibilityChange,
  onOpenFull,
  onOpenRdv,
  onBirthDateChange,
}: {
  client: Client;
  appointments: Appointment[];
  noteDraft: string;
  noteVisibility: "private" | "shared";
  onAddDocument: (document: Omit<ClientDocument, "id">) => void;
  onAddNote: () => void;
  onNoteDraftChange: (value: string) => void;
  onNoteVisibilityChange: (value: "private" | "shared") => void;
  onOpenFull: () => void;
  onOpenRdv: () => void;
  onBirthDateChange: (value: string) => void;
}) {
  const [activePanel, setActivePanel] = useState<
    "cures" | "appointments" | "documents"
  >("cures");
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const appointmentHistory = getClientAppointmentHistory(client, appointments);
  const birthdayGift = getBirthdayGift(client.birthDate);

  return (
    <Card className="h-fit border-slate-200 py-0 shadow-sm">
      <CardContent className="space-y-5 p-5">
        <header className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-950">
                {client.firstName} {client.lastName}
              </h2>
              <Badge className={statusStyles[client.status]}>
                {client.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm font-medium text-slate-400">
              Cliente depuis {client.lastVisit}
            </p>
          </div>
          <div className="relative">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Plus"
              onClick={() => setIsMoreOpen((value) => !value)}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
            {isMoreOpen && (
              <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                <MoreMenuButton
                  label="Ouvrir fiche complète"
                  onClick={() => {
                    onOpenFull();
                    setIsMoreOpen(false);
                  }}
                />
                <MoreMenuButton
                  label="Historique RDV"
                  onClick={() => {
                    setActivePanel("appointments");
                    setIsMoreOpen(false);
                  }}
                />
                <MoreMenuButton
                  label="Documents"
                  onClick={() => {
                    setActivePanel("documents");
                    setIsMoreOpen(false);
                  }}
                />
                <MoreMenuButton
                  label="Cures & paiements"
                  onClick={() => {
                    setActivePanel("cures");
                    setIsMoreOpen(false);
                  }}
                />
              </div>
            )}
          </div>
        </header>

        <section
          className={`rounded-xl border p-4 ${
            birthdayGift?.tone === "today"
              ? "border-rose-200 bg-rose-50"
              : birthdayGift
                ? "border-amber-200 bg-amber-50"
                : "border-slate-100 bg-slate-50"
          }`}
        >
          <div className="mb-3 flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                birthdayGift?.tone === "today"
                  ? "bg-rose-100 text-rose-600"
                  : birthdayGift
                    ? "bg-amber-100 text-amber-700"
                    : "bg-white text-slate-500"
              }`}
            >
              <Gift className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Date d&apos;anniversaire
              </p>
              {birthdayGift ? (
                <>
                  <p className="mt-1 text-sm font-medium text-slate-950">
                    {birthdayGift.title}
                  </p>
                  <p className="text-sm font-semibold text-slate-600">
                    {birthdayGift.detail}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  Pour le cadeau d&apos;anniversaire et le SMS du jour J
                </p>
              )}
            </div>
          </div>
          <Input
            type="date"
            value={toBirthDateInputValue(client.birthDate)}
            onChange={(event) =>
              onBirthDateChange(fromBirthDateInputValue(event.target.value))
            }
            className="h-10 bg-white"
            aria-label="Date d'anniversaire"
          />
        </section>

        <section className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-xs font-medium text-slate-500">
              Fiche cliente
            </h3>
            <Button size="sm" variant="outline" onClick={onOpenFull}>
              Ouvrir fiche complète
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ClientIdentity label="Prénom" value={client.firstName} />
            <ClientIdentity label="Nom" value={client.lastName} />
            <ClientIdentity label="Téléphone" value={client.phone} />
            <ClientIdentity label="Email" value={client.email} />
            <ClientIdentity
              label="Date d'anniversaire"
              value={
                client.birthDate && client.birthDate !== "À compléter"
                  ? client.birthDate
                  : "À renseigner"
              }
            />
            <ClientIdentity label="Genre" value={client.gender} />
            <ClientIdentity
              label="Adresse"
              value={formatClientAddress(client)}
            />
            <ClientIdentity label="Commerciale" value={client.commercial} />
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <ClientAction
            label="Appeler"
            icon={<Phone />}
            className="border-blue-100 bg-blue-50 text-blue-700"
            onClick={() => window.open(`tel:${client.phone}`)}
          />
          <ClientAction
            label="WhatsApp"
            icon={<MessageCircle />}
            className="border-emerald-100 bg-emerald-50 text-emerald-700"
            onClick={() => window.open(getWhatsappUrl(client.phone), "_blank")}
          />
          <ClientAction
            label="RDV"
            icon={<CalendarDays />}
            className="border-violet-100 bg-violet-50 text-violet-700"
            active={activePanel === "appointments"}
            onClick={() => setActivePanel("appointments")}
          />
          <ClientAction
            label="Document"
            icon={<FileText />}
            className="border-amber-100 bg-amber-50 text-amber-700"
            active={activePanel === "documents"}
            onClick={() => setActivePanel("documents")}
          />
        </div>

        <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
          <div className="mb-2 flex items-center gap-2 font-semibold text-violet-900">
            <Sparkles className="h-4 w-4" />
            Seya recommande
          </div>
          <p className="text-sm leading-6 text-violet-800">
            Vérifier le solde, confirmer le prochain rendez-vous et proposer un
            soin complémentaire lié à {client.mainCare}.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MiniInfo label="Total dépensé" value={formatCurrency(client.totalSpent)} />
          <MiniInfo label="Reste dû" value={formatCurrency(client.balanceDue)} />
          <MiniInfo label="Catégorie" value={client.category || "À compléter"} />
          <MiniInfo label="Provenance" value={client.source} />
          <MiniInfo label="Campagne" value={client.campaign} />
        </div>

        <div className="flex gap-2 rounded-xl bg-slate-50 p-1">
          <ClientPanelTab
            active={activePanel === "cures"}
            onClick={() => setActivePanel("cures")}
          >
            Cures
          </ClientPanelTab>
          <ClientPanelTab
            active={activePanel === "appointments"}
            onClick={() => setActivePanel("appointments")}
          >
            Historique RDV
          </ClientPanelTab>
          <ClientPanelTab
            active={activePanel === "documents"}
            onClick={() => setActivePanel("documents")}
          >
            Documents
          </ClientPanelTab>
        </div>

        {activePanel === "cures" && <ClientCares cares={client.cares} />}
        {activePanel === "appointments" && (
          <ClientAppointments
            appointments={appointmentHistory}
            onOpenRdv={onOpenRdv}
          />
        )}
        {activePanel === "documents" && (
          <ClientDocuments
            documents={client.documents}
            onAddDocument={onAddDocument}
          />
        )}

        <section>
          <h3 className="mb-3 text-xs font-medium text-slate-500">
            Notes cliente
          </h3>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-3 grid grid-cols-2 gap-2">
              {(
                [
                  {
                    value: "private",
                    label: "Note privée",
                    detail: "Visible équipe",
                  },
                  {
                    value: "shared",
                    label: "Note partagée",
                    detail: "Visible cliente",
                  },
                ] as const
              ).map((option) => {
                const isActive = noteVisibility === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onNoteVisibilityChange(option.value)}
                    className={`rounded-xl border px-3 py-2 text-left transition ${
                      isActive
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <span className="block text-sm font-medium">
                      {option.label}
                    </span>
                    <span className="block text-xs font-bold">
                      {option.detail}
                    </span>
                  </button>
                );
              })}
            </div>
            <textarea
              value={noteDraft}
              onChange={(event) => onNoteDraftChange(event.target.value)}
              placeholder="Ajouter une note client..."
              className="min-h-20 w-full resize-none bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                onClick={onAddNote}
                disabled={noteDraft.trim().length === 0}
              >
                Ajouter la note
              </Button>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {client.notes.map((note) => {
              const isShared = note.visibility === "shared";

              return (
                <div
                  key={note.id}
                  className={`rounded-xl border p-3 ${
                    isShared
                      ? "border-blue-100 bg-blue-50"
                      : "border-slate-100 bg-slate-50"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">
                        {note.author}
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                          isShared
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {isShared ? "Partagée cliente" : "Privée équipe"}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-slate-400">
                      {note.date}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-slate-600">
                    {note.text}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function ClientStatCard({
  color,
  icon,
  label,
  value,
}: {
  color: string;
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <Card className="border-slate-200 py-0 shadow-sm">
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className={`mt-2 text-xl font-semibold ${color}`}>{value}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3 [&_svg]:h-6 [&_svg]:w-6">
          <span className={color}>{icon}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ClientFormModal({
  form,
  onChange,
  onClose,
  onSubmit,
  sourceOptions,
  title,
}: {
  form: Omit<Client, "id" | "notes" | "cares" | "documents">;
  onChange: (
    value: Omit<Client, "id" | "notes" | "cares" | "documents">
  ) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  sourceOptions: string[];
  title: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Renseignez les informations utiles pour la fiche cliente.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <ClientFormFields
          form={form}
          onChange={onChange}
          sourceOptions={sourceOptions}
        />

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" className="bg-slate-950">
            Enregistrer
          </Button>
        </div>
      </form>
    </div>
  );
}

function FullClientModal({
  client,
  appointments,
  onClose,
  onSave,
  sourceOptions,
}: {
  client: Client;
  appointments: Appointment[];
  onClose: () => void;
  onSave: (client: Client) => void;
  sourceOptions: string[];
}) {
  const [form, setForm] = useState(client);

  function addDocument(document: Omit<ClientDocument, "id">) {
    setForm((currentForm) => ({
      ...currentForm,
      documents: [
        {
          ...document,
          id: crypto.randomUUID(),
        },
        ...currentForm.documents,
      ],
    }));
  }

  const birthdayGift = getBirthdayGift(form.birthDate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-6 backdrop-blur-sm">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave(form);
        }}
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-violet-600">
              Fiche complète
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">
              {form.firstName} {form.lastName}
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Identité, coordonnées, historique, documents et suivi financier.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-4 text-xs font-medium text-slate-500">
                Informations personnelles
              </h3>
              <ClientFormFields
                form={form}
                onChange={setForm}
                sourceOptions={sourceOptions}
              />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <ClientCares cares={form.cares} />
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
              <div className="mb-2 flex items-center gap-2 font-semibold text-violet-900">
                <Sparkles className="h-4 w-4" />
                Seya recommande
              </div>
              {birthdayGift ? (
                <p className="mb-2 text-sm font-medium leading-6 text-violet-900">
                  {birthdayGift.title} — {birthdayGift.detail}.
                </p>
              ) : null}
              <p className="text-sm leading-6 text-violet-800">
                Vérifier les informations manquantes, contrôler le solde et
                programmer la prochaine action.
              </p>
            </section>

            <div className="grid grid-cols-2 gap-3">
              <MiniInfo
                label="Total dépensé"
                value={formatCurrency(form.totalSpent)}
              />
              <MiniInfo
                label="Reste dû"
                value={formatCurrency(form.balanceDue)}
              />
              <MiniInfo
                label="Catégorie"
                value={form.category || "À compléter"}
              />
              <MiniInfo label="Provenance" value={form.source || "À compléter"} />
              <MiniInfo
                label="Campagne"
                value={form.campaign || "À compléter"}
              />
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <ClientAppointments
                appointments={getClientAppointmentHistory(form, appointments)}
                onOpenRdv={() => {}}
              />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <ClientDocuments
                documents={form.documents}
                onAddDocument={addDocument}
              />
            </section>
          </aside>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button type="submit" className="bg-slate-950">
            Enregistrer la fiche
          </Button>
        </div>
      </form>
    </div>
  );
}

function ClientFormFields<T extends Omit<Client, "id" | "notes" | "cares" | "documents">>({
  form,
  onChange,
  sourceOptions,
}: {
  form: T;
  onChange: (value: T) => void;
  sourceOptions: string[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ClientInput
        label="Prénom"
        required
        value={form.firstName}
        onChange={(value) => onChange({ ...form, firstName: value })}
      />
      <ClientInput
        label="Nom"
        required
        value={form.lastName}
        onChange={(value) => onChange({ ...form, lastName: value })}
      />
      <ClientInput
        label="Téléphone"
        value={form.phone}
        onChange={(value) => onChange({ ...form, phone: value })}
      />
      <ClientInput
        label="Email"
        type="email"
        value={form.email}
        onChange={(value) => onChange({ ...form, email: value })}
      />
      <label className="space-y-1.5">
        <span className="text-sm font-semibold text-slate-700">
          Date d&apos;anniversaire
        </span>
        <Input
          type="date"
          value={toBirthDateInputValue(form.birthDate)}
          onChange={(event) =>
            onChange({
              ...form,
              birthDate: fromBirthDateInputValue(event.target.value),
            })
          }
          className="h-10"
        />
        <span className="text-xs font-medium text-slate-500">
          Pour le cadeau d&apos;anniversaire et les SMS du jour J
        </span>
      </label>
      <label className="space-y-1.5">
        <span className="text-sm font-semibold text-slate-700">Genre</span>
        <select
          value={form.gender}
          onChange={(event) => onChange({ ...form, gender: event.target.value })}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">À compléter</option>
          <option>Femme</option>
          <option>Homme</option>
          <option>Non renseigné</option>
        </select>
      </label>
      <ClientInput
        label="Adresse"
        value={form.address}
        onChange={(value) => onChange({ ...form, address: value })}
      />
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <ClientInput
          label="Code postal"
          value={form.postalCode}
          onChange={(value) => onChange({ ...form, postalCode: value })}
        />
        <ClientInput
          label="Ville"
          value={form.city}
          onChange={(value) => onChange({ ...form, city: value })}
        />
      </div>
      <ClientInput
        label="Soin principal"
        value={form.mainCare}
        onChange={(value) => onChange({ ...form, mainCare: value })}
      />
      <label className="space-y-1.5">
        <span className="text-sm font-semibold text-slate-700">Catégorie</span>
        <select
          value={form.category}
          onChange={(event) => onChange({ ...form, category: event.target.value })}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">À compléter</option>
          {publicCenterCategories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
      </label>
      <ClientInput
        label="Commerciale"
        value={form.commercial}
        onChange={(value) => onChange({ ...form, commercial: value })}
      />
      <label className="space-y-1.5">
        <span className="text-sm font-semibold text-slate-700">Provenance</span>
        <select
          value={form.source}
          onChange={(event) => onChange({ ...form, source: event.target.value })}
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
          <option value="">À compléter</option>
          {sourceOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
      <ClientInput
        label="Campagne"
        value={form.campaign}
        onChange={(value) => onChange({ ...form, campaign: value })}
      />
    </div>
  );
}

function ClientInput({
  label,
  onChange,
  placeholder,
  required = false,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <Input
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10"
      />
    </label>
  );
}

function MoreMenuButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
    >
      {label}
    </button>
  );
}

function ClientIdentity({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-white px-3 py-2">
      <p className="text-[11px] font-semibold uppercase text-slate-400">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-slate-900">
        {value}
      </p>
    </div>
  );
}

function ClientAction({
  active = false,
  className,
  icon,
  label,
  onClick,
}: {
  active?: boolean;
  className: string;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className={`h-14 flex-col gap-1 text-xs font-bold [&_svg]:h-4 [&_svg]:w-4 ${
        active ? "ring-2 ring-slate-300" : ""
      } ${className}`}
    >
      {icon}
      {label}
    </Button>
  );
}

function ClientPanelTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? "bg-white text-slate-950 shadow-sm"
          : "text-slate-500 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function ClientCares({ cares }: { cares: ClientCare[] }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-medium text-slate-500">
        Cures & paiements
      </h3>
      <div className="space-y-2">
        {cares.map((care) => (
          <div
            key={care.id}
            className="rounded-xl border border-slate-100 bg-white p-3"
          >
            <div className="flex justify-between gap-3">
              <div>
                <p className="font-bold text-slate-900">{care.label}</p>
                <p className="text-xs font-semibold text-slate-400">
                  {care.date}
                </p>
              </div>
              <Badge className="border-slate-100 bg-slate-50 text-slate-600">
                {care.status}
              </Badge>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((care.paid / Math.max(care.amount, 1)) * 100)
                  )}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              {formatCurrency(care.paid)} / {formatCurrency(care.amount)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ClientAppointments({
  appointments,
  onOpenRdv,
}: {
  appointments: ReturnType<typeof getClientAppointmentHistory>;
  onOpenRdv: () => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-slate-500">
          Historique des RDV
        </h3>
        <Button size="sm" onClick={onOpenRdv}>
          Nouveau RDV
        </Button>
      </div>

      <div className="space-y-2">
        {appointments.map((appointment) => (
          <div
            key={appointment.id}
            className="rounded-xl border border-slate-100 bg-white p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-slate-900">
                  {formatDisplayDate(appointment.date)} · {appointment.start}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {appointment.treatment} · {appointment.duration} min
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  {appointment.practitioner} · {appointment.cabin}
                </p>
              </div>
              <Badge className="border-violet-100 bg-violet-50 text-violet-700">
                {appointment.status}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ClientDocuments({
  documents,
  onAddDocument,
}: {
  documents: ClientDocument[];
  onAddDocument: (document: Omit<ClientDocument, "id">) => void;
}) {
  const [isDocumentFormOpen, setIsDocumentFormOpen] = useState(false);
  const [documentForm, setDocumentForm] =
    useState<Omit<ClientDocument, "id">>(emptyDocumentForm);

  function openDocumentForm() {
    setDocumentForm(emptyDocumentForm);
    setIsDocumentFormOpen(true);
  }

  function submitDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    onAddDocument({
      ...documentForm,
      label: documentForm.label.trim(),
    });
    setIsDocumentFormOpen(false);
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium text-slate-500">
          Documents client
        </h3>
        <Button size="sm" variant="outline" onClick={openDocumentForm}>
          Ajouter
        </Button>
      </div>

      <div className="space-y-2">
        {documents.map((document) => (
          <div
            key={document.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-bold text-slate-900">
                {document.label}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                {document.type} · {document.date}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge className="border-amber-100 bg-amber-50 text-amber-700">
                {document.status}
              </Badge>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Ouvrir ${document.label}`}
              >
                <Eye className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {isDocumentFormOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-6 backdrop-blur-sm">
          <form
            onSubmit={submitDocument}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-950">
                  Ajouter un document
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Le document sera ajouté à cette fiche cliente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDocumentFormOpen(false)}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4">
              <ClientInput
                label="Nom du document"
                required
                value={documentForm.label}
                onChange={(value) =>
                  setDocumentForm((form) => ({ ...form, label: value }))
                }
                placeholder="Ex : Consentement laser"
              />

              <label className="space-y-1.5">
                <span className="text-sm font-semibold text-slate-700">
                  Type
                </span>
                <select
                  value={documentForm.type}
                  onChange={(event) =>
                    setDocumentForm((form) => ({
                      ...form,
                      type: event.target.value as ClientDocument["type"],
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option>Consentement</option>
                  <option>Devis</option>
                  <option>Facture</option>
                  <option>Fiche cure</option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-semibold text-slate-700">
                  Statut
                </span>
                <select
                  value={documentForm.status}
                  onChange={(event) =>
                    setDocumentForm((form) => ({
                      ...form,
                      status: event.target.value as ClientDocument["status"],
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option>À envoyer</option>
                  <option>À signer</option>
                  <option>Signé</option>
                  <option>Validé</option>
                </select>
              </label>

              <ClientInput
                label="Date"
                value={documentForm.date}
                onChange={(value) =>
                  setDocumentForm((form) => ({ ...form, date: value }))
                }
                placeholder="JJ/MM/AAAA"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDocumentFormOpen(false)}
              >
                Annuler
              </Button>
              <Button type="submit" className="bg-slate-950">
                Ajouter
              </Button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

function formatClientAddress(client: Client) {
  const cityLine = [client.postalCode, client.city].filter(Boolean).join(" ");
  const address = [client.address, cityLine]
    .filter((part) => part && part !== "À compléter")
    .join(", ");

  return address || "À compléter";
}

function getClientStats(clients: Client[]) {
  const monthClients = clients.filter((client) =>
    client.cares.some((care) => isCurrentMonth(parseFrenchDate(care.date)))
  );

  return {
    monthClients: monthClients.length,
    inCare: clients.filter((client) => client.status === "Cure en cours").length,
    monthRevenue: monthClients.reduce(
      (total, client) =>
        total +
        client.cares
          .filter((care) => isCurrentMonth(parseFrenchDate(care.date)))
          .reduce((careTotal, care) => careTotal + care.paid, 0),
      0
    ),
    pendingValidation: monthClients.reduce(
      (total, client) => total + client.balanceDue,
      0
    ),
  };
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s/g, "");
}

function formatCurrency(value: number) {
  return value.toLocaleString("fr-FR", {
    currency: "EUR",
    style: "currency",
  });
}

function formatActivityDate() {
  return `Aujourd'hui ${new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function todayFrenchDate() {
  return new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getClientAppointmentHistory(client: Client, appointments: Appointment[]) {
  const clientName = normalize(`${client.firstName} ${client.lastName}`);
  const clientPhone = normalize(client.phone);
  const matchingAppointments = appointments
    .filter(
      (appointment) =>
        appointment.clientId === client.id ||
        normalize(appointment.personName) === clientName ||
        (Boolean(clientPhone) && normalize(appointment.phone) === clientPhone)
    )
    .map((appointment) => ({
      id: appointment.id,
      date: appointment.date,
      start: appointment.start,
      duration: appointment.duration,
      treatment: appointment.treatment,
      status: appointment.status,
      practitioner:
        practitioners.find(
          (practitioner) => practitioner.id === appointment.practitionerId
        )?.name ?? "Praticienne",
      cabin:
        cabins.find((cabin) => cabin.id === appointment.cabinId)?.name ??
        "Cabine",
    }));

  const nextAppointment = parseNextAppointment(client.nextAppointment);
  const fallbackAppointments =
    nextAppointment && matchingAppointments.length === 0
      ? [
          {
            id: `${client.id}-next-appointment`,
            date: nextAppointment.date,
            start: nextAppointment.start,
            duration: 60,
            treatment: client.mainCare,
            status: "À confirmer" as const,
            practitioner: client.commercial,
            cabin: "À définir",
          },
        ]
      : [];

  return [...matchingAppointments, ...fallbackAppointments].sort((a, b) =>
    `${b.date} ${b.start}`.localeCompare(`${a.date} ${a.start}`)
  );
}

function parseNextAppointment(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})$/);

  if (!match) {
    return null;
  }

  const [, day, month, year, start] = match;

  return {
    date: `${year}-${month}-${day}`,
    start,
  };
}

function formatDisplayDate(date: string) {
  const [year, month, day] = date.split("-");

  if (!year || !month || !day) {
    return date;
  }

  return `${day}/${month}/${year}`;
}

function getWhatsappUrl(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const normalizedPhone = digits.startsWith("0")
    ? `33${digits.slice(1)}`
    : digits;

  return `https://wa.me/${normalizedPhone}`;
}

function parseFrenchDate(date: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  const [day, month, year] = date.split("/");

  if (!day || !month || !year) {
    return "";
  }

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function toBirthDateInputValue(value: string) {
  return parseFrenchDate(value);
}

function fromBirthDateInputValue(value: string) {
  if (!value) return "";
  return formatDisplayDate(value);
}

function getBirthdayGift(birthDate: string) {
  const iso = toBirthDateInputValue(birthDate);

  if (!iso) return null;

  const [, monthText, dayText] = iso.split("-");
  const month = Number(monthText);
  const day = Number(dayText);

  if (!month || !day) return null;

  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();
  const label = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
  const isToday = month === todayMonth && day === todayDay;
  const thisYear = now.getFullYear();
  const startToday = new Date(thisYear, todayMonth - 1, todayDay);
  let nextBirthday = new Date(thisYear, month - 1, day);

  if (nextBirthday < startToday) {
    nextBirthday = new Date(thisYear + 1, month - 1, day);
  }

  const daysUntil = Math.round(
    (nextBirthday.getTime() - startToday.getTime()) / 86_400_000,
  );

  if (isToday) {
    return {
      tone: "today" as const,
      title: "Cadeau d'anniversaire aujourd'hui",
      detail: `Anniversaire le ${label}`,
    };
  }

  if (daysUntil > 0 && daysUntil <= 7) {
    return {
      tone: "soon" as const,
      title: "Préparer le cadeau d'anniversaire",
      detail: `Dans ${daysUntil} jour${daysUntil > 1 ? "s" : ""} — ${label}`,
    };
  }

  if (month === todayMonth) {
    return {
      tone: "month" as const,
      title: "Anniversaire ce mois-ci",
      detail: `Le ${label} — cadeau à prévoir`,
    };
  }

  return null;
}

function isCurrentMonth(date: string) {
  return date.slice(0, 7) === new Date().toISOString().slice(0, 7);
}

function getClientFicheParams() {
  if (typeof window === "undefined") {
    return {
      clientId: null as string | null,
      phone: null as string | null,
      query: null as string | null,
      openFiche: false,
    };
  }

  const params = new URLSearchParams(window.location.search);

  return {
    clientId: params.get("client"),
    phone: params.get("phone"),
    query: params.get("q"),
    openFiche: params.get("fiche") === "1",
  };
}

function findClientFromFicheParams(clients: Client[]) {
  const { clientId, phone, query } = getClientFicheParams();

  if (clientId) {
    const byId = clients.find((client) => client.id === clientId);
    if (byId) {
      return byId;
    }
  }

  if (phone) {
    const digits = phone.replace(/\D/g, "").slice(-9);
    const byPhone = clients.find(
      (client) => client.phone.replace(/\D/g, "").slice(-9) === digits,
    );
    if (byPhone) {
      return byPhone;
    }
  }

  if (query) {
    const normalized = query.trim().toLowerCase();
    return (
      clients.find(
        (client) =>
          `${client.firstName} ${client.lastName}`.trim().toLowerCase() ===
          normalized,
      ) ??
      clients.find((client) =>
        `${client.firstName} ${client.lastName}`
          .trim()
          .toLowerCase()
          .includes(normalized),
      )
    );
  }

  return undefined;
}
