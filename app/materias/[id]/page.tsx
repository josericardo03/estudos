import type { Metadata } from "next";
import { Suspense } from "react";
import { MateriaRota } from "@/components/MateriaRota";

export const metadata: Metadata = { title: "Matéria" };

export default function Page() {
  return (
    <Suspense fallback={<p className="px-5 py-10 text-muted">Abrindo a matéria…</p>}>
      <MateriaRota />
    </Suspense>
  );
}
