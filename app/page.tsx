import type { Metadata } from "next";
import { PublicBooking } from "@/components/public/public-booking";

export const metadata: Metadata = {
  title: "Trouvez un soin, réservez, brillez",
  description:
    "Cherchez une prestation, comparez les prix et bloquez votre rendez-vous esthétique en quelques secondes avec Bookea.",
};

export default function Home() {
  return <PublicBooking />;
}
