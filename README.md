# MS Forms Automation

Automated creation and testing of Microsoft Forms surveys from CSV templates using Playwright and TypeScript, with MCP (Model Context Protocol) server integration for AI-assisted form testing.

## What It Does

1. **Reads** a CSV template defining form structure (questions, types, pages, branching logic, restrictions)
2. **Builds** the form on Microsoft Forms using browser automation (Playwright + MS Edge)
3. **Tests** the published form by filling responses and validating behavior

## Project Summary

| Item | Detail |
|------|--------|
| Language | TypeScript |
| Automation | Playwright 1.64.1 (MS Edge) |
| Integration | MCP SDK 1.32.2 |
| CSV Parsing | csv-parse 5.6.0 |
| Supported Input Types | Text, email, number, date, rating, ranking, Likert, NPS, file upload, and more |
| Sample Forms | 9 CSV templates included |

## Setup Instructions

### Prerequisites

- Node.js (LTS recommended)
- Microsoft account with access to [Microsoft Forms](https://forms.cloud.microsoft)
- MS Edge browser installed

### Installation

```bash
cd ms-forms-automation
npm install
npx playwright install msedge
```

### Configuration

The project uses `config/forms.config.ts` for Microsoft Forms URLs, timeouts, and field type mappings. Authentication is handled through Edge browser profile (non-headless mode).

## Running

### Build a Form from CSV

```bash
npm run build
```

Reads a CSV template and creates the form on Microsoft Forms. The generated form metadata is saved to `generated-forms/`.

### Build and Test

```bash
npm run build:test
```

Creates the form and immediately runs the happy path test against it.

### Test an Existing Form

```bash
npm run test:existing
```

Runs tests against a previously built form using saved metadata from `generated-forms/`.

### Run All Tests

```bash
npm test
```

Runs the complete test suite including smoke, functional, E2E, and performance tests.

### View Test Report

```bash
npm run report
```

Opens the Playwright HTML report in the browser.

### MCP Server

```bash
npm run mcp
```

Starts the MCP server (`mcp/formTestServer.ts`) for AI-assisted form testing via tool calls.

## Project Structure

```
ms-forms-automation/
  config/
    forms.config.ts        # Forms URL, timeouts, field type mappings
  models/
    types.ts               # TypeScript type definitions
  builder/
    FormEditorPage.ts      # Form creation page object
    BranchConfigurator.ts  # Conditional branching logic
    selectors.ts           # Builder UI selectors
  tester/
    FormResponsePage.ts    # Form response/testing page object
    selectors.ts           # Response UI selectors
  csv/
    csvParser.ts           # CSV-to-form-definition parsing
    csvValidator.ts        # CSV structure validation
    branchResolver.ts      # Branch condition resolution
  fixtures/
    browserSetup.ts        # Browser launch configuration
    formFixture.ts         # Playwright test fixtures
  mcp/
    formTestServer.ts      # MCP server entry point
    handlers.ts            # MCP request handlers
    tools.ts               # MCP tool definitions
  utils/
    helpers.ts             # Shared utilities
    logger.ts              # Logging
  tests/
    buildOnly.spec.ts      # Build-only test
    testExisting.spec.ts   # Test existing form
    e2e/                   # End-to-end happy path
    functional/            # Input type validation
    performance/           # Form load performance
    smoke/                 # Form loads correctly
  samples/                 # CSV templates
    customer_feedback.csv
    customer_feedback_branched.csv
    event_registration.csv
    medical_checkup.csv
    multipage_survey.csv
    workshop_entry.csv
  generated-forms/         # JSON output from form builds
  docs/                    # Project guide and presentation
  test-data/
    testValues.json        # Test input values
```

## CSV Template Format

CSV templates define form structure with columns for question text, input type, page assignment, branching conditions, and validation restrictions. See `samples/` for examples covering:

- Simple feedback forms
- Multi-page surveys with conditional branching
- Event registration with required fields
- Medical forms with varied input types

## Skills Learned

- Playwright browser automation with MS Edge
- Microsoft Forms platform automation (form creation, not just testing)
- CSV-driven test data and form generation
- MCP (Model Context Protocol) server implementation
- Conditional branching logic in form builders
- TypeScript project architecture for automation tooling
