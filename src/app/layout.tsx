import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inzeromat — jeden inzerát, všetky portály",
  description:
    "SaaS na správu a automatické publikovanie inzerátov na viacerých inzertných portáloch z jedného miesta.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sk" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
