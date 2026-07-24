import { AsobiClient } from "./client.js";
import { loadOrCreate } from "./device.js";
import type {
  RegisterParams,
  LoginParams,
  AuthResponse,
  RefreshResponse,
  OAuthParams,
  GuestParams,
  GuestUpgradeParams,
  DeviceOptions,
  LinkProviderParams,
  UnlinkProviderParams,
  LogoutParams,
} from "./types.js";

const PREFIX = "/api/v1/auth";

export class AuthApi {
  constructor(private client: AsobiClient) {}

  async register(params: RegisterParams): Promise<AuthResponse> {
    const res = await this.client.post<AuthResponse>(`${PREFIX}/register`, params);
    this.client.setTokens(res.access_token, res.refresh_token);
    return res;
  }

  async login(params: LoginParams): Promise<AuthResponse> {
    const res = await this.client.post<AuthResponse>(`${PREFIX}/login`, params);
    this.client.setTokens(res.access_token, res.refresh_token);
    return res;
  }

  async oauth(params: OAuthParams): Promise<AuthResponse> {
    const res = await this.client.post<AuthResponse>(`${PREFIX}/oauth`, params);
    this.client.setTokens(res.access_token, res.refresh_token);
    return res;
  }

  async guest(params: GuestParams): Promise<AuthResponse> {
    const res = await this.client.post<AuthResponse>(`${PREFIX}/guest`, params);
    this.client.setTokens(res.access_token, res.refresh_token);
    return res;
  }

  // Opt-in convenience: load (or generate + persist) a device keypair and sign
  // in as a guest in one call. Equivalent to calling guest() with a
  // {device_id, device_secret} you manage yourself. opts is forwarded to
  // device.loadOrCreate (key/store/randomBytes/deviceId overrides).
  async guestDevice(opts: DeviceOptions = {}): Promise<AuthResponse> {
    return this.guest(loadOrCreate(opts));
  }

  async upgradeGuest(params: GuestUpgradeParams): Promise<AuthResponse> {
    const res = await this.client.post<AuthResponse>(`${PREFIX}/guest/upgrade`, params);
    this.client.setTokens(res.access_token, res.refresh_token);
    return res;
  }

  async refresh(): Promise<RefreshResponse> {
    const refreshToken = this.client.getRefreshToken();
    if (!refreshToken) {
      throw new Error("No refresh token available.");
    }
    const res = await this.client.post<RefreshResponse>(`${PREFIX}/refresh`, {
      refresh_token: refreshToken,
    });
    this.client.setTokens(res.access_token, res.refresh_token);
    return res;
  }

  async logout(params: LogoutParams = {}): Promise<void> {
    const refreshToken = params.refresh_token ?? this.client.getRefreshToken();
    try {
      await this.client.post(`${PREFIX}/logout`, { refresh_token: refreshToken });
    } finally {
      this.client.clearTokens();
    }
  }

  link(params: LinkProviderParams): Promise<Record<string, unknown>> {
    return this.client.post("/api/v1/auth/link", params);
  }

  unlink(params: UnlinkProviderParams): Promise<Record<string, unknown>> {
    return this.client.delete("/api/v1/auth/unlink", params);
  }
}
