import type { Metadata } from "next";
import { companyIdentity, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Politique de confidentialité, acomptes et suppression des données Bookea.",
};

export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      intro="Cette page décrit les données personnelles traitées par Bookea, y compris via WhatsApp, ainsi que les règles d'acompte et le droit à la suppression."
      showDisclaimer={false}
      sections={[
        {
          title: "Responsable du traitement",
          paragraphs: [
            `${companyIdentity.company}, représentée par ${companyIdentity.contact}, est responsable du traitement des données de la plateforme Bookea (bookeai.fr).`,
            `Contact : ${companyIdentity.email} — ${companyIdentity.address}.`,
          ],
        },
        {
          title: "Données collectées",
          bullets: [
            "Identité : nom, prénom, genre, date de naissance si renseignée.",
            "Coordonnées : numéro de téléphone, email, adresse postale.",
            "Réservations : prestation, centre, date, heure, praticienne, cabine, statut du rendez-vous.",
            "Paiements : montant, acompte, solde, statut de paiement, identifiants de transaction.",
            "Fidélité : points, avantages, historique d'utilisation.",
            "Échanges : messages (SMS, email, WhatsApp), notes internes, documents et consentements nécessaires au suivi.",
            "Données techniques : logs de connexion, identifiants d'appareil, cookies nécessaires au service.",
          ],
        },
        {
          title: "WhatsApp et Meta",
          paragraphs: [
            "Bookea utilise l'API WhatsApp Business (Meta) pour envoyer et recevoir des messages liés aux rendez-vous, relances, confirmations et acomptes.",
            "Dans ce cadre, le numéro de téléphone, le nom affiché et le contenu des messages échangés peuvent être transmis à Meta, qui les traite selon ses propres conditions WhatsApp Business.",
            "Bookea n'utilise pas ces conversations à des fins publicitaires. Elles servent uniquement à la relation client du centre concerné.",
          ],
        },
        {
          title: "Finalités",
          bullets: [
            "Créer et gérer le compte cliente ou professionnel.",
            "Permettre la recherche, la réservation et la modification de rendez-vous.",
            "Envoyer des confirmations, rappels et messages de service (SMS, email, WhatsApp).",
            "Gérer les acomptes, paiements, factures et documents.",
            "Mettre à jour la carte de fidélité.",
            "Aider les centres à suivre leurs clientes et prospects.",
            "Sécuriser la plateforme, prévenir la fraude et respecter les obligations légales.",
          ],
        },
        {
          title: "Acompte et dépôt",
          paragraphs: [
            "Certaines prestations demandent un acompte pour bloquer le rendez-vous. Le montant est affiché avant confirmation.",
            "L'acompte est remboursable si l'annulation intervient au moins 48 heures avant le rendez-vous. Sans acompte, l'annulation est gratuite. En cas d'absence (no-show), l'acompte est perdu.",
            "Le détail complet est publié ici : https://www.bookeai.fr/conditions-reservation",
          ],
        },
        {
          title: "Destinataires et sous-traitants",
          paragraphs: [
            "Chaque centre accède uniquement aux données de son établissement. L'équipe Bookea n'y accède que pour le support, la sécurité, la maintenance ou une obligation légale.",
            "Des prestataires techniques peuvent traiter des données pour le compte de Bookea : hébergement, base de données, authentification, paiements, envoi de SMS/email, et Meta pour WhatsApp.",
          ],
        },
        {
          title: "Durée de conservation",
          paragraphs: [
            "Les données de compte et de rendez-vous sont conservées pendant l'utilisation du service, puis le temps nécessaire aux obligations comptables et de preuve (jusqu'à 5 ans pour les pièces de paiement).",
            "Les messages WhatsApp, SMS et emails de service sont conservés le temps du suivi client, puis archivés ou supprimés selon la demande de la personne concernée.",
          ],
        },
        {
          title: "Droits et suppression des données",
          paragraphs: [
            `Toute personne peut demander l'accès, la rectification, la limitation ou l'effacement de ses données en écrivant à ${companyIdentity.email}, depuis le compte Bookea, ou via la page https://www.bookeai.fr/suppression-des-donnees`,
            "Bookea traite la demande sous 30 jours. La suppression peut être limitée si une obligation légale ou comptable impose de conserver certaines pièces.",
          ],
        },
        {
          title: "Contact",
          paragraphs: [
            `Délégué ou contact données : ${companyIdentity.email}`,
          ],
        },
      ]}
    />
  );
}
