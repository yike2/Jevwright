import type { components, paths } from "./api-schema.js";

export type User = components["schemas"]["User"];
export type Diagnostic = components["schemas"]["Diagnostic"];
export type LoginResponse = paths["/auth/login"]["post"]["responses"][200]["content"]["application/json"];
export type RegisterResponse = paths["/auth/register"]["post"]["responses"][201]["content"]["application/json"];

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type RequestOptions = {
  skipAuthRedirect?: boolean;
};

export type ApiClientConfig = {
  baseUrl?: string;
  getToken?: () => string | null;
  setToken?: (token: string | null) => void;
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
};

const KNOWN_ERROR_CODES = new Set([
  "invalid_request",
  "unauthorized",
  "not_found",
  "conflict",
  "too_large",
  "invalid_test",
  "internal",
  "not_implemented",
]);

function readStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem("auth-token");
}

function writeStoredToken(token: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (token === null) {
    window.localStorage.removeItem("auth-token");
    return;
  }

  window.localStorage.setItem("auth-token", token);
}

export function parseApiError(payload: unknown): {
  code: string;
  message: string;
  details?: unknown;
} {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object"
  ) {
    const error = payload.error as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
    };

    const code = typeof error.code === "string" ? error.code : "internal";
    const message = typeof error.message === "string" ? error.message : "Internal server error";

    return {
      code: KNOWN_ERROR_CODES.has(code) ? code : "internal",
      message,
      details: error.details,
    };
  }

  return {
    code: "internal",
    message: "Internal server error",
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export function createApiClient(config: ApiClientConfig = {}): {
  setToken(token: string | null): void;
  clearToken(): void;
  getToken(): string | null;
  request<T>(path: string, init?: RequestInit, options?: RequestOptions): Promise<T>;
  login(email: string, password: string): Promise<LoginResponse>;
  register(email: string, password: string): Promise<RegisterResponse>;
  getCurrentUser(): Promise<User>;
} {
  const defaultBaseUrl = "http://localhost:4000/api/v1";
  const fetchImpl = config.fetchImpl ?? fetch;
  const defaultOnUnauthorized = () => {
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    }
  };

  let token = config.getToken ? config.getToken() : readStoredToken();

  const setToken = (nextToken: string | null): void => {
    token = nextToken;
    if (config.setToken) {
      config.setToken(nextToken);
      return;
    }
    writeStoredToken(nextToken);
  };

  const clearToken = (): void => {
    setToken(null);
  };

  const getToken = (): string | null => {
    return token;
  };

  const request = async <T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> => {
    const url = path.startsWith("http")
      ? path
      : `${(config.baseUrl ?? defaultBaseUrl).replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

    const headers = new Headers(init.headers ?? {});

    const currentToken = config.getToken ? config.getToken() : readStoredToken();
    if (currentToken) {
      headers.set("Authorization", `Bearer ${currentToken}`);
    }

    const response = await fetchImpl(url, {
      ...init,
      headers,
    });

    const text = await response.text();
    let payload: unknown = undefined;

    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const parsed = parseApiError(payload);
      const error = new ApiError(response.status, parsed.code, parsed.message, parsed.details);

      if (response.status === 401 && !options.skipAuthRedirect) {
        clearToken();
        if (config.onUnauthorized) {
          config.onUnauthorized();
        } else {
          defaultOnUnauthorized();
        }
      }

      throw error;
    }

    if (response.status === 204 || response.status === 205 || text.length === 0) {
      return undefined as T;
    }

    return (payload as T) ?? (undefined as T);
  };

  const login = async (email: string, password: string): Promise<LoginResponse> => {
    const body = await request<LoginResponse>(
      "/auth/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      },
      { skipAuthRedirect: true },
    );

    setToken(body.token);
    return body;
  };

  const register = async (email: string, password: string): Promise<RegisterResponse> => {
    const body = await request<RegisterResponse>(
      "/auth/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      },
      { skipAuthRedirect: true },
    );

    setToken(body.token);
    return body;
  };

  const getCurrentUser = async (): Promise<User> => {
    return request<User>("/auth/me");
  };

  return {
    setToken,
    clearToken,
    getToken,
    request,
    login,
    register,
    getCurrentUser,
  };
}

export const apiClient = createApiClient({
  onUnauthorized: () => {
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    }
  },
});
