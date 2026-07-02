import { AsobiClient } from "./client.js";
import type {
  Wallet,
  WalletHistoryParams,
  Transaction,
  StoreListing,
  PurchaseParams,
  PurchaseResult,
  IapAppleParams,
  IapGoogleParams,
  IapAppleResult,
  IapGoogleResult,
} from "./types.js";

const PREFIX = "/api/v1";

export class EconomyApi {
  constructor(private client: AsobiClient) {}

  wallets(): Promise<Wallet[]> {
    return this.client.get<Wallet[]>(`${PREFIX}/wallets`);
  }

  history(currency: string, params?: WalletHistoryParams): Promise<Transaction[]> {
    return this.client.get<Transaction[]>(
      `${PREFIX}/wallets/${currency}/history`,
      params as Record<string, unknown>,
    );
  }

  store(): Promise<StoreListing[]> {
    return this.client.get<StoreListing[]>(`${PREFIX}/store`);
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
