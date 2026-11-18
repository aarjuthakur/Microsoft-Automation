import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOLS } from './tools';
import {
  handleListCsvTemplates,
  handleValidateCsv,
  handleCreateForm,
  handleTestForm,
  handleGetFormLinks,
  handleGetTestReport,
} from './handlers';

const server = new Server(
  {
    name: 'ms-forms-automation',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  let result;
  switch (name) {
    case 'list_csv_templates':
      result = handleListCsvTemplates();
      break;
    case 'validate_csv':
      result = handleValidateCsv(args as { filePath: string });
      break;
    case 'create_form':
      result = handleCreateForm(args as { csvPath: string });
      break;
    case 'test_form':
      result = handleTestForm(args as { responseUrl: string });
      break;
    case 'get_form_links':
      result = handleGetFormLinks();
      break;
    case 'get_test_report':
      result = handleGetTestReport();
      break;
    default:
      result = {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }

  return { ...result } as Record<string, unknown>;
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'forms://templates',
        name: 'CSV Templates',
        description: 'Available CSV form templates in samples/',
        mimeType: 'application/json',
      },
      {
        uri: 'forms://generated',
        name: 'Generated Forms',
        description: 'Previously generated form records with URLs',
        mimeType: 'application/json',
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'forms://templates') {
    const result = handleListCsvTemplates();
    return {
      contents: [{ uri, mimeType: 'application/json', text: result.content[0].text }],
    };
  }

  if (uri === 'forms://generated') {
    const result = handleGetFormLinks();
    return {
      contents: [{ uri, mimeType: 'application/json', text: result.content[0].text }],
    };
  }

  return {
    contents: [{ uri, mimeType: 'text/plain', text: `Unknown resource: ${uri}` }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MS Forms MCP server running on stdio');
}

main().catch((err) => {
  console.error('MCP server failed to start:', err);
  process.exit(1);
});
