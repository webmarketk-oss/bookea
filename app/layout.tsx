import type { Metadata } from "next";
import { AuthRecoveryGate } from "@/components/auth-recovery-gate";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Bookea — Le planning qui remplit votre agenda",
    template: "Bookea — %s",
  },
  description:
    "Gérez vos clients et votre activité avec Bookea, le CRM des centres esthétiques accompagné par Seya.",
  icons: {
    icon: "/bookea-b.svg",
    shortcut: "/bookea-b.svg",
    apple: "/bookea-b.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <AuthRecoveryGate />
        {children}
      </body>
    </html>
  );
}
