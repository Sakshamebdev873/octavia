import type { Metadata } from "next";
import { FlowList } from "@/components/flow-list";

export const metadata: Metadata = { title: "Flows" };

export default function FlowsPage() {
  return <FlowList />;
}
