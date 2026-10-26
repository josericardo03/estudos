import type { Metadata } from "next";
import { Suspense } from "react";
import { LeitorRota } from "@/components/leitor/LeitorRota";

export const metadata: Metadata = { title: "PDF" };

export default function Page() {
  return (
    <Suspense fallback={<p className="px-5 py-10 text-muted">Abrindo o PDF…</p>}>
      <LeitorRota />
    </Suspense>
  );
}
