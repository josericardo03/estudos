"use client";

import { useParams } from "next/navigation";
import { Caderno } from "./Caderno";

export function CadernoRota() {
  const params = useParams<{ id: string; pdfId: string }>();
  const materiaId = Array.isArray(params.id) ? params.id[0] : params.id;
  const pdfId = Array.isArray(params.pdfId) ? params.pdfId[0] : params.pdfId;
  return <Caderno key={pdfId} materiaId={materiaId} pdfId={pdfId} />;
}
