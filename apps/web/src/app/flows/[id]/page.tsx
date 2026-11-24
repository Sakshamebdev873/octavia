import type { Metadata } from "next";
import { FlowDetail } from "@/components/flow-detail";

export const metadata: Metadata = { title: "Flow" };

export default async function FlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FlowDetail key={id} id={id} />;
}
