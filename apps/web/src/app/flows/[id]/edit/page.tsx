import type { Metadata } from "next";
import { EditFlow } from "@/components/flow-editor";

export const metadata: Metadata = { title: "Edit flow" };

export default async function EditFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // key: a different flow id remounts the editor with fresh state.
  return <EditFlow key={id} id={id} />;
}
