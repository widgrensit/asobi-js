import { AsobiClient } from "./client.js";
import type {
  WorldInfo,
  WorldListResponse,
  WorldListParams,
  CreateWorldParams,
} from "./types.js";

const PREFIX = "/api/v1/worlds";

export class WorldsApi {
  constructor(private client: AsobiClient) {}

  list(params?: WorldListParams): Promise<WorldListResponse> {
    const qs: string[] = [];
    if (params?.mode) qs.push(`mode=${encodeURIComponent(params.mode)}`);
    if (params?.has_capacity) qs.push(`has_capacity=true`);
    const suffix = qs.length ? `?${qs.join("&")}` : "";
    return this.client.get<WorldListResponse>(`${PREFIX}${suffix}`);
  }

  get(worldId: string): Promise<WorldInfo> {
    return this.client.get<WorldInfo>(`${PREFIX}/${worldId}`);
  }

  create(params: CreateWorldParams): Promise<WorldInfo> {
    return this.client.post<WorldInfo>(PREFIX, params);
  }
}
