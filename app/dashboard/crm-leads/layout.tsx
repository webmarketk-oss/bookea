import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CRM Prospects",
  description: "Gérez et suivez tous vos prospects Bookea.",
};

export default function CRMLeadsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
