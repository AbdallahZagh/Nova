import {
  Controller,
  Delete,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { AuthUser } from '../auth/strategies/jwt.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { McpAuthGuard } from './mcp-auth.guard';
import { NovaMcpServerFactory } from './nova-mcp.server';

/**
 * Stateless Streamable HTTP MCP. Each POST is its own server instance because
 * the free Render process sleeps and does not keep session memory.
 * GET and DELETE are rejected so clients do not open a live SSE session.
 */
@ApiTags('MCP')
@ApiBearerAuth('access-token')
@UseGuards(McpAuthGuard)
@Controller()
export class McpController {
  constructor(private readonly mcp: NovaMcpServerFactory) {}

  @Post('mcp')
  @ApiOperation({
    summary: 'MCP JSON-RPC endpoint',
    description:
      'Send a JSON-RPC message. Use method "tools/list" to see tools, or "tools/call" to run one. GET is not supported.',
  })
  @ApiBody({
    schema: {
      example: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      },
    },
  })
  async post(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ) {
    allowSwaggerAccept(req);
    const server = this.mcp.create(user);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error' },
          id: null,
        });
      }
    } finally {
      await transport.close();
      await server.close();
    }
  }

  @Get('mcp')
  get(@Res({ passthrough: false }) res: Response) {
    this.methodNotAllowed(res);
  }

  @Delete('mcp')
  remove(@Res({ passthrough: false }) res: Response) {
    this.methodNotAllowed(res);
  }

  private methodNotAllowed(res: Response) {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
  }
}

// Swagger sends Accept: */* . The MCP transport reads rawHeaders, not the parsed map.
function allowSwaggerAccept(req: Request) {
  const raw = req.headers.accept;
  const accept = Array.isArray(raw) ? raw.join(', ') : (raw ?? '');
  if (
    accept.includes('application/json') &&
    accept.includes('text/event-stream')
  ) {
    return;
  }

  const value = 'application/json, text/event-stream';
  req.headers.accept = value;
  const rawHeaders = req.rawHeaders;
  let replaced = false;
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() === 'accept') {
      rawHeaders[i + 1] = value;
      replaced = true;
    }
  }
  if (!replaced) rawHeaders.push('Accept', value);
}
