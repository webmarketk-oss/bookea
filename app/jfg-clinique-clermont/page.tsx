import type { Metadata } from "next";
import { PublicBooking } from "@/components/public/public-booking";

export const metadata: Metadata = {
  title: "JFG Clinique Clermont-Ferrand",
  description:
    "Réservez votre soin chez JFG Clinique Clermont-Ferrand avec Bookea.",
};

export default function JfgCliniqueClermontPage() {
  return <PublicBooking />;
}
