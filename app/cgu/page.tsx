import type { Metadata } from "next";
import { companyIdentity, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation",
  description: "Conditions générales d'utilisation de Bookea.",
};

export default function CguPage() {
  return (
    <LegalPage
      title="Conditions générales d'utilisation"
      intro="Les présentes conditions encadrent l'utilisation de Bookea par les clientes, les centres partenaires et les utilisateurs professionnels."
      sections={[
        {
          title: "Objet",
          paragraphs: [
            "Bookea permet aux clientes de rechercher des prestations, comparer des centres, réserver des rendez-vous et gérer leur espace personnel. Bookea Pro permet aux centres de gérer leurs prospects, clientes, rendez-vous, documents, KPI et tâches quotidiennes.",
          ],
        },
        {
          title: "Compte utilisateur",
          paragraphs: [
            "L'accès à certaines fonctionnalités nécessite la création d'un compte. L'utilisateur s'engage à fournir des informations exactes et à maintenir ses identifiants confidentiels.",
          ],
        },
        {
          title: "Utilisation de la plateforme",
          bullets: [
            "Ne pas utiliser Bookea pour une activité illégale ou frauduleuse.",
            "Ne pas tenter d'accéder aux données d'un autre centre ou d'une autre cliente.",
            "Respecter les rendez-vous pris et les règles du centre sélectionné.",
            "Utiliser les outils Seya comme une aide, sans remplacer la validation humaine quand elle est nécessaire.",
          ],
        },
        {
          title: "Disponibilité",
          paragraphs: [
            "Bookea s'efforce de maintenir la plateforme accessible. Des interruptions peuvent toutefois intervenir pour maintenance, évolution, sécurité ou incident technique.",
          ],
        },
        {
          title: "Contact",
          paragraphs: [
            `Toute demande relative à l'utilisation de Bookea peut être adressée à ${companyIdentity.email}.`,
          ],
        },
      ]}
    />
  );
}
