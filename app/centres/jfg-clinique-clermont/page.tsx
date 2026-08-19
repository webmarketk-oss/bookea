import type { Metadata } from "next";
import { PublicBooking } from "@/components/public/public-booking";

export const metadata: Metadata = {
  title: "JFG Clinique Clermont-Ferrand",
  description:
    "Comparez les prestations et réservez un rendez-vous chez JFG Clinique Clermont-Ferrand.",
};

export default function JfgCliniqueClermontCenterPage() {
  return <PublicBooking />;
}
