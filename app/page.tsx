import type { Metadata } from "next";
import { MateriasHome } from "@/components/MateriasHome";

export const metadata: Metadata = { title: "Matérias" };

export default function Page() {
  return <MateriasHome />;
}
