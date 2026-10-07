import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

const cabinetGrotesk = localFont({
  src: "./fonts/CabinetGrotesk-Variable.woff2",
  variable: "--font-cabinet",
  display: "swap",
});

export const metadata: Metadata = {
  title: "over.to – Ověřovač zpráv Královéhradeckého kraje",
  description:
    "Prémiový fact-checkingový nástroj ověřující tvrzení a fámy pomocí otevřených dat Královéhradeckého kraje.",
  keywords: ["fact-checking", "Královéhradecký kraj", "otevřená data", "KHK", "over.to"],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="cs"
      className={`${geistSans.variable} ${geistMono.variable} ${cabinetGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-teal-500">{children}</body>
    </html>
  );
}
