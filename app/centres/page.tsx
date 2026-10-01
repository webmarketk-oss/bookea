import type { Metadata } from "next";
import { PublicBooking } from "@/components/public/public-booking";

export const metadata: Metadata = {
  title: "Fiche centre | Bookea",
  description: "Découvrez le centre et réservez un rendez-vous avec Bookea.",
};

export default function CentresIndexPage() {
  return <PublicBooking />;
}
