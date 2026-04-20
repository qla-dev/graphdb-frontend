import type {
  ParsedSchema,
  SchemaColumn,
  SchemaCodeFormat,
  SchemaRelationship,
  SchemaTable,
  SourceRange
} from "@/types/schema";
import { slugifyIdentifier } from "@/lib/utils";

export function createEmptySchema(
  format: SchemaCodeFormat,
  source: string,
  warnings: string[] = []
): ParsedSchema {
  return {
    format,
    source,
    warnings,
    tables: [],
    relationships: [],
    sourceMap: {},
    parsedAt: Date.now()
  };
}

export function stripIdentifierQuotes(value: string) {
  return value
    .trim()
    .replace(/;$/g, "")
    .replace(/^["'`]+|["'`]+$/g, "");
}

export function normalizeIdentifier(value: string) {
  return stripIdentifierQuotes(value)
    .split(".")
    .map((part) => stripIdentifierQuotes(part))
    .filter(Boolean)
    .join(".");
}

export function unqualifiedIdentifier(value: string) {
  const normalized = normalizeIdentifier(value);
  return normalized.split(".").at(-1) ?? normalized;
}

export function tableId(tableName: string) {
  return `table:${slugifyIdentifier(normalizeIdentifier(tableName))}`;
}

export function columnId(tableName: string, columnName: string) {
  return `column:${slugifyIdentifier(normalizeIdentifier(tableName))}.${slugifyIdentifier(
    normalizeIdentifier(columnName)
  )}`;
}

export function relationshipId(
  fromTable: string,
  fromColumn: string,
  toTable: string,
  toColumn: string
) {
  return `relationship:${slugifyIdentifier(fromTable)}.${slugifyIdentifier(
    fromColumn
  )}->${slugifyIdentifier(toTable)}.${slugifyIdentifier(toColumn)}`;
}

export function rangeForLine(line: number, text: string): SourceRange {
  return {
    startLine: line,
    endLine: line,
    startColumn: 1,
    endColumn: Math.max(text.length + 1, 1)
  };
}

export function rangeFromOffsets(
  source: string,
  startOffset: number,
  endOffset: number
): SourceRange {
  const beforeStart = source.slice(0, Math.max(startOffset, 0));
  const beforeEnd = source.slice(0, Math.max(endOffset, startOffset));
  const startLines = beforeStart.split(/\r?\n/);
  const endLines = beforeEnd.split(/\r?\n/);

  return {
    startLine: startLines.length,
    endLine: endLines.length,
    startColumn: startLines.at(-1)!.length + 1,
    endColumn: endLines.at(-1)!.length + 1
  };
}

export function registerTable(schema: ParsedSchema, table: SchemaTable) {
  schema.tables.push(table);
  if (table.source) {
    schema.sourceMap[table.id] = table.source;
  }

  for (const column of table.columns) {
    if (column.source) {
      schema.sourceMap[column.id] = column.source;
    }
  }
}

export function registerRelationship(
  schema: ParsedSchema,
  relationship: SchemaRelationship
) {
  if (
    schema.relationships.some((existing) => existing.id === relationship.id)
  ) {
    return;
  }

  schema.relationships.push(relationship);
  if (relationship.source) {
    schema.sourceMap[relationship.id] = relationship.source;
  }
}

export function markForeignKey(
  schema: ParsedSchema,
  relationship: SchemaRelationship
) {
  const table = schema.tables.find(
    (item) => item.id === relationship.from.tableId
  );
  const column = table?.columns.find(
    (item) => item.id === relationship.from.columnId
  );

  if (!column) {
    return;
  }

  column.isForeignKey = true;
  column.references = {
    table: relationship.to.table,
    column: relationship.to.column,
    relationshipId: relationship.id
  };
}

export function makeColumn(
  tableName: string,
  name: string,
  type: string,
  source?: SourceRange,
  overrides: Partial<SchemaColumn> = {}
): SchemaColumn {
  return {
    id: columnId(tableName, name),
    tableId: tableId(tableName),
    name: normalizeIdentifier(name),
    type: type.trim() || "unknown",
    nullable: true,
    isPrimaryKey: false,
    isForeignKey: false,
    isUnique: false,
    source,
    ...overrides
  };
}

export function resolveTableName(tables: SchemaTable[], incoming: string) {
  const normalized = normalizeIdentifier(incoming);
  const direct = tables.find(
    (table) => normalizeIdentifier(table.name) === normalized
  );

  if (direct) {
    return direct.name;
  }

  const unqualified = unqualifiedIdentifier(normalized);
  return (
    tables.find((table) => unqualifiedIdentifier(table.name) === unqualified)
      ?.name ?? normalized
  );
}

export function findColumn(table: SchemaTable | undefined, columnName: string) {
  const normalized = normalizeIdentifier(columnName);
  return table?.columns.find(
    (column) => normalizeIdentifier(column.name) === normalized
  );
}
