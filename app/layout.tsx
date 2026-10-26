import type { Metadata } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { Suspense } from "react";
import { Cabecalho } from "@/components/Cabecalho";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Foco",
    template: "%s · Foco",
  },
  description: "Estudo por blocos, cadernão e banco de questões.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${outfit.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Suspense fallback={<div className="border-b border-line" style={{ height: "var(--header-h)" }} />}>
          <Cabecalho />
        </Suspense>
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
