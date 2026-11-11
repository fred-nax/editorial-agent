import { Inter, Geist } from "next/font/google";
import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Naxialis Content Agent",
    template: "%s · Naxialis Content Agent",
  },
  description:
    "Back-office privé pour piloter l’agent éditorial Naxialis et les brouillons WordPress.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={cn("font-sans", geist.variable)}>
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
