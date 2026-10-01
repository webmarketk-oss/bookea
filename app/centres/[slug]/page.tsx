import type { Metadata } from "next";
import { PublicBooking } from "@/components/public/public-booking";

export const metadata: Metadata = {
  title: "Fiche centre | Bookea",
  description: "Découvrez le centre et réservez un rendez-vous avec Bookea.",
};

export function generateStaticParams() {
  return [
    { slug: "jfg-clinic-clermont" },
    { slug: "jfg-clinique-clermont" },
  ];
}

export const dynamicParams = false;

export default function CentrePublicPage() {
  return <PublicBooking />;
}
