import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { Suspense } from "react";
import { AutoCronometro } from "@/components/AutoCronometro";
import { Autenticacao } from "@/components/Autenticacao";
import { Cabecalho } from "@/components/Cabecalho";
import { Inicializador } from "@/components/Inicializador";
import { SCRIPT_TEMA } from "@/lib/tema";
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
  appleWebApp: { capable: true, title: "Foco", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#16201b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${outfit.variable} ${fraunces.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Inicializador />
        <Autenticacao>
          <AutoCronometro />
          <Suspense fallback={<div className="border-b border-line" style={{ height: "var(--header-h)" }} />}>
            <Cabecalho />
          </Suspense>
          <div id="conteudo" className="flex-1">
            {children}
          </div>
        </Autenticacao>
      </body>
    </html>
  );
}
