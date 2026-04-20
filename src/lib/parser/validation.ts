import type {
  ParseError,
  ParsedSchema,
  SchemaCodeFormat,
  SchemaColumn,
  SourceRange
} from "@/types/schema";

const commonTypes = new Set([
  "bigint",
  "bigserial",
  "binary",
  "bit",
  "blob",
  "bool",
  "boolean",
  "bytea",
  "char",
  "character",
  "character varying",
  "cidr",
  "citext",
  "date",
  "datetime",
  "decimal",
  "double",
  "double precision",
  "enum",
  "float",
  "float4",
  "float8",
  "inet",
  "int",
  "int2",
  "int4",
  "int8",
  "integer",
  "json",
  "jsonb",
  "longblob",
  "longtext",
  "macaddr",
  "mediumblob",
  "mediumint",
  "mediumtext",
  "money",
  "nchar",
  "numeric",
  "nvarchar",
  "real",
  "serial",
  "set",
  "smallint",
  "smallserial",
  "string",
  "text",
  "time",
  "time with time zone",
  "time without time zone",
  "timestamp",
  "timestamp with time zone",
  "timestamp without time zone",
  "timestamptz",
  "timetz",
  "tinyblob",
  "tinyint",
  "tinytext",
  "uuid",
  "varbinary",
  "varchar",
  "year",
  "xml"
]);

const dbmlTypes = new Set([
  "bigint",
  "bool",
  "boolean",
  "date",
  "decimal",
  "double",
  "float",
  "int",
  "integer",
  "json",
  "jsonb",
  "numeric",
  "string",
  "text",
  "timestamp",
  "timestamptz",
  "uuid",
  "varchar"
]);

const keywordChecks: Array<{
  format: "dbml" | "sql";
  pattern: RegExp;
  message: string;
  code: string;
}> = [
  {
    format: "dbml",
    pattern: /^\s*(tabel|tabl|tablee)\b/i,
    message: "Unknown DBML keyword. Did you mean `Table`?",
    code: "dbml.keyword.table"
  },
  {
    format: "dbml",
    pattern: /\bprimari\s+key\b|\bprimaryy\s+key\b/i,
    message: "Unknown DBML constraint. Did you mean `primary key`?",
    code: "dbml.constraint.primary-key"
  },
  {
    format: "dbml",
    pattern: /\b(refs|reference|references)\s*:/i,
    message: "Unknown DBML reference setting. Did you mean `ref:`?",
    code: "dbml.constraint.ref"
  },
  {
    format: "sql",
    pattern: /^\s*creat\s+table\b/i,
    message: "Unknown SQL keyword. Did you mean `CREATE TABLE`?",
    code: "sql.keyword.create"
  },
  {
    format: "sql",
    pattern: /^\s*create\s+tabel\b/i,
    message: "Unknown SQL keyword. Did you mean `CREATE TABLE`?",
    code: "sql.keyword.table"
  },
  {
    format: "sql",
    pattern: /\bprimari\s+key\b|\bprimaryy\s+key\b/i,
    message: "Unknown SQL constraint. Did you mean `PRIMARY KEY`?",
    code: "sql.constraint.primary-key"
  },
  {
    format: "sql",
    pattern: /\bforiegn\s+key\b|\bforeignn\s+key\b/i,
    message: "Unknown SQL constraint. Did you mean `FOREIGN KEY`?",
    code: "sql.constraint.foreign-key"
  },
  {
    format: "sql",
    pattern: /\brefrences\b|\breferencess\b/i,
    message: "Unknown SQL keyword. Did you mean `REFERENCES`?",
    code: "sql.keyword.references"
  },
  {
    format: "sql",
    pattern: /\bnotnull\b|\bnot\s+nul\b/i,
    message: "Unknown SQL nullability constraint. Did you mean `NOT NULL`?",
    code: "sql.constraint.not-null"
  }
];

function lineRange(lineNumber: number, text: string): SourceRange {
  return {
    startLine: lineNumber,
    endLine: lineNumber,
    startColumn: 1,
    endColumn: Math.max(text.length + 1, 1)
  };
}

function levenshtein(a: string, b: string) {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0)
  );

  for (let row = 0; row <= a.length; row += 1) {
    matrix[row]![0] = row;
  }

  for (let column = 0; column <= b.length; column += 1) {
    matrix[0]![column] = column;
  }

  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      matrix[row]![column] = Math.min(
        matrix[row - 1]![column]! + 1,
        matrix[row]![column - 1]! + 1,
        matrix[row - 1]![column - 1]! + cost
      );
    }
  }

  return matrix[a.length]![b.length]!;
}

function nearestType(type: string, candidates: Set<string>) {
  let best: { type: string; score: number } | null = null;

  for (const candidate of candidates) {
    const score = levenshtein(type, candidate);
    if (!best || score < best.score) {
      best = { type: candidate, score };
    }
  }

  return best && best.score <= 3 ? best.type : null;
}

function normalizeType(type: string) {
  return type
    .toLowerCase()
    .replace(/\[\]$/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(unsigned|signed|zerofill)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function allowedTypesFor(format: SchemaCodeFormat) {
  return format === "dbml" ? dbmlTypes : commonTypes;
}

function validateType(
  column: SchemaColumn,
  format: SchemaCodeFormat
): ParseError | null {
  const type = normalizeType(column.type);
  const candidates = allowedTypesFor(format);

  if (!type || type === "unknown" || candidates.has(type)) {
    return null;
  }

  if (type.includes(".") || type.includes('"')) {
    return null;
  }

  const suggestion = nearestType(type, candidates);

  return {
    message: `Invalid ${format === "dbml" ? "DBML" : "SQL"} type \`${column.type}\`.`,
    detail: suggestion
      ? `Column \`${column.name}\` uses an unknown type. Did you mean \`${suggestion}\`?`
      : `Column \`${column.name}\` uses a type the MVP validator does not recognize.`,
    line: column.source?.startLine,
    source: column.source,
    severity: "error",
    code: "schema.type.invalid"
  };
}

function validateKeywords(
  source: string,
  format: SchemaCodeFormat
): ParseError[] {
  const lines = source.split(/\r?\n/);
  const checks = keywordChecks.filter(
    (check) =>
      check.format === format ||
      (check.format === "sql" && format === "postgresql")
  );

  return lines.flatMap((line, index) =>
    checks
      .filter((check) => check.pattern.test(line))
      .map((check) => ({
        message: check.message,
        line: index + 1,
        source: lineRange(index + 1, line),
        severity: "error" as const,
        code: check.code
      }))
  );
}

export function validateSchema(
  source: string,
  format: SchemaCodeFormat,
  schema: ParsedSchema
): ParseError[] {
  const typeErrors = schema.tables.flatMap((table) =>
    table.columns
      .map((column) => validateType(column, format))
      .filter((error): error is ParseError => Boolean(error))
  );

  return [...validateKeywords(source, format), ...typeErrors];
}
