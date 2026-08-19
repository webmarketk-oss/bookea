import type { Metadata } from "next";
import { companyIdentity, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Conditions générales de vente",
  description: "Conditions générales de vente de Bookea.",
};

export default function CgvPage() {
  return (
    <LegalPage
      title="Conditions générales de vente"
      intro="Cette page encadre les services payants proposés par Bookea, notamment les abonnements professionnels et les éventuels frais liés à la réservation."
      sections={[
        {
          title: "Services concernés",
          paragraphs: [
            "Bookea peut proposer des abonnements aux centres esthétiques et de bien-être, ainsi que des services complémentaires liés au CRM, au planning, à l'intelligence artificielle, aux statistiques et à la réservation en ligne.",
          ],
        },
        {
          title: "Prix",
          paragraphs: [
            "Les prix des abonnements, options et services payants ne sont pas affichés sous forme de grille fixe sur cette page. Ils sont communiqués au centre avant toute souscription, dans l'interface, sur devis ou dans une proposition commerciale dédiée.",
            "Aucun paiement professionnel n'est demandé sans présentation préalable du prix applicable, de la période d'essai, des conditions d'engagement et des modalités de résiliation.",
          ],
        },
        {
          title: "Paiement",
          paragraphs: [
            "Le paiement pourra être effectué par carte bancaire ou tout autre moyen proposé par Bookea. Les acomptes versés par les clientes lors d'une réservation seront traités selon les conditions de réservation du centre concerné.",
          ],
        },
        {
          title: "Abonnements professionnels",
          paragraphs: [
            "Bookea peut proposer une période d'essai de 30 jours aux centres professionnels. Sauf condition particulière indiquée lors de la souscription, l'engagement initial est de 60 jours.",
            `La résiliation s'effectue par email à ${companyIdentity.email}, au plus tard 15 jours avant la date de fin de la période en cours.`,
          ],
        },
        {
          title: "Réclamations",
          paragraphs: [
            `Toute question commerciale peut être adressée à ${companyIdentity.email}.`,
          ],
        },
      ]}
    />
  );
}
