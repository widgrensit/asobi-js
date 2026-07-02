import { AsobiClient } from "./client.js";
import type {
  RegisterParams,
  LoginParams,
  AuthResponse,
  RefreshResponse,
  OAuthParams,
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
