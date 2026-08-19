import type { Metadata } from "next";
import { companyIdentity, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: "Politique de confidentialité de Bookea.",
};

export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      intro="Bookea traite des données personnelles pour permettre aux clientes de réserver et aux centres de gérer leur activité."
      sections={[
        {
          title: "Responsable du traitement",
          paragraphs: [
            `${companyIdentity.company}, représentée par ${companyIdentity.contact}, peut être contactée à l'adresse ${companyIdentity.email}.`,
          ],
        },
        {
          title: "Données collectées",
          bullets: [
            "Identité : nom, prénom, genre, date de naissance si renseignée.",
            "Coordonnées : téléphone, email, adresse postale.",
            "Réservations : prestation, centre, date, heure, praticienne, cabine, statut du rendez-vous.",
            "Paiements : montant, acompte, solde, statut de paiement.",
            "Fidélité : points, avantages, historique d'utilisation.",
            "Échanges et notes : messages, commentaires, documents et consentements lorsque ces éléments sont nécessaires au suivi.",
          ],
        },
        {
          title: "Finalités",
          bullets: [
            "Créer et gérer le compte cliente.",
            "Permettre la recherche, la réservation et la modification de rendez-vous.",
            "Synchroniser les rendez-vous avec le CRM et le planning du centre concerné.",
            "Gérer les acomptes, paiements, factures et documents.",
            "Mettre à jour la carte de fidélité.",
            "Aider les centres à suivre leurs clientes et prospects.",
            "Améliorer la plateforme et sécuriser les accès.",
          ],
        },
        {
          title: "Accès aux données",
          paragraphs: [
            "Chaque centre accède uniquement aux données liées à son établissement. Les autres centres ne peuvent pas consulter ces informations. L'équipe Bookea peut accéder à certaines données uniquement pour le support, la sécurité, la maintenance ou les obligations légales.",
          ],
        },
        {
          title: "Durée de conservation",
          paragraphs: [
            "Les données sont conservées pendant la durée nécessaire à l'utilisation de la plateforme, au suivi client, aux obligations comptables et légales. Les durées exactes doivent être précisées selon l'organisation finale de Bookea.",
          ],
        },
        {
          title: "Droits des personnes",
          paragraphs: [
            `Les utilisatrices peuvent demander l'accès, la rectification, l'effacement ou la limitation de leurs données en écrivant à ${companyIdentity.email}.`,
          ],
        },
      ]}
    />
  );
}
