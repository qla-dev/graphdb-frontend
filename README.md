# GraphDB Schema Studio

A production-ready MVP for generating, parsing, and visualizing database schemas from DBML, SQL, and PostgreSQL DDL.

The app is a full-screen developer dashboard: write or generate schema code on the left, then inspect the live table graph on the right with zoom, pan, minimap, source highlighting, search, presets, and export utilities.

## Setup

```bash
npm install
```

## Run Locally

```bash
npm run dev
```

Open the Vite URL printed by the dev server, usually `http://127.0.0.1:5173`.

## Production Commands

```bash
npm run build
npm run start
npm run lint
npm run typecheck
npm run format
```

## What Is Included

- React with Vite and TypeScript
- Tailwind CSS v4 design tokens
- shadcn/ui-style local components powered by Radix primitives
- Monaco Editor with SQL and custom DBML syntax highlighting
- React Flow schema canvas with custom table nodes and relationship edges
- Dagre auto-layout for readable graph placement
- Zustand store for schema code, parser output, hover state, selection, search, and AI generation state
- DBML parser with inline and top-level relationship support
- SQL/PostgreSQL parser for `CREATE TABLE`, primary keys, column-level references, and table-level foreign keys
- Source mapping between code lines and tables, columns, and relationships
- Monaco validation markers for common schema syntax, keyword, constraint, and type mistakes
- IDE-style schema search suggestions for tables, keys, groups, and fields with keyboard navigation
- Custom live database minimap with viewport rectangle and click/drag navigation
- Draggable table positions preserved in state while editing
- Multi-select table grouping with group rectangles and a right-click context menu
- Mock AI provider behind an `AiSchemaProvider` interface
- Export service for JSON, Postman collection, source code, PNG, and PDF downloads
- Sample schema presets for DBML, SQL, and PostgreSQL

## Architecture

```text
src/main.tsx
  Browser entry point and React root mounting

src/App.tsx
  Application shell, providers, and toast outlet

src/styles
  Global CSS, Tailwind CSS v4 tokens, and React Flow styles

src/components/dashboard
  Top navigation, responsive split workspace, left editor/AI panel

src/components/editor
  Monaco editor setup, DBML language registration, source-line hover decorations

src/components/schema
  React Flow canvas, custom table nodes, custom relationship edges, minimap, search, groups, context menu, flow types

src/components/ui
  shadcn/ui-style primitives used across the product

src/lib/parser
  DBML parser, SQL/PostgreSQL parser, validation rules, normalized schema model helpers, Dagre layout

src/lib/ai
  AI provider contract and local mock provider

src/lib/export
  Export service for JSON, Postman collection, source code, PNG, and PDF

src/lib/store
  Zustand app state and actions

src/types
  Typed domain models for schema parsing and visualization
```

## Parser Notes

The MVP parser is intentionally fast and browser-safe. It handles common practical schema input:

- DBML `Table` blocks
- DBML inline refs such as `[ref: > users.id]`
- DBML top-level refs such as `Ref: orders.user_id > users.id`
- SQL and PostgreSQL `CREATE TABLE`
- Column-level `REFERENCES`
- Table-level `PRIMARY KEY`
- Table-level `FOREIGN KEY (...) REFERENCES ... (...)`
- Schema-qualified PostgreSQL names such as `public.users`

Malformed input is reported in the UI without crashing the canvas. The graph renders any tables that could still be normalized.

## Future Improvements

- Add a server-side OpenAI provider route that implements `AiSchemaProvider`
- Add parser-library fallback for more complex dialect features such as composite types, generated columns, indexes, and enum definitions
- Add remote project persistence and share links backed by a database
- Add graph editing so users can create tables and foreign keys directly from the canvas
- Add tests around parser fixtures and hover source-map behavior
