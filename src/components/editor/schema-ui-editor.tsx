import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Database,
  GitBranch,
  KeyRound,
  Link2,
  Plus,
  Trash2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useSchemaStore } from "@/lib/store/schema-store";
import type { SchemaColumn, SchemaTable } from "@/types/schema";

const commonTypes = [
  "uuid",
  "varchar",
  "text",
  "integer",
  "bigint",
  "decimal",
  "boolean",
  "timestamp",
  "timestamptz",
  "jsonb"
];

const typeAliases: Record<string, string> = {
  bool: "boolean",
  boolean: "boolean",
  decimal: "decimal",
  int: "integer",
  int4: "integer",
  int8: "bigint",
  integer: "integer",
  numeric: "decimal",
  "character varying": "varchar",
  "double precision": "double",
  "timestamp without time zone": "timestamp",
  "timestamp with time zone": "timestamptz"
};

function referenceValue(column: SchemaColumn) {
  if (!column.references) {
    return "none";
  }

  return `${column.references.table}::${column.references.column}`;
}

function parseReferenceValue(value: string) {
  if (value === "none") {
    return null;
  }

  const [table, column] = value.split("::");
  return table && column ? { table, column } : null;
}

function truncateLinkLabel(value: string, maxLength = 5) {
  return value.length > maxLength
    ? `${value.slice(0, maxLength)}..`
    : value;
}

function truncateTypeLabel(value: string, maxLength = 8) {
  return value.length > maxLength
    ? `${value.slice(0, maxLength)}..`
    : value;
}

function normalizedTypeSignature(type: string) {
  const normalized = type.trim().toLowerCase().replace(/\s+/g, " ");
  const match = normalized.match(/^(.+?)(?:\(([^)]*)\))?$/);
  const baseType = (match?.[1] ?? normalized).trim();
  const lengthSpec = (match?.[2] ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(",");

  const canonicalBaseType = typeAliases[baseType] ?? baseType;

  return {
    baseType: canonicalBaseType,
    lengthSpec
  };
}

function linkCompatibility(sourceType: string, targetType: string) {
  const sourceSignature = normalizedTypeSignature(sourceType);
  const targetSignature = normalizedTypeSignature(targetType);

  if (sourceSignature.baseType !== targetSignature.baseType) {
    return {
      isCompatible: false,
      reason: "Type mismatch"
    };
  }

  if (sourceSignature.lengthSpec !== targetSignature.lengthSpec) {
    return {
      isCompatible: false,
      reason: "Length mismatch"
    };
  }

  return {
    isCompatible: true,
    reason: "Compatible"
  };
}

function tableRelationshipCount(table: SchemaTable) {
  return table.columns.filter((column) => column.references).length;
}

function typeOptionsForColumn(column: SchemaColumn) {
  const currentType = column.type.trim();

  if (currentType && !commonTypes.includes(currentType)) {
    return [currentType, ...commonTypes];
  }

  return commonTypes;
}

function schemaTableKey(tables: SchemaTable[]) {
  return String(tables.length);
}

function ColumnFlags({
  column,
  tableId
}: {
  column: SchemaColumn;
  tableId: string;
}) {
  const updateColumn = useSchemaStore((state) => state.updateColumn);
  const flags = [
    {
      label: "PK",
      title: "Primary key",
      active: column.isPrimaryKey,
      onClick: () =>
        updateColumn(tableId, column.id, {
          isPrimaryKey: !column.isPrimaryKey,
          nullable: column.isPrimaryKey ? column.nullable : false
        })
    },
    {
      label: "Required",
      title: "Required value",
      active: !column.nullable,
      onClick: () =>
        updateColumn(tableId, column.id, { nullable: !column.nullable })
    },
    {
      label: "Unique",
      title: "Unique value",
      active: column.isUnique,
      onClick: () =>
        updateColumn(tableId, column.id, { isUnique: !column.isUnique })
    }
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((flag) => (
        <button
          key={flag.label}
          type="button"
          title={flag.title}
          onClick={flag.onClick}
          className={`h-7 rounded border px-2 text-[11px] font-semibold transition-colors ${
            flag.active
              ? "border-primary/60 bg-primary/14 text-primary"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          {flag.label}
        </button>
      ))}
    </div>
  );
}

function ColumnTypeSelect({
  column,
  tableId
}: {
  column: SchemaColumn;
  tableId: string;
}) {
  const updateColumn = useSchemaStore((state) => state.updateColumn);
  const typeOptions = useMemo(() => typeOptionsForColumn(column), [column]);

  return (
    <Select
      value={column.type}
      onValueChange={(value) => updateColumn(tableId, column.id, { type: value })}
    >
      <SelectTrigger className="h-9 min-w-0 flex-1" aria-label={`${column.name} data type`}>
        <SelectValue placeholder="Select type">
          <span className="block max-w-full overflow-hidden whitespace-nowrap">
            {truncateTypeLabel(column.type)}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {typeOptions.map((type, index) => (
          <SelectItem key={`${type}-${index}`} value={type}>
            {type}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ColumnRow({
  table,
  column,
  tables
}: {
  table: SchemaTable;
  column: SchemaColumn;
  tables: SchemaTable[];
}) {
  const updateColumn = useSchemaStore((state) => state.updateColumn);
  const deleteColumn = useSchemaStore((state) => state.deleteColumn);
  const setColumnReference = useSchemaStore((state) => state.setColumnReference);
  const referenceOptions = useMemo(
    () =>
      tables.flatMap((targetTable) =>
        targetTable.columns.map((targetColumn) => {
          const isSameColumn =
            targetTable.id === table.id && targetColumn.id === column.id;
          const compatibility = linkCompatibility(column.type, targetColumn.type);

          return {
            value: `${targetTable.name}::${targetColumn.name}`,
            label: `${targetTable.name}.${targetColumn.name}`,
            type: targetColumn.type,
            disabled: isSameColumn || !compatibility.isCompatible,
            isCompatible: compatibility.isCompatible && !isSameColumn,
            reason: isSameColumn ? "Same field" : compatibility.reason
          };
        })
      ),
    [column.id, column.type, table.id, tables]
  );
  const selectedReferenceLabel =
    referenceOptions.find((option) => option.value === referenceValue(column))
      ?.label ?? "";

  return (
    <div className="border-border bg-secondary/85 grid gap-2 rounded-md border p-2 dark:bg-[#090909]">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={column.name}
          onChange={(event) =>
            updateColumn(table.id, column.id, { name: event.target.value })
          }
          aria-label={`${column.name} column name`}
        />
        <div className="flex min-w-0 gap-2">
          <ColumnTypeSelect
            column={column}
            tableId={table.id}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => deleteColumn(table.id, column.id)}
            aria-label={`Delete ${column.name}`}
            className="shrink-0"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-2 xl:grid-cols-[auto_minmax(0,1fr)]">
        <ColumnFlags tableId={table.id} column={column} />
        <Select
          value={referenceValue(column)}
          onValueChange={(value) =>
            setColumnReference(
              table.id,
              column.id,
              parseReferenceValue(value)
            )
          }
        >
          <SelectTrigger className="h-8 min-w-0">
            <SelectValue placeholder="No link">
              {selectedReferenceLabel ? (
                <span className="block max-w-full overflow-hidden whitespace-nowrap">
                  {truncateLinkLabel(selectedReferenceLabel)}
                </span>
              ) : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No link</SelectItem>
            {referenceOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={
                  option.isCompatible
                    ? "text-primary focus:bg-primary/10 focus:text-primary"
                    : "text-destructive data-[disabled]:text-destructive data-[disabled]:opacity-100"
                }
              >
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="truncate">{option.label}</span>
                  <span className="shrink-0 text-[11px] font-semibold">
                    {option.isCompatible ? option.type : option.reason}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function SchemaUiEditor() {
  const schema = useSchemaStore((state) => state.schema);
  const addTable = useSchemaStore((state) => state.addTable);
  const updateTable = useSchemaStore((state) => state.updateTable);
  const deleteTable = useSchemaStore((state) => state.deleteTable);
  const addColumn = useSchemaStore((state) => state.addColumn);
  const tableKey = schemaTableKey(schema.tables);
  const [openTableIndexes, setOpenTableIndexes] = useState<number[]>([]);
  const [openStateKey, setOpenStateKey] = useState(tableKey);
  const [tablePendingDelete, setTablePendingDelete] =
    useState<SchemaTable | null>(null);

  const activeOpenTableIndexes =
    openStateKey === tableKey ? openTableIndexes : [];

  const toggleTable = (tableIndex: number) => {
    setOpenStateKey(tableKey);
    setOpenTableIndexes((current) =>
      current.includes(tableIndex)
        ? current.filter((index) => index !== tableIndex)
        : [...current, tableIndex]
    );
  };

  return (
    <div className="border-border bg-card h-full min-h-0 border-y dark:bg-[#0d0d0c]">
      <ScrollArea className="h-full">
        <div className="space-y-3 p-3">
          <div className="border-border bg-secondary/45 rounded-md border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Builder</div>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  Name tables, choose field types, mark keys, and connect data.
                </p>
              </div>
              <Button type="button" size="sm" onClick={addTable}>
                <Plus className="size-4" />
                Table
              </Button>
            </div>
          </div>

          {schema.tables.length === 0 ? (
            <div className="border-border text-muted-foreground rounded-md border p-5 text-center text-sm">
              Start with a table.
            </div>
          ) : null}

          {schema.tables.length > 0 ? (
            <div className="divide-border/60 divide-y">
              {schema.tables.map((table, tableIndex) => {
                const isOpen = activeOpenTableIndexes.includes(tableIndex);

                return (
                  <div
                    key={`table-${tableIndex}`}
                    className="py-3 first:pt-0 last:pb-0"
                  >
                    <section className="border-border bg-secondary/35 overflow-hidden rounded-md border dark:bg-[#181817]">
                      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 p-2">
                        <button
                          type="button"
                          onClick={() => toggleTable(tableIndex)}
                          className="text-muted-foreground hover:text-foreground flex size-8 items-center justify-center rounded border border-transparent hover:border-border"
                          aria-label={isOpen ? "Collapse table" : "Expand table"}
                        >
                          {isOpen ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </button>

                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="gap-1">
                              <Database className="size-3" />
                              {table.columns.length} fields
                            </Badge>
                            <Badge variant="secondary" className="gap-1">
                              <GitBranch className="size-3" />
                              {tableRelationshipCount(table)} links
                            </Badge>
                          </div>
                          <Input
                            value={table.name}
                            onChange={(event) =>
                              updateTable(table.id, { name: event.target.value })
                            }
                            aria-label={`${table.name} table name`}
                            className="font-semibold"
                          />
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setTablePendingDelete(table)}
                          aria-label={`Delete ${table.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>

                      {isOpen ? (
                        <div className="border-border bg-secondary/65 space-y-2 border-t p-2 dark:bg-[#10100f]">
                          <div className="text-muted-foreground flex items-center gap-2 px-1 text-[11px] font-semibold tracking-[0.14em] uppercase">
                            <KeyRound className="size-3.5" />
                            Fields
                          </div>
                          {table.columns.map((column, columnIndex) => (
                            <ColumnRow
                              key={`column-${columnIndex}`}
                              table={table}
                              column={column}
                              tables={schema.tables}
                            />
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addColumn(table.id)}
                            className="border-primary/50 text-primary hover:border-primary/70 hover:bg-primary/10 hover:text-primary w-full"
                          >
                            <Plus className="size-4" />
                            Add field
                          </Button>
                        </div>
                      ) : null}
                    </section>
                  </div>
                );
              })}
            </div>
          ) : null}

          {schema.relationships.length > 0 ? (
            <section className="border-border bg-secondary/30 rounded-md border p-3">
              <div className="text-muted-foreground mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] uppercase">
                <Link2 className="size-3.5" />
                Connections
              </div>
              <div className="space-y-1">
                {schema.relationships.map((relationship) => (
                  <div
                    key={relationship.id}
                    className="text-muted-foreground truncate text-xs"
                  >
                    {relationship.label}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </ScrollArea>

      <ConfirmDestructiveDialog
        open={Boolean(tablePendingDelete)}
        title="Delete table?"
        description={`This will remove ${tablePendingDelete?.name ?? "this table"} and clear links pointing to it.`}
        confirmLabel="Delete table"
        onCancel={() => setTablePendingDelete(null)}
        onConfirm={() => {
          if (tablePendingDelete) {
            deleteTable(tablePendingDelete.id);
          }
          setTablePendingDelete(null);
        }}
      />
    </div>
  );
}
