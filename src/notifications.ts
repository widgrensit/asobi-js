import { AsobiClient } from "./client.js";
import type { NotificationListParams, NotificationsResponse } from "./types.js";

const PREFIX = "/api/v1/notifications";

export class NotificationsApi {
  constructor(private client: AsobiClient) {}

  list(params?: NotificationListParams): Promise<NotificationsResponse> {
    return this.client.get<NotificationsResponse>(PREFIX, params as Record<string, unknown>);
  }

  markRead(id: string): Promise<Record<string, unknown>> {
    return this.client.put(`${PREFIX}/${id}/read`);
  }

  delete(id: string): Promise<void> {
    return this.client.delete(`${PREFIX}/${id}`);
  }
}
