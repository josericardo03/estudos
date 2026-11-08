import type { Metadata } from "next";
import { Dados } from "@/components/Dados";

export const metadata: Metadata = { title: "Dados" };

export default function Page() {
  return <Dados />;
}
