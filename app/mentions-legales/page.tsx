import type { Metadata } from "next";
import { companyIdentity, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: "Mentions légales de Bookea.",
};

export default function MentionsLegalesPage() {
  return (
    <LegalPage
      title="Mentions légales"
      intro="Cette page rassemble les informations légales relatives à l'édition et à l'exploitation du site Bookea."
      sections={[
        {
          title: "Éditeur du site",
          bullets: [
            `Société : ${companyIdentity.company}`,
            "Forme juridique : Limited Liability Company (LLC) de droit américain",
            `Responsable de publication : ${companyIdentity.contact}`,
            `Adresse : ${companyIdentity.address}`,
            `Email : ${companyIdentity.email}`,
            "Capital social : non applicable pour une LLC",
          ],
        },
        {
          title: "Activité",
          paragraphs: [
            "Bookea est une plateforme de recherche, de réservation et de gestion dédiée aux centres esthétiques et de bien-être. La plateforme propose également des outils CRM, planning, fidélité et assistance intelligente pour les établissements partenaires.",
          ],
        },
        {
          title: "Hébergement",
          paragraphs: [
            "Le site est actuellement hébergé via une infrastructure cloud sécurisée. L'hébergement définitif de la plateforme pourra notamment s'appuyer sur des services cloud dédiés à l'application, à la base de données, à l'authentification et à la sécurité réseau.",
          ],
        },
        {
          title: "Propriété intellectuelle",
          paragraphs: [
            "La marque Bookea, le logo, les textes, interfaces, visuels et éléments graphiques présents sur le site sont protégés. Toute reproduction, diffusion ou adaptation sans autorisation préalable est interdite.",
          ],
        },
        {
          title: "Contact",
          paragraphs: [
            `Pour toute question concernant le site ou la plateforme, vous pouvez écrire à ${companyIdentity.email}.`,
          ],
        },
      ]}
    />
  );
}
