import type {
  ParseError,
  ParseResult,
  ParsedSchema,
  SchemaCodeFormat,
  SchemaColumn,
  SchemaTable,
  SourceRange
} from "@/types/schema";
import {
  createEmptySchema,
  findColumn,
  makeColumn,
  markForeignKey,
  normalizeIdentifier,
  rangeFromOffsets,
  registerRelationship,
  registerTable,
  relationshipId,
  resolveTableName,
  stripIdentifierQuotes,
  tableId,
  unqualifiedIdentifier
} from "@/lib/parser/common";

interface CreateTableStatement {
  tableName: string;
  content: string;
  statementStart: number;
  contentStart: number;
  contentEnd: number;
  statementEnd: number;
}

interface AlterTableStatement {
  tableName: string;
  content: string;
  contentStart: number;
}

interface DefinitionChunk {
  text: string;
  start: number;
  end: number;
}

interface PendingReference {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  source?: SourceRange;
}

const constraintStarters =
  /^(constraint|primary|foreign|unique|check|exclude|key)\b/i;
const columnTypeBoundary =
  /\s(primary\s+key|not\s+null|null|references|default|unique|check|constraint|character\s+set|charset|collate|generated|identity|encoding|comment|compress|distkey|sortkey)\b/i;

function readQuotedOrBareIdentifier(source: string, start: number) {
  let cursor = start;
  let value = "";

  while (cursor < source.length && /\s/.test(source[cursor]!)) {
    cursor += 1;
  }

  while (cursor < source.length) {
    const char = source[cursor]!;

    if (char === '"' || char === "`" || char === "[") {
      const close = char === "[" ? "]" : char;
      value += char;
      cursor += 1;

      while (cursor < source.length) {
        const next = source[cursor]!;
        value += next;
        cursor += 1;
        if (next === close) {
          break;
        }
      }

      if (source[cursor] === ".") {
        value += ".";
        cursor += 1;
        continue;
      }

      break;
    }

    if (char === ".") {
      value += char;
      cursor += 1;
      continue;
    }

    if (/\s|\(/.test(char)) {
      break;
    }

    value += char;
    cursor += 1;
  }

  return {
    value: normalizeIdentifier(value.replace(/\[/g, '"').replace(/\]/g, '"')),
    end: cursor
  };
}

function findMatchingParen(source: string, openIndex: number) {
  let depth = 0;
  let quote: string | null = null;

  for (let cursor = openIndex; cursor < source.length; cursor += 1) {
    const char = source[cursor]!;
    const previous = source[cursor - 1];

    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
    }

    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return cursor;
      }
    }
  }

  return -1;
}

function findCreateTableStatements(source: string): CreateTableStatement[] {
  const statements: CreateTableStatement[] = [];
  const tableRegex =
    /create\s+(?:temporary\s+|temp\s+|unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?/gi;
  let match: RegExpExecArray | null;

  while ((match = tableRegex.exec(source))) {
    const tableStart = match.index + match[0].length;
    const { value: tableName, end: tableNameEnd } = readQuotedOrBareIdentifier(
      source,
      tableStart
    );
    const openParen = source.indexOf("(", tableNameEnd);

    if (!tableName || openParen === -1) {
      continue;
    }

    const closeParen = findMatchingParen(source, openParen);
    if (closeParen === -1) {
      statements.push({
        tableName,
        content: source.slice(openParen + 1),
        statementStart: match.index,
        contentStart: openParen + 1,
        contentEnd: source.length,
        statementEnd: source.length
      });
      break;
    }

    let statementEnd = closeParen + 1;
    while (
      statementEnd < source.length &&
      /[\s;]/.test(source[statementEnd]!)
    ) {
      statementEnd += 1;
      if (source[statementEnd - 1] === ";") {
        break;
      }
    }

    statements.push({
      tableName,
      content: source.slice(openParen + 1, closeParen),
      statementStart: match.index,
      contentStart: openParen + 1,
      contentEnd: closeParen,
      statementEnd
    });

    tableRegex.lastIndex = statementEnd;
  }

  return statements;
}

function findStatementEnd(source: string, start: number) {
  let depth = 0;
  let quote: string | null = null;

  for (let cursor = start; cursor < source.length; cursor += 1) {
    const char = source[cursor]!;
    const previous = source[cursor - 1];

    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth = Math.max(depth - 1, 0);
      continue;
    }

    if (char === ";" && depth === 0) {
      return cursor;
    }
  }

  return source.length;
}

function findAlterTableStatements(source: string): AlterTableStatement[] {
  const statements: AlterTableStatement[] = [];
  const alterRegex = /alter\s+table\s+/gi;
  let match: RegExpExecArray | null;

  while ((match = alterRegex.exec(source))) {
    const tableStart = match.index + match[0].length;
    const { value: tableName, end: tableNameEnd } = readQuotedOrBareIdentifier(
      source,
      tableStart
    );

    if (!tableName) {
      continue;
    }

    const statementEnd = findStatementEnd(source, tableNameEnd);
    statements.push({
      tableName,
      content: source.slice(tableNameEnd, statementEnd),
      contentStart: tableNameEnd
    });
    alterRegex.lastIndex = statementEnd + 1;
  }

  return statements;
}

function splitDefinitions(content: string, offset: number): DefinitionChunk[] {
  const chunks: DefinitionChunk[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;

  for (let cursor = 0; cursor < content.length; cursor += 1) {
    const char = content[cursor]!;
    const previous = content[cursor - 1];

    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth = Math.max(depth - 1, 0);
      continue;
    }

    if (char === "," && depth === 0) {
      chunks.push({
        text: content.slice(start, cursor),
        start: offset + start,
        end: offset + cursor
      });
      start = cursor + 1;
    }
  }

  chunks.push({
    text: content.slice(start),
    start: offset + start,
    end: offset + content.length
  });

  return chunks.filter((chunk) => chunk.text.trim());
}

function splitIdentifierList(value: string) {
  return value
    .split(",")
    .map((item) =>
      stripIdentifierQuotes(item.trim().replace(/^(asc|desc)\s+/i, ""))
    )
    .filter(Boolean);
}

function findTable(schema: ParsedSchema, tableName: string) {
  const resolvedName = resolveTableName(schema.tables, tableName);
  return schema.tables.find((table) => table.name === resolvedName);
}

function parseColumnDefinition(
  tableName: string,
  chunk: DefinitionChunk,
  source: string
): SchemaColumn | null {
  const trimmed = chunk.text.trim();

  if (!trimmed || constraintStarters.test(trimmed)) {
    return null;
  }

  const nameMatch = trimmed.match(
    /^("[^"]+"|`[^`]+`|\[[^\]]+\]|[\w-]+)\s+([\s\S]+)$/
  );
  if (!nameMatch) {
    return null;
  }

  const name = stripIdentifierQuotes(
    nameMatch[1].replace(/\[/g, "").replace(/\]/g, "")
  );
  const rest = nameMatch[2].trim();
  const boundary = rest.match(columnTypeBoundary);
  const rawType = boundary ? rest.slice(0, boundary.index).trim() : rest;
  const normalizedType = rawType.replace(/\s+/g, " ");
  const isPrimaryKey = /\bprimary\s+key\b/i.test(rest);
  const isUnique = /\bunique\b/i.test(rest);
  const nullable = !/\bnot\s+null\b/i.test(rest) && !isPrimaryKey;
  const sourceRange = rangeFromOffsets(source, chunk.start, chunk.end);

  return makeColumn(tableName, name, normalizedType, sourceRange, {
    isPrimaryKey,
    isUnique,
    nullable,
    isForeignKey: /\breferences\b/i.test(rest)
  });
}

function parseReferencesFromColumn(
  tableName: string,
  column: SchemaColumn,
  chunk: DefinitionChunk,
  source: string
): PendingReference | null {
  const refMatch = chunk.text.match(
    /\breferences\s+((?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[\w-]+)(?:\.(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[\w-]+))?)\s*\(\s*("[^"]+"|`[^`]+`|\[[^\]]+\]|[\w-]+)\s*\)/i
  );

  if (!refMatch) {
    return null;
  }

  return {
    fromTable: tableName,
    fromColumn: column.name,
    toTable: normalizeIdentifier(
      refMatch[1].replace(/\[/g, '"').replace(/\]/g, '"')
    ),
    toColumn: stripIdentifierQuotes(
      refMatch[2].replace(/\[/g, "").replace(/\]/g, "")
    ),
    source: rangeFromOffsets(source, chunk.start, chunk.end)
  };
}

function applyPrimaryKeyConstraint(table: SchemaTable, chunk: DefinitionChunk) {
  const match = chunk.text
    .trim()
    .match(
      /^(?:constraint\s+("[^"]+"|`[^`]+`|[\w-]+)\s+)?primary\s+key\s*\(([^)]+)\)/i
    );

  if (!match) {
    return;
  }

  for (const columnName of splitIdentifierList(match[2])) {
    const column = table.columns.find(
      (candidate) =>
        normalizeIdentifier(candidate.name) === normalizeIdentifier(columnName)
    );
    if (column) {
      column.isPrimaryKey = true;
      column.nullable = false;
    }
  }
}

function applyAlterPrimaryKeyConstraint(
  schema: ParsedSchema,
  tableName: string,
  chunk: DefinitionChunk
) {
  const match = chunk.text.trim().match(/^add\s+primary\s+key\s*\(([^)]+)\)/i);

  if (!match) {
    return;
  }

  const table = findTable(schema, tableName);
  if (!table) {
    return;
  }

  for (const columnName of splitIdentifierList(match[1])) {
    const column = findColumn(table, columnName);
    if (column) {
      column.isPrimaryKey = true;
      column.nullable = false;
    }
  }
}

function parseForeignKeyConstraint(
  tableName: string,
  chunk: DefinitionChunk,
  source: string
): PendingReference[] {
  const match = chunk.text
    .trim()
    .match(
      /^(?:add\s+)?(?:constraint\s+("[^"]+"|`[^`]+`|[\w-]+)\s+)?foreign\s+key\s*\(([^)]+)\)\s+references\s+((?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[\w-]+)(?:\.(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[\w-]+))?)\s*\(([^)]+)\)/i
    );

  if (!match) {
    return [];
  }

  const localColumns = splitIdentifierList(match[2]);
  const targetColumns = splitIdentifierList(match[4]);
  const targetTable = normalizeIdentifier(
    match[3].replace(/\[/g, '"').replace(/\]/g, '"')
  );

  return localColumns.map((localColumn, index) => ({
    fromTable: tableName,
    fromColumn: localColumn,
    toTable: targetTable,
    toColumn: targetColumns[index] ?? targetColumns[0] ?? "id",
    source: rangeFromOffsets(source, chunk.start, chunk.end)
  }));
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
      `Could not resolve foreign key ${pending.fromTable}.${pending.fromColumn} -> ${pending.toTable}.${pending.toColumn}.`
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

export function parseSql(source: string, format: SchemaCodeFormat): ParseResult {
  const schema = createEmptySchema(format, source);
  const errors: ParseError[] = [];
  const pendingReferences: PendingReference[] = [];
  const statements = findCreateTableStatements(source);

  for (const statement of statements) {
    const chunks = splitDefinitions(statement.content, statement.contentStart);
    const columns = chunks
      .map((chunk) => parseColumnDefinition(statement.tableName, chunk, source))
      .filter((column): column is SchemaColumn => Boolean(column));

    const table: SchemaTable = {
      id: tableId(statement.tableName),
      name: normalizeIdentifier(statement.tableName),
      schema: statement.tableName.includes(".")
        ? statement.tableName.split(".").at(0)
        : undefined,
      columns,
      source: rangeFromOffsets(
        source,
        statement.statementStart,
        statement.statementEnd
      )
    };

    for (const chunk of chunks) {
      applyPrimaryKeyConstraint(table, chunk);
    }

    registerTable(schema, table);

    for (const chunk of chunks) {
      const column = parseColumnDefinition(statement.tableName, chunk, source);
      if (column) {
        const reference = parseReferencesFromColumn(
          statement.tableName,
          column,
          chunk,
          source
        );
        if (reference) {
          pendingReferences.push(reference);
        }
        continue;
      }

      pendingReferences.push(
        ...parseForeignKeyConstraint(statement.tableName, chunk, source)
      );
    }
  }

  for (const statement of findAlterTableStatements(source)) {
    const chunks = splitDefinitions(statement.content, statement.contentStart);

    for (const chunk of chunks) {
      applyAlterPrimaryKeyConstraint(schema, statement.tableName, chunk);
      pendingReferences.push(
        ...parseForeignKeyConstraint(statement.tableName, chunk, source)
      );
    }
  }

  for (const pendingReference of pendingReferences) {
    buildRelationship(schema, pendingReference);
  }

  if (source.trim() && schema.tables.length === 0) {
    errors.push({
      message: "No CREATE TABLE statements were detected.",
      detail: "The MVP parser supports standard `CREATE TABLE name (...)` DDL."
    });
  }

  const unclosedCreate =
    /create\s+(?:temporary\s+|temp\s+|unlogged\s+)?table\b/i.test(source) &&
    statements.length === 0;
  if (unclosedCreate) {
    errors.push({
      message: "A CREATE TABLE statement appears to be malformed."
    });
  }

  return { schema, errors };
}
