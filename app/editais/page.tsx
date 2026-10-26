import type { Metadata } from "next";
import { EditaisHome } from "@/components/EditaisHome";

export const metadata: Metadata = { title: "Editais" };

export default function Page() {
  return <EditaisHome />;
}
