import type { Metadata } from "next";
import { companyIdentity, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Conditions de réservation",
  description: "Conditions de réservation et d'annulation Bookea.",
};

export default function ConditionsReservationPage() {
  return (
    <LegalPage
      title="Conditions de réservation"
      intro="Ces conditions expliquent le fonctionnement des réservations et des acomptes effectués depuis Bookea."
      showDisclaimer={false}
      sections={[
        {
          title: "Réservation",
          paragraphs: [
            "La cliente peut rechercher une prestation, choisir un centre, sélectionner un créneau disponible et confirmer sa réservation. Le rendez-vous est ensuite transmis au centre concerné et ajouté à son planning.",
          ],
        },
        {
          title: "Acompte",
          paragraphs: [
            "Certaines prestations peuvent nécessiter le paiement d'un acompte pour bloquer le rendez-vous. Le montant de l'acompte est affiché avant confirmation.",
            "Lorsque la réservation comprend un acompte, celui-ci est remboursable si l'annulation intervient au moins 48 heures avant le rendez-vous.",
          ],
        },
        {
          title: "Modification et annulation",
          paragraphs: [
            "Lorsqu'aucun acompte n'a été versé, l'annulation du rendez-vous est gratuite.",
            "En cas de no-show, c'est-à-dire d'absence au rendez-vous sans annulation dans les délais, l'acompte est perdu.",
            "En cas de retard, le centre peut reporter le rendez-vous selon ses disponibilités et la durée de la prestation.",
          ],
        },
        {
          title: "Confirmation",
          paragraphs: [
            "Une réservation peut être confirmée automatiquement ou nécessiter une validation du centre selon les paramètres de l'établissement, la prestation choisie et le paiement de l'acompte.",
          ],
        },
        {
          title: "Contact",
          paragraphs: [
            `Pour toute question concernant une réservation Bookea, contactez ${companyIdentity.email} ou le centre concerné.`,
          ],
        },
      ]}
    />
  );
}
