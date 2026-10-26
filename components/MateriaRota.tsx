"use client";

import { useParams } from "next/navigation";
import { MateriaDetalhe } from "./MateriaDetalhe";

export function MateriaRota() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <MateriaDetalhe key={id} materiaId={id} />;
}
