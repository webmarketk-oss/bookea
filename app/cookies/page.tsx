import type { Metadata } from "next";
import { companyIdentity, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Politique cookies",
  description: "Politique cookies de Bookea.",
};

export default function CookiesPage() {
  return (
    <LegalPage
      title="Politique cookies"
      intro="Cette page explique comment Bookea peut utiliser des cookies ou technologies similaires sur son site et ses interfaces."
      sections={[
        {
          title: "Cookies nécessaires",
          paragraphs: [
            "Certains cookies ou stockages locaux peuvent être nécessaires pour faire fonctionner la plateforme, maintenir une session, sécuriser l'accès ou mémoriser des préférences indispensables.",
          ],
        },
        {
          title: "Mesure d'audience et marketing",
          paragraphs: [
            "Bookea peut utiliser des outils de mesure d'audience et de marketing, notamment Google Analytics, Meta Pixel ou TikTok Pixel, afin de comprendre l'utilisation du site, mesurer les performances des campagnes et améliorer l'expérience.",
            "Lorsque ces outils ne sont pas strictement nécessaires au fonctionnement du service, ils sont soumis au consentement de l'utilisatrice.",
          ],
        },
        {
          title: "Gestion du consentement",
          paragraphs: [
            "Les utilisatrices doivent pouvoir accepter, refuser ou paramétrer les cookies non essentiels. Elles pourront également modifier leur choix à tout moment depuis le module de gestion du consentement prévu sur la plateforme.",
          ],
        },
        {
          title: "Contact",
          paragraphs: [
            `Pour toute question liée aux cookies, contactez ${companyIdentity.email}.`,
          ],
        },
      ]}
    />
  );
}
