import type { Metadata } from "next";
import { NewFlow } from "@/components/flow-editor";

export const metadata: Metadata = { title: "New flow" };

export default function NewFlowPage() {
  return <NewFlow />;
}
