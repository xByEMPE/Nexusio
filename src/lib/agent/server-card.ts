import { absoluteUrl, SITE } from "@/lib/seo";
import { AGENT_SERVER, PUBLIC_TOOLS } from "./tools";
import { SUPPORTED_PROTOCOL_VERSIONS } from "./jsonrpc";

/** Tarjeta de servidor MCP (borrador SEP-1649): apunta al endpoint real /api/mcp. */
export function buildServerCard() {
  return {
    name: AGENT_SERVER.name,
    title: AGENT_SERVER.title,
    version: AGENT_SERVER.version,
    description: AGENT_SERVER.description,
    vendor: SITE.name,
    publisher: { name: SITE.name, url: SITE.url, contact: SITE.email },
    homepage: SITE.url,
    serverInfo: { name: AGENT_SERVER.name, title: AGENT_SERVER.title, version: AGENT_SERVER.version },
    protocolVersion: SUPPORTED_PROTOCOL_VERSIONS[0],
    supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
    endpoint: absoluteUrl("/api/mcp"),
    transport: { type: "streamable-http", endpoint: absoluteUrl("/api/mcp") },
    capabilities: { tools: {} },
    authentication: { required: false, schemes: ["none"] },
    tools: PUBLIC_TOOLS,
  };
}
