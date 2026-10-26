import type { Metadata } from "next";
import { Suspense } from "react";
import { BlocoRota } from "@/components/BlocoRota";

export const metadata: Metadata = { title: "Bloco" };

export default function Page() {
  return (
    <Suspense fallback={<p className="px-5 py-10 text-muted">Abrindo o bloco…</p>}>
      <BlocoRota />
    </Suspense>
  );
}
