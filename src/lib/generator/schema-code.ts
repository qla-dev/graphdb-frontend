import type {
  ParsedSchema,
  SchemaCodeByFormat,
  SchemaCodeFormat,
  SchemaColumn,
  SchemaTable
} from "@/types/schema";

export const schemaCodeFormats: SchemaCodeFormat[] = [
  "dbml",
  "sql",
  "postgresql"
];

const sqlKeywords = new Set([
  "group",
  "order",
  "select",
  "table",
  "user",
  "where"
]);

function splitIdentifier(value: string) {
  return value.split(".").map((part) => part.trim()).filter(Boolean);
}

function simpleIdentifier(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function dbmlIdentifier(value: string) {
  const parts = splitIdentifier(value);
  if (parts.length === 0) {
    return "unnamed";
  }

  return parts
    .map((part) =>
      simpleIdentifier(part) ? part : `"${part.replaceAll('"', '\\"')}"`
    )
    .join(".");
}

function sqlIdentifier(value: string) {
  const parts = splitIdentifier(value);
  if (parts.length === 0) {
    return "unnamed";
  }

  return parts
    .map((part) => {
      const lower = part.toLowerCase();
      if (simpleIdentifier(part) && !sqlKeywords.has(lower)) {
        return part;
      }

      return `"${part.replaceAll('"', '""')}"`;
    })
    .join(".");
}

function normalizedType(type: string) {
  return type.trim().replace(/\s+/g, " ").toLowerCase();
}

function baseType(type: string) {
  return normalizedType(type).replace(/\([^)]*\)/g, "").trim();
}

function dbmlType(column: SchemaColumn) {
  const type = baseType(column.type);

  if (!type) {
    return "varchar";
  }

  if (type.startsWith("varchar") || type === "character varying") {
    return "varchar";
  }

  if (type === "int4" || type === "serial") {
    return "integer";
  }

  if (type === "int8" || type === "bigserial") {
    return "bigint";
  }

  if (type === "bool") {
    return "boolean";
  }

  if (type === "decimal" || type === "numeric") {
    return "decimal";
  }

  if (type === "double precision") {
    return "double";
  }

  if (type === "timestamptz" || type === "timestamp with time zone") {
    return "timestamptz";
  }

  if (type === "timestamp without time zone") {
    return "timestamp";
  }

  return type.includes(" ") ? type.split(" ")[0]! : column.type.trim() || "varchar";
}

function sqlType(column: SchemaColumn, format: SchemaCodeFormat) {
  const type = baseType(column.type);
  const isPostgres = format === "postgresql";

  if (!type) {
    return isPostgres ? "TEXT" : "VARCHAR(255)";
  }

  if (
    type === "string" ||
    type === "varchar" ||
    type === "character varying"
  ) {
    return isPostgres ? "TEXT" : "VARCHAR(255)";
  }

  if (type === "text" || type === "citext") {
    return isPostgres ? "TEXT" : "TEXT";
  }

  if (type === "int" || type === "int4") {
    return "INTEGER";
  }

  if (type === "int8") {
    return "BIGINT";
  }

  if (type === "bool") {
    return "BOOLEAN";
  }

  if (type === "decimal" || type === "numeric") {
    return "DECIMAL(12, 2)";
  }

  if (type === "timestamp with time zone" || type === "timestamptz") {
    return isPostgres ? "TIMESTAMPTZ" : "TIMESTAMP";
  }

  if (type === "timestamp without time zone") {
    return "TIMESTAMP";
  }

  return column.type.trim().toUpperCase();
}

function columnReference(column: SchemaColumn) {
  if (!column.references?.table || !column.references.column) {
    return null;
  }

  return {
    table: column.references.table,
    column: column.references.column
  };
}

function renderDbmlColumn(column: SchemaColumn) {
  const settings: string[] = [];
  const reference = columnReference(column);

  if (column.isPrimaryKey) {
    settings.push("primary key");
  }

  if (!column.nullable && !column.isPrimaryKey) {
    settings.push("not null");
  }

  if (column.isUnique) {
    settings.push("unique");
  }

  if (reference) {
    settings.push(
      `ref: > ${dbmlIdentifier(reference.table)}.${dbmlIdentifier(
        reference.column
      )}`
    );
  }

  return `  ${dbmlIdentifier(column.name)} ${dbmlType(column)}${
    settings.length ? ` [${settings.join(", ")}]` : ""
  }`;
}

function renderDbmlTable(table: SchemaTable) {
  return `Table ${dbmlIdentifier(table.name)} {\n${table.columns
    .map(renderDbmlColumn)
    .join("\n")}\n}`;
}

function renderSqlColumn(
  column: SchemaColumn,
  format: SchemaCodeFormat,
  inlinePrimaryKey: boolean
) {
  const clauses = [
    sqlIdentifier(column.name),
    sqlType(column, format),
    column.isPrimaryKey && inlinePrimaryKey ? "PRIMARY KEY" : "",
    !column.nullable && !column.isPrimaryKey ? "NOT NULL" : "",
    column.isUnique ? "UNIQUE" : ""
  ].filter(Boolean);
  const reference = columnReference(column);

  if (reference) {
    clauses.push(
      `REFERENCES ${sqlIdentifier(reference.table)}(${sqlIdentifier(
        reference.column
      )})`
    );
  }

  return `  ${clauses.join(" ")}`;
}

function renderSqlTable(table: SchemaTable, format: SchemaCodeFormat) {
  const primaryKeyColumns = table.columns.filter(
    (column) => column.isPrimaryKey
  );
  const useInlinePrimaryKey = primaryKeyColumns.length <= 1;
  const definitions = table.columns.map((column) =>
    renderSqlColumn(column, format, useInlinePrimaryKey)
  );

  if (!useInlinePrimaryKey) {
    definitions.push(
      `  PRIMARY KEY (${primaryKeyColumns
        .map((column) => sqlIdentifier(column.name))
        .join(", ")})`
    );
  }

  return `CREATE TABLE ${sqlIdentifier(table.name)} (\n${definitions.join(
    ",\n"
  )}\n);`;
}

function renderDbml(schema: ParsedSchema) {
  return schema.tables.map(renderDbmlTable).join("\n\n");
}

function renderSql(schema: ParsedSchema, format: SchemaCodeFormat) {
  return schema.tables.map((table) => renderSqlTable(table, format)).join("\n\n");
}

export function generateSchemaCode(
  schema: ParsedSchema,
  format: SchemaCodeFormat
) {
  if (format === "dbml") {
    return renderDbml(schema);
  }

  return renderSql(schema, format);
}

export function generateSchemaCodeBundle(
  schema: ParsedSchema,
  overrides: Partial<SchemaCodeByFormat> = {}
): SchemaCodeByFormat {
  return {
    dbml: overrides.dbml ?? generateSchemaCode(schema, "dbml"),
    sql: overrides.sql ?? generateSchemaCode(schema, "sql"),
    postgresql: overrides.postgresql ?? generateSchemaCode(schema, "postgresql")
  };
}
