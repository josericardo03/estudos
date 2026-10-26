"use client";

import { useParams } from "next/navigation";
import { BlocoDetalhe } from "./BlocoDetalhe";

export function BlocoRota() {
  const params = useParams<{ id: string; pdfId: string; blocoId: string }>();
  const materiaId = Array.isArray(params.id) ? params.id[0] : params.id;
  const pdfId = Array.isArray(params.pdfId) ? params.pdfId[0] : params.pdfId;
  const blocoId = Array.isArray(params.blocoId) ? params.blocoId[0] : params.blocoId;
  return <BlocoDetalhe key={blocoId} materiaId={materiaId} pdfId={pdfId} blocoId={blocoId} />;
}
