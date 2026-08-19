import type { Metadata } from "next";
import { PublicBooking } from "@/components/public/public-booking";

export const metadata: Metadata = {
  title: "Trouvez un soin, réservez, brillez",
  description:
    "Recherchez un centre, comparez les prestations et réservez votre rendez-vous esthétique avec Bookea.",
};

export default function ClientPage() {
  return <PublicBooking />;
}
