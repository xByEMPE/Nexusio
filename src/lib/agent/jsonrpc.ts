/**
 * Manejador JSON-RPC 2.0 del servidor MCP «Streamable HTTP» sin estado.
 * Puro: recibe el cuerpo ya parseado y devuelve estado HTTP y cuerpo.
 * Lotes (arrays) no se admiten (el MCP 2025-06-18 los retiró): se responden con -32600.
 */
import { z } from "zod";
import {
  AGENT_SERVER,
  PUBLIC_TOOLS,
  TOOL_INPUT_SCHEMAS,
  isPublicToolName,
  runPublicTool,
  type ToolContext,
} from "./tools";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;

export const RPC = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  rateLimited: -32029,
} as const;

export type RpcId = string | number | null;

export interface RpcErrorBody {
  readonly jsonrpc: "2.0";
  readonly id: RpcId;
  readonly error: { readonly code: number; readonly message: string; readonly data?: unknown };
}
export interface RpcResultBody {
  readonly jsonrpc: "2.0";
  readonly id: RpcId;
  readonly result: unknown;
}
export type RpcBody = RpcErrorBody | RpcResultBody;

export interface RpcOutcome {
  readonly status: 200 | 202 | 400;
  /** null cuando no hay cuerpo (notificaciones y respuestas del cliente). */
  readonly body: RpcBody | null;
}

export function rpcError(id: RpcId, code: number, message: string, data?: unknown): RpcErrorBody {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

const IdSchema = z.union([z.string().max(200), z.number().finite()]);

const RequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: IdSchema,
  method: z.string().min(1).max(100),
  params: z.record(z.string(), z.unknown()).optional(),
});

const NotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1).max(100),
  params: z.record(z.string(), z.unknown()).optional(),
});

const InitializeParams = z.object({
  protocolVersion: z.string().min(1).max(40),
  capabilities: z.record(z.string(), z.unknown()).optional(),
  clientInfo: z.object({ name: z.string().max(200), version: z.string().max(100).optional() }).passthrough().optional(),
});

const CallParams = z.object({
  name: z.string().min(1).max(100),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

export function negotiateProtocolVersion(requested: string): string {
  return (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
}

function ok(id: RpcId, result: unknown): RpcOutcome {
  return { status: 200, body: { jsonrpc: "2.0", id, result } };
}

function err(id: RpcId, code: number, message: string, data?: unknown): RpcOutcome {
  return { status: 200, body: rpcError(id, code, message, data) };
}

function issues(e: z.ZodError) {
  return e.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message }));
}

export function handleRpc(raw: unknown, ctx: ToolContext): RpcOutcome {
  if (Array.isArray(raw)) {
    return { status: 400, body: rpcError(null, RPC.invalidRequest, "Los lotes (batch) no se admiten: envíe un mensaje por petición.") };
  }
  if (raw === null || typeof raw !== "object") {
    return { status: 400, body: rpcError(null, RPC.invalidRequest, "El cuerpo debe ser un objeto JSON-RPC 2.0.") };
  }
  const obj = raw as Record<string, unknown>;

  // Respuesta de cliente a una petición del servidor (no enviamos ninguna): se acepta y se ignora.
  if (!("method" in obj) && ("result" in obj || "error" in obj)) return { status: 202, body: null };

  // Notificación (sin id).
  if (!("id" in obj)) {
    const n = NotificationSchema.safeParse(obj);
    if (!n.success) return { status: 400, body: rpcError(null, RPC.invalidRequest, "Notificación JSON-RPC inválida.", issues(n.error)) };
    return { status: 202, body: null };
  }

  const req = RequestSchema.safeParse(obj);
  if (!req.success) {
    const id = IdSchema.safeParse(obj.id);
    return { status: 400, body: rpcError(id.success ? id.data : null, RPC.invalidRequest, "Petición JSON-RPC inválida.", issues(req.error)) };
  }
  const { id, method, params } = req.data;

  switch (method) {
    case "initialize": {
      const p = InitializeParams.safeParse(params);
      if (!p.success) return err(id, RPC.invalidParams, "Parámetros de initialize inválidos.", issues(p.error));
      return ok(id, {
        protocolVersion: negotiateProtocolVersion(p.data.protocolVersion),
        capabilities: { tools: {} },
        serverInfo: { name: AGENT_SERVER.name, title: AGENT_SERVER.title, version: AGENT_SERVER.version },
        instructions: AGENT_SERVER.description,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: PUBLIC_TOOLS });
    case "tools/call": {
      const p = CallParams.safeParse(params);
      if (!p.success) return err(id, RPC.invalidParams, "Parámetros de tools/call inválidos.", issues(p.error));
      if (!isPublicToolName(p.data.name)) return err(id, RPC.invalidParams, `Herramienta desconocida: ${p.data.name}`);
      const args = TOOL_INPUT_SCHEMAS[p.data.name].safeParse(p.data.arguments ?? {});
      if (!args.success) return err(id, RPC.invalidParams, "Argumentos inválidos.", issues(args.error));
      try {
        return ok(id, runPublicTool(p.data.name, args.data as Record<string, unknown>, ctx));
      } catch {
        return err(id, RPC.internal, "Error interno al ejecutar la herramienta.");
      }
    }
    default:
      return err(id, RPC.methodNotFound, `Método no encontrado: ${method}`);
  }
}
