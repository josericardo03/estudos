import type { Metadata } from "next";
import { Suspense } from "react";
import { CadernoRota } from "@/components/CadernoRota";

export const metadata: Metadata = { title: "Cadernão" };

export default function Page() {
  return (
    <Suspense fallback={<p className="px-5 py-10 text-muted">Abrindo o cadernão…</p>}>
      <CadernoRota />
    </Suspense>
  );
}
