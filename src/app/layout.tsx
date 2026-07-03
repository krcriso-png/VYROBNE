import type { Metadata } from "next";
import "./globals.css";
import { CookieConsent } from "@/components/CookieConsent";

export const metadata: Metadata = {
  metadataBase: new URL("https://klikado.sk"),
  title: {
    default: "Klikado — jeden inzerát na Bazoš, Bazar.sk a ďalšie naraz",
    template: "%s · Klikado",
  },
  description:
    "Vytvor inzerát raz a Klikado ho automaticky pridá a udrží hore na Bazoš SK, Bazoš CZ a Bazar.sk. Automatické topovanie, jedno miesto na správu. Vyskúšaj 7 dní zadarmo.",
  keywords: [
    "inzercia",
    "Bazoš",
    "Bazar.sk",
    "hromadné pridávanie inzerátov",
    "topovanie inzerátov",
    "predaj online",
    "inzertné portály",
  ],
  openGraph: {
    type: "website",
    locale: "sk_SK",
    url: "https://klikado.sk",
    siteName: "Klikado",
    title: "Jeden inzerát. Všetky portály. Automaticky.",
    description:
      "Pridaj inzerát raz — Klikado ho zverejní a udrží hore na Bazoš SK, Bazoš CZ a Bazar.sk. Ušetri hodiny opakovaného klikania.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Klikado — jeden inzerát, všetky portály",
    description:
      "Pridaj inzerát raz, Klikado ho zverejní a topuje na viacerých portáloch naraz.",
  },
  alternates: { canonical: "https://klikado.sk" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sk" suppressHydrationWarning>
      <head>
        {/* Inter loaded at runtime to keep the build network-independent. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
