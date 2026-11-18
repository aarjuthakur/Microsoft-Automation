import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const TOOLS: Tool[] = [
  {
    name: 'list_csv_templates',
    description: 'Lists available CSV templates in the samples/ directory with metadata (title, field count, branching info).',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'validate_csv',
    description: 'Validates a CSV file against the expected 8-column MS Forms template format. Returns validation errors if any.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute path to the CSV file to validate.',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'create_form',
    description: 'Creates a Microsoft Form from a CSV template file. Launches a browser, builds the form with all questions, restrictions, and branching, then returns editor and response URLs.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        csvPath: {
          type: 'string',
          description: 'Path to the CSV template file (absolute or relative to samples/).',
        },
      },
      required: ['csvPath'],
    },
  },
  {
    name: 'test_form',
    description: 'Runs Playwright tests against a form at the given response URL. Executes testExisting.spec.ts which fills all fields and submits.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        responseUrl: {
          type: 'string',
          description: 'The MS Forms response URL to test.',
        },
      },
      required: ['responseUrl'],
    },
  },
  {
    name: 'get_form_links',
    description: 'Returns the list of previously generated forms with their editor and response URLs from the forms-log.json file.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_test_report',
    description: 'Returns a summary of the latest Playwright test results from the test-results directory.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
];
