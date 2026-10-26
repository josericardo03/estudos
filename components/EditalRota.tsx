"use client";

import { useParams } from "next/navigation";
import { EditalDetalhe } from "./EditalDetalhe";

export function EditalRota() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <EditalDetalhe key={id} editalId={id} />;
}
