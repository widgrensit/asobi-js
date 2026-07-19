import { AsobiClient } from "./client.js";
import type { ConsumeParams, InventoryListResponse } from "./types.js";

const PREFIX = "/api/v1/inventory";

export class InventoryApi {
  constructor(private client: AsobiClient) {}

  list(): Promise<InventoryListResponse> {
    return this.client.get<InventoryListResponse>(PREFIX);
  }

  consume(params: ConsumeParams): Promise<Record<string, unknown>> {
    return this.client.post(`${PREFIX}/consume`, params);
  }
}
