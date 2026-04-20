import type {
  ParseResult,
  ParsedSchema,
  SchemaCodeFormat,
  SchemaTable,
  SourceRange
} from "@/types/schema";
import {
  createEmptySchema,
  findColumn,
  makeColumn,
  markForeignKey,
  normalizeIdentifier,
  rangeForLine,
  registerRelationship,
  registerTable,
  relationshipId,
  resolveTableName,
  stripIdentifierQuotes,
  tableId,
  unqualifiedIdentifier
} from "@/lib/parser/common";

interface PendingReference {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  source?: SourceRange;
}

function readDbmlIdentifier(value: string) {
  return stripIdentifierQuotes(value.replace(/,$/, ""));
}

function parseEndpoint(value: string) {
  const cleaned = value.trim().replaceAll("[", "").replaceAll("]", "");
  const parts = cleaned.split(".");

  if (parts.length < 2) {
    return null;
  }

  const column = readDbmlIdentifier(parts.pop() ?? "");
  const table = readDbmlIdentifier(parts.join("."));

  return { table, column };
}

function stripDbmlComment(line: string) {
  return line.replace(/\s*\/\/.*$/, "");
}

function parseColumnLine(line: string) {
  const match = line.match(
    /^("[^"]+"|`[^`]+`|'[^']+'|[\w-]+)\s+([^\s[]+)(.*)$/
  );

  if (!match) {
    return null;
  }

  return {
    name: readDbmlIdentifier(match[1]),
    type: match[2],
    settings: match[3] ?? ""
  };
}

function buildRelationship(schema: ParsedSchema, pending: PendingReference) {
  const fromTableName = resolveTableName(schema.tables, pending.fromTable);
  const toTableName = resolveTableName(schema.tables, pending.toTable);
  const fromTable = schema.tables.find((item) => item.name === fromTableName);
  const toTable = schema.tables.find((item) => item.name === toTableName);
  const fromColumn = findColumn(fromTable, pending.fromColumn);
  const toColumn = findColumn(toTable, pending.toColumn);

  if (!fromTable || !toTable || !fromColumn || !toColumn) {
    schema.warnings.push(
      `Could not resolve reference ${pending.fromTable}.${pending.fromColumn} -> ${pending.toTable}.${pending.toColumn}.`
    );
    return;
  }

  const relationship = {
    id: relationshipId(
      fromTable.name,
      fromColumn.name,
      toTable.name,
      toColumn.name
    ),
    from: {
      tableId: fromTable.id,
      columnId: fromColumn.id,
      table: fromTable.name,
      column: fromColumn.name
    },
    to: {
      tableId: toTable.id,
      columnId: toColumn.id,
      table: toTable.name,
      column: toColumn.name
    },
    label: `${unqualifiedIdentifier(fromTable.name)}.${fromColumn.name} -> ${unqualifiedIdentifier(
      toTable.name
    )}.${toColumn.name}`,
    source: pending.source
  };

  registerRelationship(schema, relationship);
  markForeignKey(schema, relationship);
}

export function parseDbml(
  source: string,
  format: SchemaCodeFormat = "dbml"
): ParseResult {
  const schema = createEmptySchema(format, source);
  const pendingReferences: PendingReference[] = [];
  const errors = [];
  const lines = source.split(/\r?\n/);
  let currentTable: {
    name: string;
    startLine: number;
    columns: SchemaTable["columns"];
  } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const rawLine = lines[index] ?? "";
    const line = stripDbmlComment(rawLine).trim();

    if (!line) {
      continue;
    }

    if (currentTable && /^}/.test(line)) {
      const table: SchemaTable = {
        id: tableId(currentTable.name),
        name: normalizeIdentifier(currentTable.name),
        columns: currentTable.columns,
        source: {
          startLine: currentTable.startLine,
          endLine: lineNumber,
          startColumn: 1,
          endColumn: rawLine.length + 1
        }
      };

      registerTable(schema, table);
      currentTable = null;
      continue;
    }

    const tableMatch = line.match(
      /^Table\s+("[^"]+"|`[^`]+`|'[^']+'|[\w.]+)\s*\{/i
    );
    if (tableMatch) {
      if (currentTable) {
        errors.push({
          message: `Nested table declarations are not valid DBML.`,
          line: lineNumber
        });
      }

      currentTable = {
        name: readDbmlIdentifier(tableMatch[1]),
        startLine: lineNumber,
        columns: []
      };
      continue;
    }

    const refMatch = line.match(/^Ref\s*:?\s+(.+?)\s*([<>-]+)\s*(.+)$/i);
    if (!currentTable && refMatch) {
      const left = parseEndpoint(refMatch[1]);
      const right = parseEndpoint(refMatch[3]);
      const operator = refMatch[2];

      if (left && right) {
        pendingReferences.push(
          operator.includes("<")
            ? {
                fromTable: right.table,
                fromColumn: right.column,
                toTable: left.table,
                toColumn: left.column,
                source: rangeForLine(lineNumber, rawLine)
              }
            : {
                fromTable: left.table,
                fromColumn: left.column,
                toTable: right.table,
                toColumn: right.column,
                source: rangeForLine(lineNumber, rawLine)
              }
        );
      }
      continue;
    }

    if (!currentTable) {
      continue;
    }

    const columnInfo = parseColumnLine(line);
    if (!columnInfo) {
      continue;
    }

    const range = rangeForLine(lineNumber, rawLine);
    const isPrimaryKey = /\[(?=[^\]]*(primary key|pk))/i.test(
      columnInfo.settings
    );
    const isUnique = /\[(?=[^\]]*\bunique\b)/i.test(columnInfo.settings);
    const nullable =
      !/\[(?=[^\]]*(not null))/i.test(columnInfo.settings) && !isPrimaryKey;
    const refMatchInline = columnInfo.settings.match(
      /ref\s*:\s*([<>-]+)\s*("[^"]+"|`[^`]+`|'[^']+'|[\w.]+)\.("[^"]+"|`[^`]+`|'[^']+'|[\w-]+)/i
    );

    const column = makeColumn(
      currentTable.name,
      columnInfo.name,
      columnInfo.type,
      range,
      {
        isPrimaryKey,
        isUnique,
        nullable,
        isForeignKey: Boolean(refMatchInline)
      }
    );

    currentTable.columns.push(column);

    if (refMatchInline) {
      const operator = refMatchInline[1];
      const targetTable = readDbmlIdentifier(refMatchInline[2]);
      const targetColumn = readDbmlIdentifier(refMatchInline[3]);

      pendingReferences.push(
        operator.includes("<")
          ? {
              fromTable: targetTable,
              fromColumn: targetColumn,
              toTable: currentTable.name,
              toColumn: column.name,
              source: range
            }
          : {
              fromTable: currentTable.name,
              fromColumn: column.name,
              toTable: targetTable,
              toColumn: targetColumn,
              source: range
            }
      );
    }
  }

  if (currentTable) {
    errors.push({
      message: `Table "${currentTable.name}" is missing a closing brace.`,
      line: currentTable.startLine
    });

    registerTable(schema, {
      id: tableId(currentTable.name),
      name: normalizeIdentifier(currentTable.name),
      columns: currentTable.columns,
      source: {
        startLine: currentTable.startLine,
        endLine: lines.length,
        startColumn: 1,
        endColumn: (lines.at(-1) ?? "").length + 1
      }
    });
  }

  for (const pendingReference of pendingReferences) {
    buildRelationship(schema, pendingReference);
  }

  if (source.trim() && schema.tables.length === 0) {
    errors.push({
      message:
        "No DBML tables were detected. Add blocks like `Table users { ... }`."
    });
  }

  return { schema, errors };
}
