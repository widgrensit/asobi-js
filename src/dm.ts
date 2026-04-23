import { AsobiClient } from "./client.js";
import type {
  SendDmParams,
  DmSendResult,
  DmHistoryResponse,
  DmHistoryParams,
} from "./types.js";

const PREFIX = "/api/v1/dm";

export class DirectMessagesApi {
  constructor(private client: AsobiClient) {}

  send(params: SendDmParams): Promise<DmSendResult> {
    return this.client.post<DmSendResult>(PREFIX, params);
  }

  history(otherPlayerId: string, params?: DmHistoryParams): Promise<DmHistoryResponse> {
    const suffix = params?.limit ? `?limit=${params.limit}` : "";
    return this.client.get<DmHistoryResponse>(`${PREFIX}/${otherPlayerId}/history${suffix}`);
  }
}
