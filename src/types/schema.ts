export type SchemaCodeFormat = "dbml" | "sql" | "postgresql";
export type SchemaFormat = "ui" | SchemaCodeFormat;

export type SchemaCodeByFormat = Record<SchemaCodeFormat, string>;

export type SchemaElementKind = "table" | "column" | "relationship" | "group";
export type ValidationSeverity = "error" | "warning";

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasBounds extends CanvasPoint {
  width: number;
  height: number;
}

export interface SourceRange {
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

export interface SchemaElementRef {
  kind: SchemaElementKind;
  id: string;
}

export interface ColumnReference {
  table: string;
  column: string;
  relationshipId?: string;
}

export interface SchemaColumn {
  id: string;
  tableId: string;
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isUnique: boolean;
  references?: ColumnReference;
  source?: SourceRange;
}

export interface SchemaTable {
  id: string;
  name: string;
  schema?: string;
  columns: SchemaColumn[];
  source?: SourceRange;
}

export interface RelationshipEndpoint {
  tableId: string;
  columnId: string;
  table: string;
  column: string;
}

export interface SchemaRelationship {
  id: string;
  from: RelationshipEndpoint;
  to: RelationshipEndpoint;
  label: string;
  source?: SourceRange;
}

export interface ParsedSchema {
  format: SchemaCodeFormat;
  tables: SchemaTable[];
  relationships: SchemaRelationship[];
  source: string;
  warnings: string[];
  sourceMap: Record<string, SourceRange>;
  parsedAt: number;
}

export interface ParseError {
  message: string;
  line?: number;
  detail?: string;
  severity?: ValidationSeverity;
  code?: string;
  source?: SourceRange;
}

export interface ParseResult {
  schema: ParsedSchema;
  errors: ParseError[];
}

export interface SchemaPreset {
  id: string;
  name: string;
  description: string;
  format: SchemaCodeFormat;
  code: string;
}

export interface AiProviderResponse {
  code: string;
  format: SchemaCodeFormat;
  summary: string;
}

export interface SchemaGroup {
  id: string;
  title: string;
  tableIds: string[];
  bounds: CanvasBounds;
  color: "emerald" | "cyan" | "amber" | "rose";
}

export interface PersistedScheme {
  id: string;
  name: string;
  code: string;
  format: SchemaFormat;
  codeFormat?: SchemaCodeFormat;
  codeByFormat?: Partial<SchemaCodeByFormat>;
  nodePositions: Record<string, CanvasPoint>;
  groups: SchemaGroup[];
  createdAt: number;
  updatedAt: number;
  tableCount: number;
  relationshipCount: number;
}

export type SaveStatus = "saved" | "saving" | "dirty" | "error";

export interface PublishedApi {
  id: string;
  apiBasePath: string;
  apiToken: string;
  publishedAt: number;
}
