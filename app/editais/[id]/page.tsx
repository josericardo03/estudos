import type { Metadata } from "next";
import { Suspense } from "react";
import { EditalRota } from "@/components/EditalRota";

export const metadata: Metadata = { title: "Edital" };

export default function Page() {
  return (
    <Suspense fallback={<p className="px-5 py-10 text-muted">Abrindo o edital…</p>}>
      <EditalRota />
    </Suspense>
  );
}
