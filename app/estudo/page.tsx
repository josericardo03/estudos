import type { Metadata } from "next";
import { Suspense } from "react";
import { Estudo } from "@/components/Estudo";

export const metadata: Metadata = { title: "Estudo" };

export default function Page() {
  return (
    <Suspense fallback={<p className="px-5 py-10 text-muted">Abrindo o estudo…</p>}>
      <Estudo />
    </Suspense>
  );
}
