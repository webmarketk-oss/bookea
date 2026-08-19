import type { Metadata } from "next";
import { BookeaAccountPage } from "@/components/public/bookea-account-page";

export const metadata: Metadata = {
  title: "Mon compte Bookea",
  description:
    "Espace cliente Bookea avec rendez-vous, carte fidelite et messagerie in-app.",
};

export default function ClientAccountPage() {
  return <BookeaAccountPage />;
}
