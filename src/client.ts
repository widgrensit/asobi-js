import type {
  AsobiClientOptions,
  ApiError,
  RefreshResponse,
  TokenPair,
} from "./types.js";

export class AsobiError extends Error {
  status: number;
  body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.error ?? `HTTP ${status}`);
    this.name = "AsobiError";
    this.status = status;
    this.body = body;
  }
}

export class AsobiAuthExpiredError extends Error {
  cause?: unknown;

  constructor(message = "Authentication expired. Please log in again.", cause?: unknown) {
    super(message);
    this.name = "AsobiAuthExpiredError";
    this.cause = cause;
  }
}

const REFRESH_PATH = "/api/v1/auth/refresh";

export class AsobiClient {
  readonly baseUrl: string;
  private accessToken: string | undefined;
  private refreshToken: string | undefined;
  private onTokens: ((tokens: TokenPair) => void) | undefined;
  private refreshInFlight: Promise<void> | null = null;

  constructor(options: AsobiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken;
    this.onTokens = options.onTokens;
  }

  setTokens(accessToken: string | undefined, refreshToken: string | undefined): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.onTokens?.({ accessToken, refreshToken });
  }

  clearTokens(): void {
    this.setTokens(undefined, undefined);
  }

  getAccessToken(): string | undefined {
    return this.accessToken;
  }

  getRefreshToken(): string | undefined {
    return this.refreshToken;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.accessToken) {
      h["Authorization"] = `Bearer ${this.accessToken}`;
    }
    return h;
  }

  private qs(params?: Record<string, unknown>): string {
    if (!params) return "";
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
      }
    }
    return parts.length > 0 ? `?${parts.join("&")}` : "";
  }

  private isAuthPath(path: string): boolean {
    return path.includes("/auth/");
  }

  private async refreshTokens(): Promise<void> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.doRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<void> {
    const refreshToken = this.refreshToken;
    if (!refreshToken) {
      throw new AsobiAuthExpiredError();
    }
    const url = `${this.baseUrl}${REFRESH_PATH}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch (err) {
      throw new AsobiAuthExpiredError("Token refresh failed.", err);
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.clearTokens();
      throw new AsobiAuthExpiredError("Token refresh rejected.", new AsobiError(res.status, json as ApiError));
    }
    const pair = json as RefreshResponse;
    this.setTokens(pair.access_token, pair.refresh_token);
  }

  async request<T>(method: string, path: string, body?: unknown, query?: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}${path}${this.qs(query)}`;
    const buildInit = (): RequestInit => {
      const init: RequestInit = {
        method,
        headers: this.headers(),
      };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
      }
      return init;
    };

    let res = await fetch(url, buildInit());

    if (res.status === 401 && !this.isAuthPath(path) && this.refreshToken) {
      await this.refreshTokens();
      res = await fetch(url, buildInit());
    }

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new AsobiError(res.status, json as ApiError);
    }

    return json as T;
  }

  get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>("GET", path, undefined, query);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("DELETE", path, body);
  }
}
