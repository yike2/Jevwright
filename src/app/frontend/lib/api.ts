import type { components, paths } from "./api-schema.js";

export type User = components["schemas"]["User"];
export type Diagnostic = components["schemas"]["Diagnostic"];
export type LoginResponse = paths["/auth/login"]["post"]["responses"][200]["content"]["application/json"];
export type RegisterResponse = paths["/auth/register"]["post"]["responses"][201]["content"]["application/json"];
export type TreeResponse = paths["/tree"]["get"]["responses"][200]["content"]["application/json"];
export type CreateProjectResponse = paths["/projects"]["post"]["responses"][201]["content"]["application/json"];
export type CreateModuleResponse =
  paths["/projects/{projectId}/modules"]["post"]["responses"][201]["content"]["application/json"];
export type CreateTestFileResponse =
  paths["/modules/{moduleId}/test-files"]["post"]["responses"][201]["content"]["application/json"];
export type TestFile = components["schemas"]["TestFile"];
export type Run = components["schemas"]["Run"];
export type RunListResponse = paths["/runs"]["get"]["responses"][200]["content"]["application/json"];
export type Step = components["schemas"]["Step"];
export type LiveMessage = components["schemas"]["LiveMessage"];
export type UpdateTestFileResponse =
  paths["/test-files/{testFileId}"]["patch"]["responses"][200]["content"]["application/json"];
export type UpdateProjectResponse =
  paths["/projects/{projectId}"]["patch"]["responses"][200]["content"]["application/json"];
export type UpdateModuleResponse =
  paths["/modules/{moduleId}"]["patch"]["responses"][200]["content"]["application/json"];
export type ValidateResponse = paths["/test-files/validate"]["post"]["responses"][200]["content"]["application/json"];
export type VariableListResponse =
  paths["/projects/{projectId}/variables"]["get"]["responses"][200]["content"]["application/json"];

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
  getBaseUrl(): string;
  request<T>(path: string, init?: RequestInit, options?: RequestOptions): Promise<T>;
  login(email: string, password: string): Promise<LoginResponse>;
  register(email: string, password: string): Promise<RegisterResponse>;
  getCurrentUser(): Promise<User>;
  getTree(): Promise<TreeResponse>;
  createProject(name: string): Promise<CreateProjectResponse>;
  createModule(projectId: string, name: string): Promise<CreateModuleResponse>;
  createTestFile(moduleId: string, name: string, source: string): Promise<CreateTestFileResponse>;
  getTestFile(testFileId: string): Promise<TestFile>;
  updateTestFile(testFileId: string, source: string): Promise<UpdateTestFileResponse>;
  validateSource(source: string): Promise<ValidateResponse>;
  startRun(testFileId: string): Promise<Run>;
  listVariables(projectId: string): Promise<VariableListResponse>;
  setVariable(projectId: string, name: string, value: string): Promise<void>;
  deleteVariable(projectId: string, name: string): Promise<void>;
  listRuns(testFileId: string): Promise<RunListResponse>;
  getRun(runId: string): Promise<Run>;
  renameProject(projectId: string, name: string): Promise<UpdateProjectResponse>;
  renameModule(moduleId: string, name: string): Promise<UpdateModuleResponse>;
  renameTestFile(testFileId: string, name: string): Promise<UpdateTestFileResponse>;
  deleteProject(projectId: string): Promise<void>;
  deleteModule(moduleId: string): Promise<void>;
  deleteTestFile(testFileId: string): Promise<void>;
} {
  const defaultBaseUrl = "http://127.0.0.1:4000/api/v1";
  const resolvedBaseUrl = (config.baseUrl ?? defaultBaseUrl).replace(/\/$/, "");
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
    const url = path.startsWith("http") ? path : `${resolvedBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;

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

  const getTree = async (): Promise<TreeResponse> => {
    return request<TreeResponse>("/tree");
  };

  const createProject = async (name: string): Promise<CreateProjectResponse> => {
    return request<CreateProjectResponse>("/projects", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
  };

  const createModule = async (projectId: string, name: string): Promise<CreateModuleResponse> => {
    return request<CreateModuleResponse>(`/projects/${projectId}/modules`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
  };

  const createTestFile = async (moduleId: string, name: string, source: string): Promise<CreateTestFileResponse> => {
    return request<CreateTestFileResponse>(`/modules/${moduleId}/test-files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, source }),
    });
  };

  const getTestFile = async (testFileId: string): Promise<TestFile> => {
    return request<TestFile>(`/test-files/${testFileId}`);
  };

  const updateTestFile = async (testFileId: string, source: string): Promise<UpdateTestFileResponse> => {
    return request<UpdateTestFileResponse>(`/test-files/${testFileId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ source }),
    });
  };

  const validateSource = async (source: string): Promise<ValidateResponse> => {
    return request<ValidateResponse>("/test-files/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ source }),
    });
  };

  const startRun = async (testFileId: string): Promise<Run> => {
    return request<Run>(`/test-files/${testFileId}/runs`, {
      method: "POST",
    });
  };

  const listVariables = async (projectId: string): Promise<VariableListResponse> => {
    return request<VariableListResponse>(`/projects/${projectId}/variables`);
  };

  const setVariable = async (projectId: string, name: string, value: string): Promise<void> => {
    await request<void>(`/projects/${projectId}/variables/${name}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value }),
    });
  };

  const deleteVariable = async (projectId: string, name: string): Promise<void> => {
    await request<void>(`/projects/${projectId}/variables/${name}`, {
      method: "DELETE",
    });
  };

  const getBaseUrl = (): string => {
    return resolvedBaseUrl;
  };

  const listRuns = async (testFileId: string): Promise<RunListResponse> => {
    const query = `/runs?testFileId=${encodeURIComponent(testFileId)}&limit=20`;
    return request<RunListResponse>(query);
  };

  const getRun = async (runId: string): Promise<Run> => {
    return request<Run>(`/runs/${runId}`);
  };

  const renameProject = async (_projectId: string, _name: string): Promise<UpdateProjectResponse> => {
    throw new Error("Not implemented");
  };

  const renameModule = async (_moduleId: string, _name: string): Promise<UpdateModuleResponse> => {
    throw new Error("Not implemented");
  };

  const renameTestFile = async (_testFileId: string, _name: string): Promise<UpdateTestFileResponse> => {
    throw new Error("Not implemented");
  };

  const deleteProject = async (_projectId: string): Promise<void> => {
    throw new Error("Not implemented");
  };

  const deleteModule = async (_moduleId: string): Promise<void> => {
    throw new Error("Not implemented");
  };

  const deleteTestFile = async (_testFileId: string): Promise<void> => {
    throw new Error("Not implemented");
  };

  return {
    setToken,
    clearToken,
    getToken,
    getBaseUrl,
    request,
    login,
    register,
    getCurrentUser,
    getTree,
    createProject,
    createModule,
    createTestFile,
    getTestFile,
    updateTestFile,
    validateSource,
    startRun,
    listVariables,
    setVariable,
    deleteVariable,
    listRuns,
    getRun,
    renameProject,
    renameModule,
    renameTestFile,
    deleteProject,
    deleteModule,
    deleteTestFile,
  };
}

export const apiClient = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL,
  onUnauthorized: () => {
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    }
  },
});
