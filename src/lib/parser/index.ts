import type {
  ParseResult,
  SchemaCodeFormat,
  SourceRange
} from "@/types/schema";
import { parseDbml } from "@/lib/parser/dbml";
import { parseSql } from "@/lib/parser/sql";
import { createEmptySchema } from "@/lib/parser/common";
import { validateSchema } from "@/lib/parser/validation";

export function parseSchema(
  source: string,
  format: SchemaCodeFormat
): ParseResult {
  const trimmed = source.trim();

  if (!trimmed) {
    return {
      schema: createEmptySchema(format, source),
      errors: []
    };
  }

  try {
    const result =
      format === "dbml" ? parseDbml(source, format) : parseSql(source, format);

    return {
      schema: result.schema,
      errors: [
        ...result.errors,
        ...validateSchema(source, format, result.schema)
      ]
    };
  } catch (error) {
    return {
      schema: createEmptySchema(format, source),
      errors: [
        {
          message: "The schema could not be parsed.",
          detail:
            error instanceof Error ? error.message : "Unknown parser failure."
        }
      ]
    };
  }
}

export function findElementForLine(
  sourceMap: Record<string, SourceRange>,
  lineNumber: number
) {
  const entries = Object.entries(sourceMap);
  const exactColumn = entries.find(
    ([id, range]) =>
      id.startsWith("column:") &&
      lineNumber >= range.startLine &&
      lineNumber <= range.endLine
  );

  if (exactColumn) {
    return { kind: "column" as const, id: exactColumn[0] };
  }

  const exactRelationship = entries.find(
    ([id, range]) =>
      id.startsWith("relationship:") &&
      lineNumber >= range.startLine &&
      lineNumber <= range.endLine
  );

  if (exactRelationship) {
    return { kind: "relationship" as const, id: exactRelationship[0] };
  }

  const table = entries.find(
    ([id, range]) =>
      id.startsWith("table:") &&
      lineNumber >= range.startLine &&
      lineNumber <= range.endLine
  );

  return table ? { kind: "table" as const, id: table[0] } : null;
}
