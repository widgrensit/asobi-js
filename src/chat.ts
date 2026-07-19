import { AsobiClient } from "./client.js";
import type { ChatHistoryParams, ChatHistoryResponse } from "./types.js";

const PREFIX = "/api/v1/chat";

export class ChatApi {
  constructor(private client: AsobiClient) {}

  history(channelId: string, params?: ChatHistoryParams): Promise<ChatHistoryResponse> {
    return this.client.get<ChatHistoryResponse>(
      `${PREFIX}/${channelId}/history`,
      params as Record<string, unknown>,
    );
  }
}
