import type { HttpRequest, HttpResponseInit } from '@azure/functions'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { TypedOrchestration } from '@mnci/az-durable'
import type { DurableClient } from 'durable-functions'
import { callerAccess } from '../caller-access'
import type { CrawlJob, CrawlResult } from '../crawl-run'
import type { HostSettings } from '../host-options'
import { problem } from '../http-reply'
import { createAuthoringServer } from './authoring-server.use-case'

/**
 * `/mcp`: the authoring MCP server over Streamable HTTP, stateless: every
 * request gets its own server and transport, and a JSON answer, so any
 * instance can take any call.
 *
 * @param request - The request.
 * @param client - The Durable client, for full runs.
 * @param settings - The host settings.
 * @param crawl - The `/crawl` orchestration.
 * @returns The MCP answer, 403 for a caller with no hosts, 404 when the endpoint is off.
 */
export async function mcpEndpoint (request: HttpRequest, client: DurableClient, settings: HostSettings, crawl: TypedOrchestration<CrawlJob, CrawlResult>): Promise<HttpResponseInit> {
  const { mcp } = settings
  if (mcp === undefined) return problem(404, 'the MCP endpoint is off on this host')
  const access = callerAccess(request, settings)
  if (access === undefined) return problem(403, 'this caller may not run recipes here')
  const server = createAuthoringServer({ settings: { ...settings, mcp }, access, client, crawl })
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  try {
    await server.connect(transport)
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text()
    const response = await transport.handleRequest(new Request(request.url, { method: request.method, headers: request.headers, body }))

    return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }
  } finally {
    await server.close()
  }
}
