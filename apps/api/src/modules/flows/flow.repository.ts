import type { CreateFlowInput, Flow, FlowSummary, LastRun, UpdateFlowInput } from "@flowlet/shared";

/** A flow list item as stored: everything in FlowSummary except the run data from Postgres. */
export type FlowListItem = Omit<FlowSummary, "lastRun">;

/** Storage for flow definitions. MongoFlowRepository in production, an in-memory one in tests. */
export interface FlowRepository {
  create(input: CreateFlowInput): Promise<Flow>;
  /** Newest first, without steps or secret. */
  list(limit: number): Promise<FlowListItem[]>;
  /** null for an unknown or malformed id. */
  findById(id: string): Promise<Flow | null>;
  update(id: string, patch: UpdateFlowInput): Promise<Flow | null>;
  /** false when nothing was deleted. */
  delete(id: string): Promise<boolean>;
}

/** The run-history operations the flow routes need (implemented by the run repository). */
export interface FlowRunsPort {
  latestByFlowIds(flowIds: string[]): Promise<Map<string, LastRun>>;
  deleteByFlow(flowId: string): Promise<void>;
}

export const FLOW_LIST_LIMIT = 100;

/** 32 random bytes as hex: the key for the flow's webhook HMAC. */
export function generateWebhookSecret(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");
}
