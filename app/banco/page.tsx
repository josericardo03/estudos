import type { Metadata } from "next";
import { Suspense } from "react";
import { Banco } from "@/components/Banco";

export const metadata: Metadata = { title: "Banco" };

export default function Page() {
  return (
    <Suspense fallback={<p className="px-5 py-10 text-muted">Abrindo o banco…</p>}>
      <Banco />
    </Suspense>
  );
}
