import { z, type ZodType } from "zod";
import { ROUTES, type Route } from "./api/contract.js";
import { COMPONENTS } from "./api/schemas.js";

export type OpenApiDocument = {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: { url: string }[];
  paths: Record<string, unknown>;
  components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> };
};

type JsonSchema = { properties?: Record<string, unknown>; required?: string[]; [key: string]: unknown };

// OpenAPI 3.1 uses JSON Schema 2020-12, zod's default target; drop the per-schema $schema it adds.
function jsonSchema(schema: ZodType, io: "input" | "output"): JsonSchema {
  const { $schema, ...rest } = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as JsonSchema;
  void $schema;
  return rest;
}

function parameters(schema: z.ZodObject | undefined, place: "path" | "query") {
  if (!schema) return [];
  const { properties = {}, required = [] } = jsonSchema(schema, "input");
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: place,
    required: place === "path" || required.includes(name),
    schema: property,
  }));
}

function operation(route: Route) {
  return {
    summary: route.summary,
    ...(route.description ? { description: route.description } : {}),
    security: route.auth ? [{ bearer: [] }] : [],
    parameters: [...parameters(route.params, "path"), ...parameters(route.query, "query")],
    ...(route.body
      ? {
          requestBody: { required: true, content: { "application/json": { schema: jsonSchema(route.body, "input") } } },
        }
      : {}),
    responses: Object.fromEntries(
      Object.entries(route.responses).map(([status, { description, schema }]) => [
        status,
        schema
          ? { description, content: { "application/json": { schema: jsonSchema(schema, "output") } } }
          : { description },
      ]),
    ),
  };
}

/** Builds the OpenAPI 3.1 document from the route contract and the Live Progress messages. */
export function buildOpenApi(): OpenApiDocument {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of ROUTES) {
    const path = route.path.replace(/[:*](\w+)/g, "{$1}"); // Express :id and *rest become {id} and {rest}
    paths[path] = { ...paths[path], [route.method]: operation(route) };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Jevwright API",
      version: "1.0.0",
      description:
        "Projects, Test Files, and Runs of Jevwright (docs/tech/backend.md). Send the JWT from /auth/login as a Bearer token.",
    },
    servers: [{ url: "/api/v1" }],
    paths,
    components: {
      schemas: Object.fromEntries(
        Object.entries(COMPONENTS).map(([name, schema]) => [name, jsonSchema(schema, "output")]),
      ),
      securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    },
  };
}
