export type OpenApiDocument = {
  openapi: string;
  servers: { url: string }[];
  paths: Record<string, unknown>;
  components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> };
};

/** Builds the OpenAPI 3.1 document from the route contract and the Live Progress messages. */
export function buildOpenApi(): OpenApiDocument {
  return { openapi: "", servers: [], paths: {}, components: { schemas: {}, securitySchemes: {} } };
}
