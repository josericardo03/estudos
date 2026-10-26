"use client";

import { useParams, useSearchParams } from "next/navigation";
import { LeitorPdf } from "./LeitorPdf";

export function LeitorRota() {
  const params = useParams<{ id: string; pdfId: string }>();
  const busca = useSearchParams();
  const materiaId = Array.isArray(params.id) ? params.id[0] : params.id;
  const pdfId = Array.isArray(params.pdfId) ? params.pdfId[0] : params.pdfId;
  const pagina = Number(busca.get("pagina") || "1");
  return (
    <LeitorPdf
      key={pdfId}
      materiaId={materiaId}
      pdfId={pdfId}
      paginaInicial={Number.isFinite(pagina) && pagina > 0 ? pagina : 1}
      marcaInicial={busca.get("marca")}
    />
  );
}
