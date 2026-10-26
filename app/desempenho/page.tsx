import type { Metadata } from "next";
import { Desempenho } from "@/components/Desempenho";

export const metadata: Metadata = { title: "Desempenho" };

export default function Page() {
  return <Desempenho />;
}
