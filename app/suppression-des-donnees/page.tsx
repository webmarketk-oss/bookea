import type { Metadata } from "next";
import { companyIdentity, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Suppression des données",
  description:
    "Comment demander la suppression de vos données personnelles Bookea.",
};

export default function SuppressionDesDonneesPage() {
  return (
    <LegalPage
      title="Suppression des données"
      intro="Cette page explique comment demander l'effacement des données personnelles traitées par Bookea, y compris les échanges WhatsApp."
      showDisclaimer={false}
      sections={[
        {
          title: "Comment demander la suppression",
          paragraphs: [
            `Envoyez un email à ${companyIdentity.email} avec l'objet « Suppression de mes données Bookea ».`,
            "Indiquez le nom, le prénom et le numéro de téléphone ou l'email du compte. Si la demande concerne un centre, précisez aussi le nom de l'établissement.",
          ],
        },
        {
          title: "Ce qui est supprimé",
          bullets: [
            "Compte cliente ou accès professionnel, selon la demande.",
            "Coordonnées, historique de rendez-vous et notes associées, hors pièces que la loi impose de conserver.",
            "Messages de service (SMS, email, WhatsApp) utilisés pour le suivi.",
          ],
        },
        {
          title: "Délai",
          paragraphs: [
            "Bookea accuse réception et traite la demande sous 30 jours. Un message confirme la suppression ou indique les données encore conservées pour une obligation légale.",
          ],
        },
        {
          title: "Politique complète",
          paragraphs: [
            "La politique de confidentialité et les règles d'acompte : https://www.bookeai.fr/confidentialite",
          ],
        },
      ]}
    />
  );
}
