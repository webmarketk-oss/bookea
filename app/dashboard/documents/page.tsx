"use client";

import {
  ChangeEvent,
  DragEvent,
  ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CheckCircle2,
  Download,
  Eye,
  FileArchive,
  FileCheck2,
  FileImage,
  FilePlus2,
  FileSignature,
  FileText,
  FolderOpen,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";

type DocumentStatus = "À signer" | "Signé" | "À compléter" | "Archivé";

type CenterDocument = {
  id: string;
  name: string;
  type: string;
  status: DocumentStatus;
  client: string;
  addedAt: string;
  size: string;
  url?: string;
};

type DocumentFolder = {
  id: string;
  name: string;
  color: string;
  documents: CenterDocument[];
};

const initialFolders: DocumentFolder[] = [
  {
    id: "consentements",
    name: "Consentements",
    color: "from-blue-500 to-cyan-400",
    documents: [
      {
        id: "doc-consentement-laser",
        name: "Consentement laser - Marie Dubois.pdf",
        type: "PDF",
        status: "Signé",
        client: "Marie Dubois",
        addedAt: "25/07/2026",
        size: "218 Ko",
      },
      {
        id: "doc-consentement-cryo",
        name: "Consentement cryolipolyse - Claire Moreau.docx",
        type: "Word",
        status: "À signer",
        client: "Claire Moreau",
        addedAt: "28/07/2026",
        size: "94 Ko",
      },
    ],
  },
  {
    id: "fiches-a-signer",
    name: "Fiches à signer",
    color: "from-violet-500 to-fuchsia-500",
    documents: [
      {
        id: "doc-fiche-hifu",
        name: "Fiche HIFU visage à signer.pptx",
        type: "PowerPoint",
        status: "À compléter",
        client: "Modèle centre",
        addedAt: "27/07/2026",
        size: "1,2 Mo",
      },
    ],
  },
  {
    id: "devis-factures",
    name: "Devis & factures",
    color: "from-amber-500 to-orange-500",
    documents: [
      {
        id: "doc-devis-cure",
        name: "Devis cure laser - Julie Martin.pdf",
        type: "PDF",
        status: "Archivé",
        client: "Julie Martin",
        addedAt: "22/07/2026",
        size: "176 Ko",
      },
    ],
  },
  {
    id: "autres-fichiers",
    name: "Autres fichiers",
    color: "from-emerald-500 to-teal-400",
    documents: [],
  },
];

const statusStyles: Record<DocumentStatus, string> = {
  "À signer": "border-orange-200 bg-orange-50 text-orange-700",
  Signé: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "À compléter": "border-violet-200 bg-violet-50 text-violet-700",
  Archivé: "border-slate-200 bg-slate-100 text-slate-600",
};

export default function DocumentsPage() {
  const [folders, setFolders] = useState(initialFolders);
  const [activeFolderId, setActiveFolderId] = useState(initialFolders[0].id);
  const [search, setSearch] = useState("");
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingDocumentId, setRenamingDocumentId] = useState<string | null>(
    null,
  );
  const [newDocumentName, setNewDocumentName] = useState("");
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeFolder =
    folders.find((folder) => folder.id === activeFolderId) ?? folders[0];

  const filteredDocuments = activeFolder.documents.filter((document) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      document.name.toLowerCase().includes(query) ||
      document.client.toLowerCase().includes(query) ||
      document.type.toLowerCase().includes(query) ||
      document.status.toLowerCase().includes(query)
    );
  });

  const stats = useMemo(() => {
    const allDocuments = folders.flatMap((folder) => folder.documents);
    return {
      total: allDocuments.length,
      toSign: allDocuments.filter((document) => document.status === "À signer")
        .length,
      signed: allDocuments.filter((document) => document.status === "Signé")
        .length,
      folders: folders.length,
    };
  }, [folders]);

  function addFiles(files: FileList | File[], folderId = activeFolderId) {
    const uploadedFiles = Array.from(files);
    if (uploadedFiles.length === 0) return;

    const documents = uploadedFiles.map((file) => ({
      id: `doc-${Date.now()}-${file.name}`,
      name: file.name,
      type: getFileType(file.name, file.type),
      status: "À compléter" as DocumentStatus,
      client: "À associer",
      addedAt: new Intl.DateTimeFormat("fr-FR").format(new Date()),
      size: formatFileSize(file.size),
      url: URL.createObjectURL(file),
    }));

    setFolders((current) =>
      current.map((folder) =>
        folder.id === folderId
          ? { ...folder, documents: [...documents, ...folder.documents] }
          : folder,
      ),
    );
    setActiveFolderId(folderId);
  }

  function createFolder() {
    const folder: DocumentFolder = {
      id: `folder-${Date.now()}`,
      name: "Nouveau dossier",
      color: "from-sky-500 to-violet-500",
      documents: [],
    };
    setFolders((current) => [...current, folder]);
    setActiveFolderId(folder.id);
    setRenamingFolderId(folder.id);
    setNewFolderName(folder.name);
  }

  function saveFolderName(folderId: string) {
    const cleanName = newFolderName.trim();
    if (!cleanName) return;
    setFolders((current) =>
      current.map((folder) =>
        folder.id === folderId ? { ...folder, name: cleanName } : folder,
      ),
    );
    setRenamingFolderId(null);
    setNewFolderName("");
  }

  function deleteFolder(folderId: string) {
    if (folders.length === 1) {
      return;
    }

    const nextFolders = folders.filter((folder) => folder.id !== folderId);
    setFolders(nextFolders);
    if (activeFolderId === folderId) {
      setActiveFolderId(nextFolders[0].id);
    }
    setRenamingFolderId(null);
  }

  function saveDocumentName(documentId: string) {
    const cleanName = newDocumentName.trim();
    if (!cleanName) return;

    setFolders((current) =>
      current.map((folder) =>
        folder.id === activeFolderId
          ? {
              ...folder,
              documents: folder.documents.map((document) =>
                document.id === documentId
                  ? {
                      ...document,
                      name: cleanName,
                      type: getFileType(cleanName, ""),
                    }
                  : document,
              ),
            }
          : folder,
      ),
    );
    setRenamingDocumentId(null);
    setNewDocumentName("");
  }

  function updateDocumentStatus(documentId: string, status: DocumentStatus) {
    setFolders((current) =>
      current.map((folder) =>
        folder.id === activeFolderId
          ? {
              ...folder,
              documents: folder.documents.map((document) =>
                document.id === documentId ? { ...document, status } : document,
              ),
            }
          : folder,
      ),
    );
  }

  function deleteDocument(documentId: string) {
    setFolders((current) =>
      current.map((folder) =>
        folder.id === activeFolderId
          ? {
              ...folder,
              documents: folder.documents.filter(
                (document) => document.id !== documentId,
              ),
            }
          : folder,
      ),
    );
  }

  function openDocument(document: CenterDocument) {
    if (document.url) {
      window.open(document.url, "_blank", "noopener,noreferrer");
      return;
    }
    alert(
      "Ce document est un exemple. Quand l'espace fichiers sera branché, le fichier réel s'ouvrira ici.",
    );
  }

  function handleDrop(
    event: DragEvent<HTMLButtonElement | HTMLDivElement>,
    folderId: string,
  ) {
    event.preventDefault();
    setDragOverFolderId(null);
    addFiles(event.dataTransfer.files, folderId);
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-[1800px] space-y-6 p-8">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-black text-violet-600">
              Bookea Documents
            </p>
            <h1 className="mt-1 text-5xl font-black tracking-tight text-slate-950">
              Documents
            </h1>
            <p className="mt-3 max-w-4xl text-xl font-medium text-slate-500">
              Stockez les consentements, fiches à signer, devis, PDF,
              PowerPoint et fichiers importants du centre.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={createFolder}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-black text-slate-900 shadow-sm transition hover:bg-slate-50"
            >
              <FolderOpen className="h-5 w-5 text-blue-600" />
              Nouveau dossier
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white shadow-sm transition hover:bg-blue-700"
            >
              <UploadCloud className="h-5 w-5" />
              Ajouter un fichier
            </button>
          </div>
        </header>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DocumentMetric
            title="Documents"
            value={stats.total}
            detail="Fichiers stockés"
            icon={<FileArchive />}
            color="text-blue-600"
          />
          <DocumentMetric
            title="À signer"
            value={stats.toSign}
            detail="Consentements / fiches"
            icon={<FileSignature />}
            color="text-orange-600"
          />
          <DocumentMetric
            title="Signés"
            value={stats.signed}
            detail="Documents validés"
            icon={<CheckCircle2 />}
            color="text-emerald-600"
          />
          <DocumentMetric
            title="Dossiers"
            value={stats.folders}
            detail="Organisation centre"
            icon={<FolderOpen />}
            color="text-violet-600"
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-black text-slate-950">Dossiers</h2>
              <button
                type="button"
                onClick={createFolder}
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white"
                aria-label="Créer un dossier"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              {folders.map((folder) => {
                const active = folder.id === activeFolderId;
                const renaming = renamingFolderId === folder.id;
                return (
                  <div
                    key={folder.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveFolderId(folder.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        setActiveFolderId(folder.id);
                      }
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverFolderId(folder.id);
                    }}
                    onDragLeave={() => setDragOverFolderId(null)}
                    onDrop={(event) => handleDrop(event, folder.id)}
                    className={`w-full rounded-3xl border p-4 text-left transition ${
                      active
                        ? "border-blue-200 bg-blue-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    } ${
                      dragOverFolderId === folder.id
                        ? "border-dashed border-blue-500 bg-blue-100"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${folder.color} text-white shadow-sm`}
                      >
                        <FolderOpen className="h-6 w-6" />
                      </span>
                      <span className="min-w-0 flex-1">
                        {renaming ? (
                          <span
                            className="flex gap-2"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              value={newFolderName}
                              onChange={(event) =>
                                setNewFolderName(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  saveFolderName(folder.id);
                                }
                              }}
                              autoFocus
                              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-base font-black outline-none focus:border-blue-400"
                            />
                            <button
                              type="button"
                              onClick={() => saveFolderName(folder.id)}
                              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-black text-white"
                            >
                              OK
                            </button>
                          </span>
                        ) : (
                          <>
                            <span className="block truncate text-lg font-black text-slate-950">
                              {folder.name}
                            </span>
                            <span className="mt-1 block text-sm font-bold text-slate-500">
                              {folder.documents.length} fichier
                              {folder.documents.length > 1 ? "s" : ""}
                            </span>
                          </>
                        )}
                      </span>
                      {!renaming && (
                        <span className="flex gap-1">
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              setRenamingFolderId(folder.id);
                              setNewFolderName(folder.name);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.stopPropagation();
                                setRenamingFolderId(folder.id);
                                setNewFolderName(folder.name);
                              }
                            }}
                            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-blue-600"
                            aria-label={`Renommer ${folder.name}`}
                          >
                            <Pencil className="h-5 w-5" />
                          </span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteFolder(folder.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.stopPropagation();
                                deleteFolder(folder.id);
                              }
                            }}
                            className={`flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 ${
                              folders.length === 1
                                ? "pointer-events-none opacity-40"
                                : ""
                            }`}
                            aria-label={`Supprimer ${folder.name}`}
                          >
                            <Trash2 className="h-5 w-5" />
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-black uppercase text-slate-400">
                  Dossier actif
                </p>
                <h2 className="text-3xl font-black text-slate-950">
                  {activeFolder.name}
                </h2>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-slate-500">
                  <Search className="h-5 w-5" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Rechercher un document..."
                    className="min-w-0 bg-transparent text-base font-bold text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 font-black text-white"
                >
                  <FilePlus2 className="h-5 w-5" />
                  Ajouter
                </button>
              </div>
            </div>

            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverFolderId(activeFolderId);
              }}
              onDragLeave={() => setDragOverFolderId(null)}
              onDrop={(event) => handleDrop(event, activeFolderId)}
              className={`mt-5 rounded-3xl border-2 border-dashed p-6 text-center transition ${
                dragOverFolderId === activeFolderId
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <UploadCloud className="mx-auto h-8 w-8 text-blue-600" />
              <p className="mt-2 text-lg font-black text-slate-900">
                Glissez vos fichiers ici
              </p>
              <p className="mt-1 text-sm font-bold text-slate-500">
                PDF, Word, PowerPoint, images, fiches à signer, consentements.
              </p>
            </div>

            <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-200">
              <div className="grid min-w-[1120px] grid-cols-[minmax(360px,1.4fr)_minmax(170px,.6fr)_110px_180px_150px] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black uppercase text-slate-500">
                <span>Document</span>
                <span>Client</span>
                <span>Type</span>
                <span>Statut</span>
                <span className="text-right">Actions</span>
              </div>

              {filteredDocuments.length === 0 ? (
                <div className="p-8 text-center">
                  <FileText className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-3 text-xl font-black text-slate-900">
                    Aucun document ici
                  </p>
                  <p className="mt-1 font-bold text-slate-500">
                    Ajoutez un fichier ou glissez-le directement dans ce dossier.
                  </p>
                </div>
              ) : (
                filteredDocuments.map((document) => (
                  <div
                    key={document.id}
                    className="grid min-w-[1120px] grid-cols-[minmax(360px,1.4fr)_minmax(170px,.6fr)_110px_180px_150px] items-center gap-4 border-b border-slate-100 px-4 py-4 last:border-b-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                        {getDocumentIcon(document.type)}
                      </span>
                      <span className="min-w-0">
                        {renamingDocumentId === document.id ? (
                          <span className="flex gap-2">
                            <input
                              value={newDocumentName}
                              onChange={(event) =>
                                setNewDocumentName(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  saveDocumentName(document.id);
                                }
                              }}
                              autoFocus
                              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-base font-black outline-none focus:border-blue-400"
                            />
                            <button
                              type="button"
                              onClick={() => saveDocumentName(document.id)}
                              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-black text-white"
                            >
                              OK
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openDocument(document)}
                            className="block max-w-full truncate text-left text-base font-black text-slate-950 hover:text-blue-600"
                            title={document.name}
                          >
                            {document.name}
                          </button>
                        )}
                        <span className="text-sm font-bold text-slate-400">
                          {document.addedAt} · {document.size}
                        </span>
                      </span>
                    </div>
                    <span className="truncate font-bold text-slate-600" title={document.client}>
                      {document.client}
                    </span>
                    <span className="truncate font-bold text-slate-600" title={document.type}>
                      {document.type}
                    </span>
                    <select
                      value={document.status}
                      onChange={(event) =>
                        updateDocumentStatus(
                          document.id,
                          event.target.value as DocumentStatus,
                        )
                      }
                      className={`w-full rounded-2xl border px-3 py-2 text-sm font-black outline-none ${statusStyles[document.status]}`}
                    >
                      <option>À signer</option>
                      <option>Signé</option>
                      <option>À compléter</option>
                      <option>Archivé</option>
                    </select>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openDocument(document)}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                        aria-label={`Ouvrir ${document.name}`}
                      >
                        <Eye className="h-5 w-5" />
                      </button>
                      {document.url && (
                        <a
                          href={document.url}
                          download={document.name}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                          aria-label={`Télécharger ${document.name}`}
                        >
                          <Download className="h-5 w-5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingDocumentId(document.id);
                          setNewDocumentName(document.name);
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                        aria-label={`Renommer ${document.name}`}
                      >
                        <Pencil className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteDocument(document.id)}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-100 text-rose-500 hover:bg-rose-50"
                        aria-label={`Supprimer ${document.name}`}
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function DocumentMetric({
  title,
  value,
  detail,
  icon,
  color,
}: {
  title: string;
  value: number;
  detail: string;
  icon: ReactNode;
  color: string;
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-black text-slate-500">{title}</p>
          <p className={`mt-4 text-5xl font-black ${color}`}>{value}</p>
          <p className="mt-3 text-base font-bold text-slate-500">{detail}</p>
        </div>
        <span className={`rounded-3xl bg-slate-50 p-4 ${color}`}>{icon}</span>
      </div>
    </article>
  );
}

function getFileType(name: string, mime: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "pdf" || mime.includes("pdf")) return "PDF";
  if (["doc", "docx"].includes(extension ?? "")) return "Word";
  if (["ppt", "pptx"].includes(extension ?? "")) return "PowerPoint";
  if (["jpg", "jpeg", "png", "webp", "heic"].includes(extension ?? "")) {
    return "Image";
  }
  return extension ? extension.toUpperCase() : "Fichier";
}

function getDocumentIcon(type: string) {
  if (type === "PDF" || type === "Word") return <FileText className="h-6 w-6" />;
  if (type === "PowerPoint") return <FileCheck2 className="h-6 w-6" />;
  if (type === "Image") return <FileImage className="h-6 w-6" />;
  return <FileArchive className="h-6 w-6" />;
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} Ko`;
  return `${(size / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}
