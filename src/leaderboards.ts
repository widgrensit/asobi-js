import { AsobiClient } from "./client.js";
import type { LeaderboardEntry, LeaderboardTopParams, SubmitScoreParams, LeaderboardEntriesResponse} from "./types.js";

const PREFIX = "/api/v1/leaderboards";

export class LeaderboardsApi {
  constructor(private client: AsobiClient) {}

  top(id: string, params?: LeaderboardTopParams): Promise<LeaderboardEntriesResponse> {
    return this.client.get<LeaderboardEntriesResponse>(`${PREFIX}/${id}`, params as Record<string, unknown>);
  }

  submit(id: string, params: SubmitScoreParams): Promise<LeaderboardEntry> {
    return this.client.post<LeaderboardEntry>(`${PREFIX}/${id}`, params);
  }

  around(id: string, playerId: string): Promise<LeaderboardEntriesResponse> {
    return this.client.get<LeaderboardEntriesResponse>(`${PREFIX}/${id}/around/${playerId}`);
  }
}
