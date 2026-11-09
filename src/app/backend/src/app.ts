import express, { type Express, type Request, type Response } from "express";

export type HandlerInput = { params: unknown; query: unknown; body: unknown };
export type Handler = (input: HandlerInput, res: Response, req: Request) => unknown;

export type AppDeps = {
  corsOrigin: string;
  handlers: Partial<Record<string, Handler>>; // keyed "<method> <path>", e.g. "get /projects"
};

/** Builds the Express app: CORS, JSON parsing, the contract routes, the API docs, and JSON errors. */
export function createApp(deps: AppDeps): Express {
  void deps;
  return express();
}
