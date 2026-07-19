import { AsobiClient } from "./client.js";
import type {
  WalletHistoryParams,
  PurchaseParams,
  PurchaseResult,
  IapAppleParams,
  IapGoogleParams,
  IapAppleResult,
  IapGoogleResult,
  WalletsResponse,
  WalletHistoryResponse,
  StoreResponse,
} from "./types.js";

const PREFIX = "/api/v1";

export class EconomyApi {
  constructor(private client: AsobiClient) {}

  wallets(): Promise<WalletsResponse> {
    return this.client.get<WalletsResponse>(`${PREFIX}/wallets`);
  }

  history(currency: string, params?: WalletHistoryParams): Promise<WalletHistoryResponse> {
    return this.client.get<WalletHistoryResponse>(
      `${PREFIX}/wallets/${currency}/history`,
      params as Record<string, unknown>,
    );
  }

  store(): Promise<StoreResponse> {
    return this.client.get<StoreResponse>(`${PREFIX}/store`);
  }

  purchase(params: PurchaseParams): Promise<PurchaseResult> {
    return this.client.post<PurchaseResult>(`${PREFIX}/store/purchase`, params);
  }

  verifyApple(params: IapAppleParams): Promise<IapAppleResult> {
    return this.client.post<IapAppleResult>(`${PREFIX}/iap/apple`, params);
  }

  verifyGoogle(params: IapGoogleParams): Promise<IapGoogleResult> {
    return this.client.post<IapGoogleResult>(`${PREFIX}/iap/google`, params);
  }
}
