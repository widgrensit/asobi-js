import { AsobiClient } from "./client.js";
import type { Match, MatchListParams, MatchListResponse} from "./types.js";

const PREFIX = "/api/v1/matches";

export class MatchesApi {
  constructor(private client: AsobiClient) {}

  list(params?: MatchListParams): Promise<MatchListResponse> {
    return this.client.get<MatchListResponse>(PREFIX, params as Record<string, unknown>);
  }

  get(id: string): Promise<Match> {
    return this.client.get<Match>(`${PREFIX}/${id}`);
  }
}
