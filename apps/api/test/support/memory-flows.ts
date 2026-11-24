import type { CreateFlowInput, Flow, UpdateFlowInput } from "@flowlet/shared";
import { ObjectId } from "mongodb";
import {
  generateWebhookSecret,
  type FlowListItem,
  type FlowRepository,
} from "../../src/modules/flows/flow.repository";

/** In-memory FlowRepository for API tests. Same contract as MongoFlowRepository. */
export class InMemoryFlowRepository implements FlowRepository {
  readonly flows = new Map<string, Flow>();

  async create(input: CreateFlowInput): Promise<Flow> {
    const now = new Date().toISOString();
    const flow: Flow = {
      id: new ObjectId().toHexString(),
      name: input.name,
      description: input.description ?? null,
      enabled: input.enabled,
      steps: input.steps,
      webhookSecret: generateWebhookSecret(),
      createdAt: now,
      updatedAt: now,
    };
    this.flows.set(flow.id, flow);
    return structuredClone(flow);
  }

  async list(limit: number): Promise<FlowListItem[]> {
    return [...this.flows.values()]
      .reverse()
      .slice(0, limit)
      .map(({ steps, webhookSecret: _secret, ...rest }) => ({ ...rest, stepCount: steps.length }));
  }

  async findById(id: string): Promise<Flow | null> {
    const flow = this.flows.get(id);
    return flow ? structuredClone(flow) : null;
  }

  async update(id: string, patch: UpdateFlowInput): Promise<Flow | null> {
    const flow = this.flows.get(id);
    if (!flow) return null;
    const updated: Flow = {
      ...flow,
      name: patch.name ?? flow.name,
      description: patch.description !== undefined ? patch.description : flow.description,
      enabled: patch.enabled ?? flow.enabled,
      steps: patch.steps ?? flow.steps,
      updatedAt: new Date().toISOString(),
    };
    this.flows.set(id, updated);
    return structuredClone(updated);
  }

  async delete(id: string): Promise<boolean> {
    return this.flows.delete(id);
  }
}
