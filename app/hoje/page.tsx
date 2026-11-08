import type { Metadata } from "next";
import { Hoje } from "@/components/Hoje";

export const metadata: Metadata = { title: "Hoje" };

export default function Page() {
  return <Hoje />;
}
