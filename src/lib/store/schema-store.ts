import { create } from "zustand";
import { mockAiProvider } from "@/lib/ai";
import { generateSchemaCodeBundle } from "@/lib/generator/schema-code";
import { findElementForLine, parseSchema } from "@/lib/parser";
import {
  columnId,
  findColumn,
  normalizeIdentifier,
  relationshipId,
  resolveTableName,
  tableId,
  unqualifiedIdentifier
} from "@/lib/parser/common";
import {
  getActiveSchemeId,
  loadPersistedSchemes,
  savePersistedSchemes,
  setActiveSchemeId
} from "@/lib/persistence/scheme-storage";
import { samplePresets, starterDbml } from "@/lib/samples";
import type {
  CanvasBounds,
  CanvasPoint,
  ParseError,
  ParsedSchema,
  PublishedApi,
  PersistedScheme,
  SaveStatus,
  SchemaCodeByFormat,
  SchemaCodeFormat,
  SchemaColumn,
  SchemaElementRef,
  SchemaFormat,
  SchemaGroup,
  SchemaPreset,
  SchemaTable
} from "@/types/schema";

interface UndoSnapshot {
  schemeName: string;
  code: string;
  format: SchemaFormat;
  codeFormat: SchemaCodeFormat;
  codeByFormat: SchemaCodeByFormat;
  schema: ParsedSchema;
  errors: ParseError[];
  nodePositions: Record<string, CanvasPoint>;
  groups: SchemaGroup[];
  selectedTableIds: string[];
  clipboardTableIds: string[];
}

interface SchemaStore {
  currentSchemeId: string;
  schemeName: string;
  savedSchemes: PersistedScheme[];
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  storageHydrated: boolean;
  code: string;
  format: SchemaFormat;
  codeFormat: SchemaCodeFormat;
  codeByFormat: SchemaCodeByFormat;
  schema: ParsedSchema;
  errors: ParseError[];
  hoveredElement: SchemaElementRef | null;
  selectedElement: SchemaElementRef | null;
  searchQuery: string;
  aiPrompt: string;
  isGenerating: boolean;
  history: string[];
  lastAiSummary: string | null;
  nodePositions: Record<string, CanvasPoint>;
  groups: SchemaGroup[];
  selectedTableIds: string[];
  clipboardTableIds: string[];
  undoStack: UndoSnapshot[];
  publishedApi: PublishedApi | null;
  initializePersistence: () => void;
  saveCurrentScheme: () => Promise<void>;
  createScheme: (name: string, starter?: SchemaPreset) => void;
  loadScheme: (schemeId: string) => void;
  deleteScheme: (schemeId: string) => void;
  renameSavedScheme: (schemeId: string, name: string) => void;
  setSchemeName: (name: string) => void;
  setCode: (code: string) => void;
  setFormat: (format: SchemaFormat) => void;
  addTable: () => void;
  updateTable: (tableId: string, updates: Partial<Pick<SchemaTable, "name">>) => void;
  deleteTable: (tableId: string) => void;
  addColumn: (tableId: string) => void;
  updateColumn: (
    tableId: string,
    columnId: string,
    updates: Partial<
      Pick<
        SchemaColumn,
        "name" | "type" | "nullable" | "isPrimaryKey" | "isUnique"
      >
    >
  ) => void;
  deleteColumn: (tableId: string, columnId: string) => void;
  setColumnReference: (
    tableId: string,
    columnId: string,
    reference: { table: string; column: string } | null
  ) => void;
  loadPreset: (preset: SchemaPreset) => void;
  resetCode: () => void;
  updateNodePosition: (nodeId: string, position: CanvasPoint) => void;
  setSelectedTableIds: (tableIds: string[]) => void;
  addGroup: (
    title: string,
    tableIds: string[],
    bounds: CanvasBounds
  ) => SchemaGroup;
  updateGroupBounds: (groupId: string, bounds: CanvasBounds) => void;
  copySelectedTables: () => string[];
  cutSelectedTables: () => string[];
  clearSearch: () => void;
  setHoveredElement: (element: SchemaElementRef | null) => void;
  setHoveredFromLine: (lineNumber: number | null) => void;
  setSelectedElement: (element: SchemaElementRef | null) => void;
  setSearchQuery: (query: string) => void;
  setAiPrompt: (prompt: string) => void;
  generateFromPrompt: () => Promise<void>;
  undo: () => void;
  setPublishedApi: (publishedApi: PublishedApi | null) => void;
}

function isCodeFormat(format: SchemaFormat): format is SchemaCodeFormat {
  return format === "dbml" || format === "sql" || format === "postgresql";
}

function parse(code: string, format: SchemaCodeFormat) {
  return parseSchema(code, format);
}

function schemeId() {
  return `scheme:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function arraysEqual(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function pointEqual(a: CanvasPoint | undefined, b: CanvasPoint) {
  return Boolean(a) && Math.abs(a!.x - b.x) < 0.5 && Math.abs(a!.y - b.y) < 0.5;
}

function boundsEqual(a: CanvasBounds, b: CanvasBounds) {
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

function markDirty(state: SchemaStore): Partial<SchemaStore> {
  return state.saveStatus === "dirty" ? {} : { saveStatus: "dirty" };
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function undoSnapshot(state: SchemaStore): UndoSnapshot {
  return clonePlain({
    schemeName: state.schemeName,
    code: state.code,
    format: state.format,
    codeFormat: state.codeFormat,
    codeByFormat: state.codeByFormat,
    schema: state.schema,
    errors: state.errors,
    nodePositions: state.nodePositions,
    groups: state.groups,
    selectedTableIds: state.selectedTableIds,
    clipboardTableIds: state.clipboardTableIds
  });
}

function nextUndoStack(state: SchemaStore) {
  return [undoSnapshot(state), ...state.undoStack].slice(0, 10);
}

function shouldResetDefaultLayout(schema: ParsedSchema) {
  return schema.relationships.length === 0 || schema.tables.length > 10;
}

function tableSignature(schema: ParsedSchema) {
  return schema.tables
    .map((table) => table.id)
    .sort()
    .join("|");
}

function filterNodePositions(
  positions: Record<string, CanvasPoint>,
  schema: ParsedSchema
) {
  const tableIds = new Set(schema.tables.map((table) => table.id));

  return Object.fromEntries(
    Object.entries(positions).filter(([tableId]) => tableIds.has(tableId))
  );
}

function uniqueModelName(base: string, existing: string[]) {
  const used = new Set(existing.map((name) => name.toLowerCase()));
  let index = existing.length + 1;
  let candidate = base;

  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}_${index}`;
    index += 1;
  }

  return candidate;
}

function normalizeModelName(value: string, fallback: string) {
  return normalizeIdentifier(value.trim() || fallback) || fallback;
}

function rebuildSchemaFromTables(
  tables: SchemaTable[],
  format: SchemaCodeFormat,
  source = ""
): ParsedSchema {
  const normalizedTables: SchemaTable[] = tables.map((table, tableIndex) => {
    const tableName = normalizeModelName(table.name, `table_${tableIndex + 1}`);
    const nextTableId = tableId(tableName);

    return {
      ...table,
      id: nextTableId,
      name: tableName,
      schema: tableName.includes(".") ? tableName.split(".").at(0) : undefined,
      source: undefined,
      columns: table.columns.map((column, columnIndex) => {
        const columnName = normalizeModelName(
          column.name,
          `column_${columnIndex + 1}`
        );
        const isPrimaryKey = Boolean(column.isPrimaryKey);

        return {
          ...column,
          id: columnId(tableName, columnName),
          tableId: nextTableId,
          name: columnName,
          type: column.type.trim() || "varchar",
          nullable: isPrimaryKey ? false : Boolean(column.nullable),
          isPrimaryKey,
          isForeignKey: false,
          isUnique: Boolean(column.isUnique),
          references: undefined,
          source: undefined
        };
      })
    };
  });

  const schema: ParsedSchema = {
    format,
    source,
    warnings: [],
    tables: normalizedTables,
    relationships: [],
    sourceMap: {},
    parsedAt: Date.now()
  };

  tables.forEach((table, tableIndex) => {
    table.columns.forEach((column, columnIndex) => {
      const reference = column.references;
      const fromTable = normalizedTables[tableIndex];
      const fromColumn = fromTable?.columns[columnIndex];

      if (!reference || !fromTable || !fromColumn) {
        return;
      }

      const targetTableName = resolveTableName(
        normalizedTables,
        reference.table
      );
      const targetTable = normalizedTables.find(
        (item) => item.name === targetTableName
      );
      const targetColumn = findColumn(targetTable, reference.column);

      if (!targetTable || !targetColumn) {
        schema.warnings.push(
          `Could not connect ${fromTable.name}.${fromColumn.name} to ${reference.table}.${reference.column}.`
        );
        return;
      }

      const nextRelationshipId = relationshipId(
        fromTable.name,
        fromColumn.name,
        targetTable.name,
        targetColumn.name
      );

      if (
        schema.relationships.some(
          (relationship) => relationship.id === nextRelationshipId
        )
      ) {
        return;
      }

      fromColumn.isForeignKey = true;
      fromColumn.references = {
        table: targetTable.name,
        column: targetColumn.name,
        relationshipId: nextRelationshipId
      };

      schema.relationships.push({
        id: nextRelationshipId,
        from: {
          tableId: fromTable.id,
          columnId: fromColumn.id,
          table: fromTable.name,
          column: fromColumn.name
        },
        to: {
          tableId: targetTable.id,
          columnId: targetColumn.id,
          table: targetTable.name,
          column: targetColumn.name
        },
        label: `${unqualifiedIdentifier(fromTable.name)}.${fromColumn.name} -> ${unqualifiedIdentifier(
          targetTable.name
        )}.${targetColumn.name}`
      });
    });
  });

  return schema;
}

function generatedStateFromTables(
  state: SchemaStore,
  tables: SchemaTable[]
): Partial<SchemaStore> {
  const model = rebuildSchemaFromTables(tables, state.codeFormat);
  const codeByFormat = generateSchemaCodeBundle(model);
  const code = codeByFormat[state.codeFormat];
  const result = parse(code, state.codeFormat);
  const tableSetChanged =
    tableSignature(state.schema) !== tableSignature(result.schema);

  return {
    code,
    codeByFormat,
    schema: result.schema,
    errors: result.errors,
    nodePositions:
      tableSetChanged || shouldResetDefaultLayout(result.schema)
        ? {}
        : filterNodePositions(state.nodePositions, result.schema),
    selectedTableIds: state.selectedTableIds.filter((tableIdToKeep) =>
      result.schema.tables.some((table) => table.id === tableIdToKeep)
    ),
    groups: state.groups
      .map((group) => ({
        ...group,
        tableIds: group.tableIds.filter((tableIdToKeep) =>
          result.schema.tables.some((table) => table.id === tableIdToKeep)
        )
      }))
      .filter((group) => group.tableIds.length > 0),
    hoveredElement: null,
    selectedElement: null,
    undoStack: nextUndoStack(state),
    saveStatus: "dirty"
  };
}

function toPersistedScheme(
  state: SchemaStore,
  updatedAt = Date.now()
): PersistedScheme {
  const existing = state.savedSchemes.find(
    (scheme) => scheme.id === state.currentSchemeId
  );

  return {
    id: state.currentSchemeId,
    name: state.schemeName.trim() || "Untitled scheme",
    code: state.code,
    format: state.format,
    codeFormat: state.codeFormat,
    codeByFormat: state.codeByFormat,
    nodePositions: state.nodePositions,
    groups: state.groups,
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
    tableCount: state.schema.tables.length,
    relationshipCount: state.schema.relationships.length
  };
}

function applyScheme(scheme: PersistedScheme) {
  const codeFormat =
    scheme.codeFormat ?? (isCodeFormat(scheme.format) ? scheme.format : "dbml");
  const code = scheme.codeByFormat?.[codeFormat] ?? scheme.code;
  const result = parse(code, codeFormat);
  const generatedCodeByFormat = generateSchemaCodeBundle(result.schema, {
    ...scheme.codeByFormat,
    [codeFormat]: code
  });

  return {
    currentSchemeId: scheme.id,
    schemeName: scheme.name,
    code,
    format: scheme.format,
    codeFormat,
    codeByFormat: generatedCodeByFormat,
    schema: result.schema,
    errors: result.errors,
    nodePositions: shouldResetDefaultLayout(result.schema)
      ? {}
      : filterNodePositions(scheme.nodePositions ?? {}, result.schema),
    groups: scheme.groups ?? [],
    hoveredElement: null,
    selectedElement: null,
    selectedTableIds: [],
    searchQuery: "",
    undoStack: [],
    saveStatus: "saved" as SaveStatus,
    lastSavedAt: scheme.updatedAt
  };
}

const initialResult = parse(starterDbml, "dbml");
const initialCodeByFormat = generateSchemaCodeBundle(initialResult.schema, {
  dbml: starterDbml
});
const initialSchemeId = "scheme:local-default";

export const useSchemaStore = create<SchemaStore>((set, get) => ({
  currentSchemeId: initialSchemeId,
  schemeName: "Untitled production schema",
  savedSchemes: [],
  saveStatus: "dirty",
  lastSavedAt: null,
  storageHydrated: false,
  code: starterDbml,
  format: "dbml",
  codeFormat: "dbml",
  codeByFormat: initialCodeByFormat,
  schema: initialResult.schema,
  errors: initialResult.errors,
  hoveredElement: null,
  selectedElement: null,
  searchQuery: "",
  aiPrompt: "",
  isGenerating: false,
  history: samplePresets.map((preset) => preset.name),
  lastAiSummary: null,
  nodePositions: {},
  groups: [],
  selectedTableIds: [],
  clipboardTableIds: [],
  undoStack: [],
  publishedApi: null,
  initializePersistence: () => {
    if (get().storageHydrated) {
      return;
    }

    const savedSchemes = loadPersistedSchemes();
    const activeSchemeId = getActiveSchemeId();
    const activeScheme =
      savedSchemes.find((scheme) => scheme.id === activeSchemeId) ??
      savedSchemes[0];

    if (activeScheme) {
      set({
        ...applyScheme(activeScheme),
        savedSchemes,
        storageHydrated: true
      });
      return;
    }

    set({
      savedSchemes,
      storageHydrated: true,
      saveStatus: "dirty"
    });
  },
  saveCurrentScheme: async () => {
    set({ saveStatus: "saving" });

    try {
      const state = get();
      const persisted = toPersistedScheme(state);
      const savedSchemes = [
        persisted,
        ...state.savedSchemes.filter((scheme) => scheme.id !== persisted.id)
      ].sort((a, b) => b.updatedAt - a.updatedAt);

      savePersistedSchemes(savedSchemes);
      setActiveSchemeId(persisted.id);
      set({
        savedSchemes,
        saveStatus: "saved",
        lastSavedAt: persisted.updatedAt
      });
    } catch {
      set({ saveStatus: "error" });
    }
  },
  createScheme: (name, starter = samplePresets[0]) => {
    const nextId = schemeId();
    const result = parse(starter.code, starter.format);
    const codeByFormat = generateSchemaCodeBundle(result.schema, {
      [starter.format]: starter.code
    });

    set({
      currentSchemeId: nextId,
      schemeName: name.trim() || "Untitled scheme",
      code: starter.code,
      format: starter.format,
      codeFormat: starter.format,
      codeByFormat,
      schema: result.schema,
      errors: result.errors,
      nodePositions: {},
      groups: [],
      hoveredElement: null,
      selectedElement: null,
      selectedTableIds: [],
      searchQuery: "",
      undoStack: [],
      saveStatus: "dirty"
    });
    setActiveSchemeId(nextId);
  },
  loadScheme: (schemeIdToLoad) => {
    const scheme = get().savedSchemes.find(
      (item) => item.id === schemeIdToLoad
    );

    if (!scheme) {
      return;
    }

    set(applyScheme(scheme));
    setActiveSchemeId(scheme.id);
  },
  deleteScheme: (schemeIdToDelete) => {
    const savedSchemes = get().savedSchemes.filter(
      (scheme) => scheme.id !== schemeIdToDelete
    );
    savePersistedSchemes(savedSchemes);

    if (get().currentSchemeId === schemeIdToDelete) {
      const nextScheme = savedSchemes[0];
      if (nextScheme) {
        set({ ...applyScheme(nextScheme), savedSchemes });
        setActiveSchemeId(nextScheme.id);
      } else {
        const result = parse(starterDbml, "dbml");
        const codeByFormat = generateSchemaCodeBundle(result.schema, {
          dbml: starterDbml
        });
        set({
          currentSchemeId: initialSchemeId,
          schemeName: "Untitled production schema",
          code: starterDbml,
          format: "dbml",
          codeFormat: "dbml",
          codeByFormat,
          schema: result.schema,
          errors: result.errors,
          nodePositions: {},
          groups: [],
          selectedTableIds: [],
          undoStack: [],
          savedSchemes,
          saveStatus: "dirty"
        });
      }
      return;
    }

    set({ savedSchemes });
  },
  renameSavedScheme: (schemeIdToRename, name) => {
    const cleaned = name.trim();
    if (!cleaned) {
      return;
    }

    const savedSchemes = get().savedSchemes.map((scheme) =>
      scheme.id === schemeIdToRename
        ? { ...scheme, name: cleaned, updatedAt: Date.now() }
        : scheme
    );
    savePersistedSchemes(savedSchemes);
    set((state) => ({
      savedSchemes,
      ...(state.currentSchemeId === schemeIdToRename
        ? { schemeName: cleaned, saveStatus: "saved" as SaveStatus }
        : {})
    }));
  },
  setSchemeName: (schemeName) =>
    set((state) =>
      state.schemeName === schemeName
        ? {}
        : {
            schemeName,
            undoStack: nextUndoStack(state),
            ...markDirty(state)
          }
    ),
  setCode: (code) => {
    const state = get();
    if (state.code === code) {
      return;
    }

    const codeFormat = state.format === "ui" ? state.codeFormat : state.format;
    const result = parse(code, codeFormat);
    const acceptedSchema =
      result.errors.length === 0 || result.schema.tables.length > 0
        ? result.schema
        : state.schema;
    const nextCodeByFormat =
      result.errors.length === 0
        ? generateSchemaCodeBundle(result.schema, { [codeFormat]: code })
        : {
            ...state.codeByFormat,
            [codeFormat]: code
          };
    const tableSetChanged =
      tableSignature(state.schema) !== tableSignature(acceptedSchema);
    set({
      code,
      codeFormat,
      codeByFormat: nextCodeByFormat,
      schema: acceptedSchema,
      errors: result.errors,
      nodePositions:
        tableSetChanged || shouldResetDefaultLayout(acceptedSchema)
          ? {}
          : filterNodePositions(state.nodePositions, acceptedSchema),
      selectedTableIds: state.selectedTableIds.filter((tableId) =>
        acceptedSchema.tables.some((table) => table.id === tableId)
      ),
      groups: state.groups
        .map((group) => ({
          ...group,
          tableIds: group.tableIds.filter((tableId) =>
            acceptedSchema.tables.some((table) => table.id === tableId)
          )
        }))
        .filter((group) => group.tableIds.length > 0),
      undoStack: nextUndoStack(state),
      saveStatus: "dirty"
    });
  },
  setFormat: (format) => {
    const state = get();
    if (state.format === format) {
      return;
    }

    if (format === "ui") {
      set({
        format,
        errors: [],
        hoveredElement: null,
        selectedElement: null,
        selectedTableIds: [],
        saveStatus: "dirty"
      });
      return;
    }

    const code =
      state.codeByFormat[format] || generateSchemaCodeBundle(state.schema)[format];
    const result = parse(code, format);
    const codeByFormat =
      result.errors.length === 0
        ? generateSchemaCodeBundle(result.schema, { [format]: code })
        : {
            ...state.codeByFormat,
            [format]: code
          };
    set({
      format,
      codeFormat: format,
      code,
      codeByFormat,
      schema: result.schema,
      errors: result.errors,
      nodePositions: shouldResetDefaultLayout(result.schema)
        ? {}
        : filterNodePositions(state.nodePositions, result.schema),
      hoveredElement: null,
      selectedElement: null,
      selectedTableIds: [],
      saveStatus: "dirty"
    });
  },
  addTable: () => {
    const state = get();
    const name = uniqueModelName(
      "new_table",
      state.schema.tables.map((table) => table.name)
    );
    const nextTableId = tableId(name);
    const nextTable: SchemaTable = {
      id: nextTableId,
      name,
      columns: [
        {
          id: columnId(name, "id"),
          tableId: nextTableId,
          name: "id",
          type: "uuid",
          nullable: false,
          isPrimaryKey: true,
          isForeignKey: false,
          isUnique: false
        }
      ]
    };

    set(generatedStateFromTables(state, [...state.schema.tables, nextTable]));
  },
  updateTable: (tableIdToUpdate, updates) => {
    const state = get();
    const table = state.schema.tables.find((item) => item.id === tableIdToUpdate);
    if (!table) {
      return;
    }

    const requestedName =
      updates.name === undefined
        ? table.name
        : normalizeModelName(updates.name, table.name);
    const nextName = uniqueModelName(
      requestedName,
      state.schema.tables
        .filter((item) => item.id !== tableIdToUpdate)
        .map((item) => item.name)
    );
    const nextTables = state.schema.tables.map((item) => ({
      ...item,
      name: item.id === tableIdToUpdate ? nextName : item.name,
      columns: item.columns.map((columnToClone) => ({
        ...columnToClone,
        references: columnToClone.references
          ? { ...columnToClone.references }
          : undefined
      }))
    }));

    if (nextName !== table.name) {
      for (const nextTable of nextTables) {
        for (const column of nextTable.columns) {
          if (column.references?.table === table.name) {
            column.references = {
              ...column.references,
              table: nextName
            };
          }
        }
      }
    }

    set(generatedStateFromTables(state, nextTables));
  },
  deleteTable: (tableIdToDelete) => {
    const state = get();
    const table = state.schema.tables.find((item) => item.id === tableIdToDelete);
    if (!table) {
      return;
    }

    const nextTables = state.schema.tables
      .filter((item) => item.id !== tableIdToDelete)
      .map((item) => ({
        ...item,
        columns: item.columns.map((column) =>
          column.references?.table === table.name
            ? {
                ...column,
                isForeignKey: false,
                references: undefined
              }
            : column
        )
      }));

    set(generatedStateFromTables(state, nextTables));
  },
  addColumn: (tableIdToUpdate) => {
    const state = get();
    const nextTables = state.schema.tables.map((table) => {
      if (table.id !== tableIdToUpdate) {
        return table;
      }

      const name = uniqueModelName(
        "new_column",
        table.columns.map((column) => column.name)
      );

      return {
        ...table,
        columns: [
          ...table.columns,
          {
            id: columnId(table.name, name),
            tableId: table.id,
            name,
            type: "varchar",
            nullable: true,
            isPrimaryKey: false,
            isForeignKey: false,
            isUnique: false
          }
        ]
      };
    });

    set(generatedStateFromTables(state, nextTables));
  },
  updateColumn: (tableIdToUpdate, columnIdToUpdate, updates) => {
    const state = get();
    const table = state.schema.tables.find((item) => item.id === tableIdToUpdate);
    const column = table?.columns.find((item) => item.id === columnIdToUpdate);
    if (!table || !column) {
      return;
    }

    const requestedName =
      updates.name === undefined
        ? column.name
        : normalizeModelName(updates.name, column.name);
    const nextName = uniqueModelName(
      requestedName,
      table.columns
        .filter((item) => item.id !== columnIdToUpdate)
        .map((item) => item.name)
    );
    const shouldPromotePrimaryKey = updates.isPrimaryKey === true;
    const nextTables = state.schema.tables.map((item) => ({
      ...item,
      columns: item.columns.map((candidate) => {
        const cloned = {
          ...candidate,
          references: candidate.references
            ? { ...candidate.references }
            : undefined
        };

        if (item.id !== tableIdToUpdate) {
          return cloned;
        }

        return candidate.id === columnIdToUpdate
          ? (() => {
              const isPrimaryKey =
                updates.isPrimaryKey ?? candidate.isPrimaryKey;

              return {
                ...cloned,
                ...updates,
                name: nextName,
                type: updates.type?.trim() || candidate.type,
                nullable: isPrimaryKey
                  ? false
                  : (updates.nullable ?? candidate.nullable),
                isPrimaryKey
              };
            })()
          : {
              ...cloned,
              isPrimaryKey: shouldPromotePrimaryKey
                ? false
                : cloned.isPrimaryKey
            };
      })
    }));

    if (nextName !== column.name) {
      for (const nextTable of nextTables) {
        for (const candidate of nextTable.columns) {
          if (
            candidate.references?.table === table.name &&
            candidate.references.column === column.name
          ) {
            candidate.references = {
              ...candidate.references,
              column: nextName
            };
          }
        }
      }
    }

    set(generatedStateFromTables(state, nextTables));
  },
  deleteColumn: (tableIdToUpdate, columnIdToDelete) => {
    const state = get();
    const table = state.schema.tables.find((item) => item.id === tableIdToUpdate);
    const column = table?.columns.find((item) => item.id === columnIdToDelete);
    if (!table || !column) {
      return;
    }

    const nextTables = state.schema.tables.map((item) => ({
      ...item,
      columns: item.columns
        .filter((candidate) => candidate.id !== columnIdToDelete)
        .map((candidate) =>
          candidate.references?.table === table.name &&
          candidate.references.column === column.name
            ? {
                ...candidate,
                isForeignKey: false,
                references: undefined
              }
            : candidate
        )
    }));

    set(generatedStateFromTables(state, nextTables));
  },
  setColumnReference: (tableIdToUpdate, columnIdToUpdate, reference) => {
    const state = get();
    const nextTables = state.schema.tables.map((table) => ({
      ...table,
      columns: table.columns.map((column) => {
        if (table.id !== tableIdToUpdate || column.id !== columnIdToUpdate) {
          return column;
        }

        return {
          ...column,
          isForeignKey: Boolean(reference),
          references: reference
            ? {
                table: reference.table,
                column: reference.column
              }
            : undefined
        };
      })
    }));

    set(generatedStateFromTables(state, nextTables));
  },
  loadPreset: (preset) => {
    const result = parse(preset.code, preset.format);
    const codeByFormat = generateSchemaCodeBundle(result.schema, {
      [preset.format]: preset.code
    });
    set((state) => ({
      code: preset.code,
      format: preset.format,
      codeFormat: preset.format,
      codeByFormat,
      schema: result.schema,
      errors: result.errors,
      hoveredElement: null,
      selectedElement: null,
      selectedTableIds: [],
      groups: [],
      nodePositions: {},
      undoStack: nextUndoStack(state),
      saveStatus: "dirty",
      history: [
        preset.name,
        ...state.history.filter((item) => item !== preset.name)
      ].slice(0, 8)
    }));
  },
  resetCode: () => {
    const currentFormat = get().codeFormat;
    const preset =
      samplePresets.find((item) => item.format === currentFormat) ??
      samplePresets[0];
    get().loadPreset(preset);
  },
  updateNodePosition: (nodeId, position) =>
    set((state) =>
      pointEqual(state.nodePositions[nodeId], position)
        ? {}
        : {
            nodePositions: {
              ...state.nodePositions,
              [nodeId]: position
            },
            undoStack: nextUndoStack(state),
            ...markDirty(state)
          }
    ),
  setSelectedTableIds: (selectedTableIds) =>
    set((state) =>
      arraysEqual(state.selectedTableIds, selectedTableIds)
        ? {}
        : { selectedTableIds }
    ),
  addGroup: (title, tableIds, bounds) => {
    const colors: SchemaGroup["color"][] = ["emerald", "cyan", "amber", "rose"];
    const group: SchemaGroup = {
      id: `group:${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      title,
      tableIds,
      bounds,
      color: colors[get().groups.length % colors.length]
    };

    set((state) => ({
      groups: [...state.groups, group],
      undoStack: nextUndoStack(state),
      ...markDirty(state)
    }));
    return group;
  },
  updateGroupBounds: (groupId, bounds) =>
    set((state) => {
      const group = state.groups.find((item) => item.id === groupId);
      if (!group || boundsEqual(group.bounds, bounds)) {
        return {};
      }

      return {
        groups: state.groups.map((item) =>
          item.id === groupId ? { ...item, bounds } : item
        ),
        undoStack: nextUndoStack(state),
        ...markDirty(state)
      };
    }),
  copySelectedTables: () => {
    const selectedTableIds = get().selectedTableIds;
    set({ clipboardTableIds: selectedTableIds });
    return selectedTableIds;
  },
  cutSelectedTables: () => {
    const selectedTableIds = get().selectedTableIds;
    set({ clipboardTableIds: selectedTableIds });
    return selectedTableIds;
  },
  clearSearch: () =>
    set({
      searchQuery: "",
      hoveredElement: null
    }),
  setHoveredElement: (element) =>
    set((state) =>
      state.hoveredElement?.id === element?.id &&
      state.hoveredElement?.kind === element?.kind
        ? {}
        : { hoveredElement: element }
    ),
  setHoveredFromLine: (lineNumber) => {
    if (!lineNumber) {
      get().setHoveredElement(null);
      return;
    }

    const element = findElementForLine(get().schema.sourceMap, lineNumber);
    get().setHoveredElement(element);
  },
  setSelectedElement: (element) =>
    set((state) =>
      state.selectedElement?.id === element?.id &&
      state.selectedElement?.kind === element?.kind
        ? {}
        : { selectedElement: element }
    ),
  setSearchQuery: (searchQuery) =>
    set((state) => (state.searchQuery === searchQuery ? {} : { searchQuery })),
  setAiPrompt: (aiPrompt) => set({ aiPrompt }),
  generateFromPrompt: async () => {
    const { aiPrompt, codeFormat, code } = get();
    if (!aiPrompt.trim()) {
      return;
    }

    set({ isGenerating: true, lastAiSummary: null });
    try {
      const response = await mockAiProvider.generateSchema({
        prompt: aiPrompt,
        format: codeFormat,
        currentCode: code
      });
      const result = parse(response.code, response.format);
      const codeByFormat = generateSchemaCodeBundle(result.schema, {
        [response.format]: response.code
      });

      set((state) => ({
        code: response.code,
        format: response.format,
        codeFormat: response.format,
        codeByFormat,
        schema: result.schema,
        errors: result.errors,
        aiPrompt: "",
        isGenerating: false,
        lastAiSummary: response.summary,
        selectedTableIds: [],
        groups: [],
        nodePositions: {},
        undoStack: nextUndoStack(state),
        saveStatus: "dirty",
        history: [
          aiPrompt,
          ...state.history.filter((item) => item !== aiPrompt)
        ].slice(0, 8)
      }));
    } catch (error) {
      set({
        isGenerating: false,
        errors: [
          {
            message: "AI generation failed.",
            detail:
              error instanceof Error
                ? error.message
                : "Unknown generation error."
          }
        ]
      });
    }
  },
  undo: () => {
    const [snapshot, ...rest] = get().undoStack;
    if (!snapshot) {
      return;
    }

    set({
      ...clonePlain(snapshot),
      undoStack: rest,
      hoveredElement: null,
      selectedElement: null,
      searchQuery: "",
      saveStatus: "dirty"
    });
  },
  setPublishedApi: (publishedApi) => set({ publishedApi })
}));
