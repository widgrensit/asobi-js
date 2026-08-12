import { AsobiClient } from "./client.js";
import type {
  SaveData,
  StorageItem,
  StorageListParams,
  SavesResponse,
  StorageListResponse,
  PutStorageParams,
} from "./types.js";

const PREFIX = "/api/v1";

export class StorageApi {
  constructor(private client: AsobiClient) {}

  // Cloud Saves
  listSaves(): Promise<SavesResponse> {
    return this.client.get<SavesResponse>(`${PREFIX}/saves`);
  }

  getSave(slot: string): Promise<SaveData> {
    return this.client.get<SaveData>(`${PREFIX}/saves/${slot}`);
  }

  // The blob travels under a `data` key; a bare body persists an empty map.
  putSave(slot: string, data: Record<string, unknown>): Promise<SaveData> {
    return this.client.put<SaveData>(`${PREFIX}/saves/${slot}`, { data });
  }

  // Generic Storage
  listStorage(collection: string, params?: StorageListParams): Promise<StorageListResponse> {
    return this.client.get<StorageListResponse>(
      `${PREFIX}/storage/${collection}`,
      params as Record<string, unknown>,
    );
  }

  getStorage(collection: string, key: string): Promise<StorageItem> {
    return this.client.get<StorageItem>(`${PREFIX}/storage/${collection}/${key}`);
  }

  // The object travels under a `value` key, alongside the optional perms; a
  // bare body persists an empty map and leaves both perms at "owner".
  putStorage(
    collection: string,
    key: string,
    value: Record<string, unknown>,
    params?: PutStorageParams,
  ): Promise<StorageItem> {
    return this.client.put<StorageItem>(`${PREFIX}/storage/${collection}/${key}`, {
      value,
      ...params,
    });
  }

  deleteStorage(collection: string, key: string): Promise<void> {
    return this.client.delete(`${PREFIX}/storage/${collection}/${key}`);
  }
}
