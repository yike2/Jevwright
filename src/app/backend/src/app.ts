import express, { type Express, type Request, type RequestHandler, type Response } from "express";
import swaggerUi from "swagger-ui-express";
import { ROUTES, type Route } from "./api/contract.js";
import { requireToken } from "./http/auth.js";
import { ApiError, errorHandler } from "./http/errors.js";
import { buildOpenApi } from "./openapi.js";

// userId is the token's user on every route that takes a token; routes with auth "none" get none.
export type HandlerInput = { params: unknown; query: unknown; body: unknown; userId?: string };
export type Handler = (input: HandlerInput, res: Response, req: Request) => unknown;
export type Handlers = Partial<Record<string, Handler>>; // keyed "<method> <path>", e.g. "get /projects"

export type AppDeps = {
  corsOrigin: string;
  handlers: Handlers;
  verifyToken: (token: string) => Promise<string | undefined>; // the token's user id
};

// A 256 Ki character source can double in JSON escaping; the source schema enforces its own limit.
const BODY_LIMIT = "1mb";

/** Builds the Express app: CORS, JSON parsing, the contract routes, the API docs, and JSON errors. */
export function createApp(deps: AppDeps): Express {
  const app = express();
  const openApi = buildOpenApi();
  const api = express.Router();

  api.use(cors(deps.corsOrigin));
  api.use(express.json({ limit: BODY_LIMIT }));
  api.use("/docs", swaggerUi.serve, swaggerUi.setup(openApi));
  for (const route of ROUTES)
    api[route.method](
      route.path,
      requireToken(route.auth, deps.verifyToken),
      validate(route),
      handle(route, deps, openApi),
    );
  api.use((req) => {
    throw new ApiError("not_found", `${req.method} ${req.originalUrl} does not exist`);
  });

  app.use("/api/v1", api);
  app.use(errorHandler);
  return app;
}

function cors(origin: string): RequestHandler {
  return (req, res, next) => {
    if (req.headers.origin !== origin) return next();
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
    if (req.method !== "OPTIONS") return next();
    res.setHeader("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE");
    res.setHeader("access-control-allow-headers", "authorization, content-type");
    res.status(204).end();
  };
}

// Parses params, query, and body with the route's schemas, keeping the parsed values for the handler.
function validate(route: Route): RequestHandler {
  return (req, res, next) => {
    // Express 5 gives a *wildcard as an array of segments; the contract treats it as one path.
    const rawParams = Object.fromEntries(
      Object.entries(req.params).map(([key, value]) => [key, Array.isArray(value) ? value.join("/") : value]),
    );
    const parts = [
      ["params", route.params, rawParams],
      ["query", route.query, req.query],
      ["body", route.body, req.body],
    ] as const;
    const input: Record<string, unknown> = {
      params: rawParams,
      query: req.query,
      body: req.body,
      userId: res.locals.userId,
    };
    const issues: { path: string; message: string; tooBig: boolean }[] = [];
    for (const [part, schema, value] of parts) {
      if (!schema) continue;
      const parsed = schema.safeParse(value ?? {});
      if (parsed.success) input[part] = parsed.data;
      else
        issues.push(
          ...parsed.error.issues.map((issue) => ({
            path: [part, ...issue.path].join("."),
            message: issue.message,
            tooBig: issue.code === "too_big",
          })),
        );
    }
    // Content over a size limit is 413 like a body over 1 MB; it wins over other issues, as that check does.
    const tooLarge = issues.find((issue) => issue.tooBig && route.sizeLimited?.includes(issue.path));
    if (tooLarge)
      return next(new ApiError("too_large", `${tooLarge.path} is over its size limit: ${tooLarge.message}`));
    if (issues.length > 0)
      return next(
        new ApiError(
          "invalid_request",
          "The request fails its schema",
          issues.map(({ path, message }) => ({ path, message })),
        ),
      );
    res.locals.input = input;
    next();
  };
}

function handle(route: Route, deps: AppDeps, openApi: object): RequestHandler {
  const key = `${route.method} ${route.path}`;
  if (key === "get /health") return (_req, res) => void res.json({ status: "ok" });
  if (key === "get /openapi.json") return (_req, res) => void res.json(openApi);
  const handler = deps.handlers[key];
  return async (req, res) => {
    if (!handler)
      throw new ApiError("not_implemented", `${route.method.toUpperCase()} ${route.path} is not implemented yet`);
    await handler(res.locals.input as HandlerInput, res, req);
  };
}
