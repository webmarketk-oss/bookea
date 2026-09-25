import Link from "next/link";
import { BookeaLogo } from "@/components/bookea-logo";

type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

type LegalPageProps = {
  title: string;
  intro: string;
  sections: LegalSection[];
  showDisclaimer?: boolean;
};

const legalLinks = [
  ["Mentions légales", "/mentions-legales"],
  ["Confidentialité", "/confidentialite"],
  ["CGU", "/cgu"],
  ["CGV", "/cgv"],
  ["Cookies", "/cookies"],
  ["Réservation", "/conditions-reservation"],
  ["Suppression des données", "/suppression-des-donnees"],
];

export const companyIdentity = {
  company: "SFK Web k Agency llc",
  contact: "Samantha Kahlaoui",
  address: "1209 MOUNTAIN ROAD PL NE, 87110 ALBUQUERQUE, États-Unis",
  email: "info@bookeai.fr",
};

export function LegalPage({
  title,
  intro,
  sections,
  showDisclaimer = true,
}: LegalPageProps) {
  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <BookeaLogo href="/" size="sm" />
          <Link
            href="/"
            className="rounded-full bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"
          >
            Retour
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-8 lg:p-10">
          <p className="text-xs font-black uppercase tracking-wide text-violet-600">
            Bookea
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-base font-semibold leading-7 text-slate-600 sm:text-lg">
            {intro}
          </p>

          <div className="mt-8 grid gap-5">
            {sections.map((section) => (
              <section
                key={section.title}
                className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
              >
                <h2 className="text-xl font-black text-slate-950">
                  {section.title}
                </h2>
                {section.paragraphs?.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="mt-3 text-sm font-semibold leading-7 text-slate-600 sm:text-base"
                  >
                    {paragraph}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="mt-3 space-y-2 text-sm font-semibold leading-7 text-slate-600 sm:text-base">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>• {bullet}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          {showDisclaimer ? (
            <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-7 text-amber-900">
              Ces textes sont une base de travail pour Bookea. Avant un lancement
              commercial définitif, ils doivent être relus et validés par un
              professionnel du droit, notamment pour les paiements, les données
              personnelles et les conditions d'annulation.
            </div>
          ) : null}
        </div>

        <nav className="mt-6 flex flex-wrap gap-2">
          {legalLinks.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm hover:text-blue-600"
            >
              {label}
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}

export function PublicLegalFooter() {
  return (
    <footer className="mx-auto max-w-6xl px-4 pb-28 pt-2 text-sm font-semibold text-slate-500 sm:px-6 lg:px-8 lg:pb-10">
      <div className="flex flex-col gap-4 border-t border-slate-200 pt-6 md:flex-row md:items-center md:justify-between">
        <p>© 2026 Bookea. Tous droits réservés.</p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          {legalLinks.map(([label, href]) => (
            <Link key={href} href={href} className="hover:text-blue-600">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
