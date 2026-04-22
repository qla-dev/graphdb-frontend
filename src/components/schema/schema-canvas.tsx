import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from "react";
import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeMouseHandler,
  type NodeChange,
  type NodeMouseHandler,
  type OnSelectionChangeFunc
} from "@xyflow/react";
import { AlertTriangle, ChevronRight, Database, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { Button } from "@/components/ui/button";
import { DatabaseMinimap } from "@/components/schema/database-minimap";
import {
  SchemaContextMenu,
  type SchemaContextMenuState
} from "@/components/schema/schema-context-menu";
import { SchemaRelationshipEdge } from "@/components/schema/schema-relationship-edge";
import {
  SchemaSearch,
  buildSchemaSearchSuggestions,
  type SchemaSearchSuggestion
} from "@/components/schema/schema-search";
import { SchemaGroupNode } from "@/components/schema/schema-group-node";
import { SchemaTableNode } from "@/components/schema/schema-table-node";
import type { SchemaCanvasNode } from "@/components/schema/flow-types";
import { exportCanvasImage } from "@/lib/export/schema-export";
import {
  buildFlowElements,
  tableNodeHeight,
  tableNodeWidth
} from "@/lib/parser/layout";
import { useSchemaStore } from "@/lib/store/schema-store";
import { cn } from "@/lib/utils";
import type { CanvasBounds } from "@/types/schema";

const nodeTypes = {
  schemaTable: SchemaTableNode,
  schemaGroup: SchemaGroupNode
};

const edgeTypes = {
  schemaRelationship: SchemaRelationshipEdge
};

interface SchemaCanvasProps {
  isSidebarCollapsed?: boolean;
  onRestoreSidebar?: () => void;
}

function isTableNode(node: SchemaCanvasNode) {
  return node.type === "schemaTable";
}

function inferGroupTitle(tableNames: string[]) {
  const text = tableNames.join(" ").toLowerCase();

  if (/(user|member|account|team|auth)/.test(text)) {
    return "auth";
  }
  if (/(order|payment|invoice|subscription|billing)/.test(text)) {
    return "billing";
  }
  if (/(product|category|catalog|sku|stock)/.test(text)) {
    return "catalog";
  }
  if (/(shipment|warehouse|delivery|logistics)/.test(text)) {
    return "logistics";
  }

  return "group";
}

function boundsForNodes(nodes: SchemaCanvasNode[]): CanvasBounds | null {
  if (nodes.length === 0) {
    return null;
  }

  const rects = nodes.map((node) => {
    const width =
      node.type === "schemaTable"
        ? tableNodeWidth()
        : Number(node.width ?? node.data.group.bounds.width);
    const height =
      node.type === "schemaTable"
        ? tableNodeHeight(node.data.table.columns.length)
        : Number(node.height ?? node.data.group.bounds.height);

    return {
      x: node.position.x,
      y: node.position.y,
      right: node.position.x + width,
      bottom: node.position.y + height
    };
  });
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.right));
  const maxY = Math.max(...rects.map((rect) => rect.bottom));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function boundsForTables(nodes: SchemaCanvasNode[], tableIds: string[]) {
  const selectedNodes = nodes.filter(
    (node) => isTableNode(node) && tableIds.includes(node.id)
  );

  const bounds = boundsForNodes(selectedNodes);
  if (!bounds) {
    return null;
  }

  return {
    x: bounds.x - 48,
    y: bounds.y - 66,
    width: bounds.width + 96,
    height: bounds.height + 118
  };
}

function SchemaCanvasInner({
  isSidebarCollapsed = false,
  onRestoreSidebar
}: SchemaCanvasProps) {
  const { fitView, setCenter, fitBounds } = useReactFlow();
  const schema = useSchemaStore((state) => state.schema);
  const schemeName = useSchemaStore((state) => state.schemeName);
  const errors = useSchemaStore((state) => state.errors);
  const hoveredElement = useSchemaStore((state) => state.hoveredElement);
  const selectedElement = useSchemaStore((state) => state.selectedElement);
  const searchQuery = useSchemaStore((state) => state.searchQuery);
  const isGenerating = useSchemaStore((state) => state.isGenerating);
  const nodePositions = useSchemaStore((state) => state.nodePositions);
  const groups = useSchemaStore((state) => state.groups);
  const selectedTableIds = useSchemaStore((state) => state.selectedTableIds);
  const clipboardTableIds = useSchemaStore((state) => state.clipboardTableIds);
  const setSearchQuery = useSchemaStore((state) => state.setSearchQuery);
  const setHoveredElement = useSchemaStore((state) => state.setHoveredElement);
  const setSelectedElement = useSchemaStore(
    (state) => state.setSelectedElement
  );
  const updateNodePosition = useSchemaStore(
    (state) => state.updateNodePosition
  );
  const setSelectedTableIds = useSchemaStore(
    (state) => state.setSelectedTableIds
  );
  const addGroup = useSchemaStore((state) => state.addGroup);
  const deleteGroup = useSchemaStore((state) => state.deleteGroup);
  const updateGroupBounds = useSchemaStore((state) => state.updateGroupBounds);
  const copySelectedTables = useSchemaStore(
    (state) => state.copySelectedTables
  );
  const cutSelectedTables = useSchemaStore((state) => state.cutSelectedTables);
  const clearSearch = useSchemaStore((state) => state.clearSearch);
  const [searchHighlightTableIds, setSearchHighlightTableIds] = useState<
    string[]
  >([]);
  const [contextMenu, setContextMenu] = useState<SchemaContextMenuState | null>(
    null
  );
  const [groupPendingDelete, setGroupPendingDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const exportSurfaceRef = useRef<HTMLDivElement | null>(null);

  const flowElements = useMemo(
    () => buildFlowElements(schema, nodePositions, groups),
    [nodePositions, schema, groups]
  );
  const nodes = useMemo(
    () =>
      flowElements.nodes.map((node) =>
        node.type === "schemaTable"
          ? {
              ...node,
              selected: selectedTableIds.includes(node.id),
              data: {
                ...node.data,
                hoveredElement,
                selectedElement,
                searchQuery,
                selectedTableIds: [
                  ...new Set([...selectedTableIds, ...searchHighlightTableIds])
                ]
              }
            }
          : {
              ...node,
              selected:
                selectedElement?.kind === "group" &&
                selectedElement.id === node.id
            }
      ),
    [
      flowElements.nodes,
      hoveredElement,
      searchQuery,
      selectedElement,
      selectedTableIds,
      searchHighlightTableIds
    ]
  );
  const edges = useMemo(
    () =>
      flowElements.edges.map((edge) => ({
        ...edge,
        animated:
          hoveredElement?.id === edge.id || selectedElement?.id === edge.id,
        data: {
          ...edge.data,
          hoveredElement,
          selectedElement
        }
      })),
    [flowElements.edges, hoveredElement, selectedElement]
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: "png" | "pdf" }>).detail;
      if (!detail?.kind) {
        return;
      }

      const runExport = async () => {
        const toastId = toast.loading(
          `Preparing ${detail.kind.toUpperCase()} export...`
        );
        try {
          await fitView({ padding: 0.18, duration: 0 });
          await new Promise((resolve) => window.setTimeout(resolve, 180));

          if (!exportSurfaceRef.current) {
            throw new Error("Canvas surface was not available.");
          }

          const result = await exportCanvasImage(
            detail.kind,
            exportSurfaceRef.current,
            schemeName
          );
          toast.success(result.message, { id: toastId });
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Export failed. Please try again.",
            { id: toastId }
          );
        }
      };

      void runExport();
    };

    window.addEventListener("graphdb:export-canvas", handler);
    return () => window.removeEventListener("graphdb:export-canvas", handler);
  }, [fitView, schemeName]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      fitView({ padding: 0.22, duration: 450 });
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [fitView, schema.parsedAt]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fitView({ padding: 0.22, duration: 360 });
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [fitView, isSidebarCollapsed]);

  useEffect(() => {
    const fullscreenFitDelays = [120, 360];
    const timeouts: number[] = [];

    const refitAfterFullscreenResize = () => {
      while (timeouts.length > 0) {
        window.clearTimeout(timeouts.pop());
      }

      for (const delay of fullscreenFitDelays) {
        timeouts.push(
          window.setTimeout(() => {
            void fitView({ padding: 0.22, duration: 360 });
          }, delay)
        );
      }
    };

    document.addEventListener("fullscreenchange", refitAfterFullscreenResize);
    return () => {
      document.removeEventListener(
        "fullscreenchange",
        refitAfterFullscreenResize
      );
      while (timeouts.length > 0) {
        window.clearTimeout(timeouts.pop());
      }
    };
  }, [fitView]);

  const focusTable = useCallback(
    (tableId: string, columnId?: string) => {
      const node = nodes.find((item) => item.id === tableId);
      if (!node) {
        return;
      }

      setSelectedTableIds([tableId]);
      setSelectedElement(
        columnId
          ? { kind: "column", id: columnId }
          : { kind: "table", id: tableId }
      );
      setCenter(node.position.x + 140, node.position.y + 120, {
        zoom: 1.05,
        duration: 420
      });
    },
    [nodes, setCenter, setSelectedElement, setSelectedTableIds]
  );

  const suggestionBounds = useCallback(
    (suggestions: SchemaSearchSuggestion[]) => {
      const matchedNodes = suggestions.flatMap((suggestion) => {
        if (suggestion.kind === "table") {
          return nodes.filter((node) => node.id === suggestion.table.id);
        }

        if (suggestion.kind === "group") {
          return nodes.filter((node) => node.id === suggestion.group.id);
        }

        return nodes.filter((node) => node.id === suggestion.table.id);
      });

      return boundsForNodes(matchedNodes);
    },
    [nodes]
  );

  const fit_search = useCallback(() => {
    const suggestions = buildSchemaSearchSuggestions(
      schema,
      groups,
      searchQuery,
      100
    );
    if (searchQuery.trim() && suggestions.length === 0) {
      toast.info("No matching schema objects to fit.");
      return;
    }
    const bounds = suggestionBounds(suggestions);

    if (!bounds) {
      void fitView({ padding: 0.22, duration: 420 });
      return;
    }

    void fitBounds(
      {
        x: bounds.x - 56,
        y: bounds.y - 56,
        width: bounds.width + 112,
        height: bounds.height + 112
      },
      { padding: 0.16, duration: 420 }
    );
  }, [fitBounds, fitView, groups, schema, searchQuery, suggestionBounds]);

  const handleSuggestionSelect = (suggestion: SchemaSearchSuggestion) => {
    if (suggestion.kind === "table") {
      focusTable(suggestion.table.id);
    } else if (suggestion.kind === "group") {
      setSelectedTableIds(suggestion.group.tableIds);
      setSelectedElement({ kind: "group", id: suggestion.group.id });
      const bounds = suggestionBounds([suggestion]);
      if (bounds) {
        void fitBounds(
          {
            x: bounds.x - 56,
            y: bounds.y - 56,
            width: bounds.width + 112,
            height: bounds.height + 112
          },
          { padding: 0.16, duration: 420 }
        );
      }
    } else {
      focusTable(suggestion.table.id, suggestion.column.id);
    }
  };

  const handleSuggestionHover = (suggestion: SchemaSearchSuggestion | null) => {
    if (!suggestion) {
      setHoveredElement(null);
      setSearchHighlightTableIds([]);
      return;
    }

    if (suggestion.kind === "table") {
      setHoveredElement({ kind: "table", id: suggestion.table.id });
      setSearchHighlightTableIds([suggestion.table.id]);
      return;
    }

    if (suggestion.kind === "group") {
      setHoveredElement({ kind: "group", id: suggestion.group.id });
      setSearchHighlightTableIds(suggestion.group.tableIds);
      return;
    }

    setHoveredElement({ kind: "column", id: suggestion.column.id });
    setSearchHighlightTableIds([suggestion.table.id]);
  };

  const onNodesChange = useCallback(
    (changes: NodeChange<SchemaCanvasNode>[]) => {
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          if (change.id.startsWith("group:")) {
            const group = groups.find((item) => item.id === change.id);
            if (group) {
              updateGroupBounds(group.id, {
                ...group.bounds,
                x: change.position.x,
                y: change.position.y
              });
            }
          } else {
            updateNodePosition(change.id, change.position);
          }
        }

        if (
          change.type === "dimensions" &&
          change.id.startsWith("group:") &&
          change.dimensions
        ) {
          const group = groups.find((item) => item.id === change.id);
          if (group) {
            updateGroupBounds(group.id, {
              ...group.bounds,
              width: change.dimensions.width,
              height: change.dimensions.height
            });
          }
        }
      }
    },
    [groups, updateGroupBounds, updateNodePosition]
  );

  const onSelectionChange = useCallback<
    OnSelectionChangeFunc<SchemaCanvasNode>
  >(
    ({ nodes: selectedNodes }) => {
      const tableIds = selectedNodes
        .filter((node) => node.type === "schemaTable")
        .map((node) => node.id);
      setSelectedTableIds(tableIds);

      if (tableIds.length === 1) {
        setSelectedElement({ kind: "table", id: tableIds[0]! });
      }

      if (tableIds.length !== 1 && selectedNodes.length === 0) {
        setSelectedElement(null);
      }
    },
    [setSelectedElement, setSelectedTableIds]
  );

  const createGroupForTables = (tableIds: string[], title?: string) => {
    const bounds = boundsForTables(nodes, tableIds);
    if (!bounds) {
      toast.info("Select one or more tables first.");
      return null;
    }

    const tableNames = schema.tables
      .filter((table) => tableIds.includes(table.id))
      .map((table) => table.name);
    const group = addGroup(
      title ?? inferGroupTitle(tableNames),
      tableIds,
      bounds
    );
    toast.success(`Created ${group.title} group.`);
    return group;
  };

  const groupSelectedTables = () => {
    createGroupForTables(selectedTableIds, "group");
  };

  const createGroupFromSelection = () => {
    createGroupForTables(selectedTableIds);
  };

  const pasteClipboard = () => {
    const validIds = clipboardTableIds.filter((tableId) =>
      schema.tables.some((table) => table.id === tableId)
    );
    if (validIds.length === 0) {
      toast.info("Nothing schema-related is on the clipboard yet.");
      return;
    }

    setSelectedTableIds(validIds);
    createGroupForTables(validIds, "pasted");
  };

  const copyTables = () => {
    const copiedIds = copySelectedTables();
    const names = schema.tables
      .filter((table) => copiedIds.includes(table.id))
      .map((table) => table.name);

    if (names.length > 0) {
      void navigator.clipboard?.writeText(names.join(", "));
      toast.success(
        `Copied ${names.length} table${names.length === 1 ? "" : "s"}.`
      );
    }
  };

  const cutTables = () => {
    const cutIds = cutSelectedTables();
    toast.info(
      `Prepared ${cutIds.length} table${cutIds.length === 1 ? "" : "s"} for paste. Source code is unchanged.`
    );
  };

  const onNodeMouseEnter: NodeMouseHandler<SchemaCanvasNode> = (_, node) => {
    if (node.type === "schemaTable") {
      setHoveredElement({ kind: "table", id: node.id });
    }
  };

  const onNodeMouseLeave: NodeMouseHandler<SchemaCanvasNode> = () => {
    setHoveredElement(null);
  };

  const onNodeClick: NodeMouseHandler<SchemaCanvasNode> = (event, node) => {
    if (node.type === "schemaTable") {
      const shouldToggle =
        "shiftKey" in event &&
        (event.shiftKey || event.ctrlKey || event.metaKey);
      const nextSelection = shouldToggle
        ? selectedTableIds.includes(node.id)
          ? selectedTableIds.filter((tableId) => tableId !== node.id)
          : [...selectedTableIds, node.id]
        : [node.id];

      setSelectedTableIds(nextSelection);
      setSelectedElement({ kind: "table", id: node.id });
    }
  };

  const onNodeContextMenu: NodeMouseHandler<SchemaCanvasNode> = (
    event,
    node
  ) => {
    event.preventDefault();

    if (node.type === "schemaTable") {
      const nextSelection = selectedTableIds.includes(node.id)
        ? selectedTableIds
        : [node.id];
      setSelectedTableIds(nextSelection);
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        tableIds: nextSelection
      });
      return;
    }

    setSelectedElement({ kind: "group", id: node.id });
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      tableIds: selectedTableIds,
      groupId: node.id,
      groupTitle: node.data.group.title
    });
  };

  const onPaneContextMenu = (event: MouseEvent | ReactMouseEvent<Element>) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      tableIds: selectedTableIds
    });
  };

  const onEdgeMouseEnter: EdgeMouseHandler = (_, edge) => {
    setHoveredElement({ kind: "relationship", id: edge.id });
  };

  const onEdgeMouseLeave: EdgeMouseHandler = () => {
    setHoveredElement(null);
  };

  const onEdgeClick: EdgeMouseHandler = (_, edge) => {
    setSelectedElement({ kind: "relationship", id: edge.id });
  };

  return (
    <div className="schema-canvas-shell bg-background text-foreground relative h-full min-h-0 flex-1 overflow-hidden dark:bg-[#070707] dark:text-[#f2f2ee]">
      <div
        ref={exportSurfaceRef}
        className="schema-export-surface bg-background h-full dark:bg-[#070707]"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.2}
          maxZoom={1.8}
          onNodesChange={onNodesChange}
          onSelectionChange={onSelectionChange}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          onNodeClick={onNodeClick}
          onNodeContextMenu={onNodeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          onEdgeMouseEnter={onEdgeMouseEnter}
          onEdgeMouseLeave={onEdgeMouseLeave}
          onEdgeClick={onEdgeClick}
          onPaneClick={() => {
            setSelectedElement(null);
            setSelectedTableIds([]);
            setSearchHighlightTableIds([]);
            setContextMenu(null);
          }}
          nodesDraggable
          elementsSelectable
          selectionOnDrag
          selectNodesOnDrag={false}
          panActivationKeyCode={null}
          selectionKeyCode="Shift"
          multiSelectionKeyCode={["Meta", "Control", "Shift"]}
          proOptions={{ hideAttribution: true }}
          className="workspace-grid"
        >
          <Background gap={28} size={1.35} color="var(--canvas-grid-line)" />
          <Controls position="bottom-right" showInteractive={false} />

          <Panel
            position="top-left"
            className="!m-4 w-[min(420px,calc(100vw-2rem))]"
          >
            <SchemaSearch
              query={searchQuery}
              schema={schema}
              groups={groups}
              onQueryChange={setSearchQuery}
              onClear={() => {
                clearSearch();
                setSearchHighlightTableIds([]);
              }}
              onSelect={handleSuggestionSelect}
              onHover={handleSuggestionHover}
              onFitSearch={fit_search}
            />
          </Panel>

          <Panel position="top-right" className="!m-4">
            <div className="border-border bg-card/90 text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-xs shadow-2xl backdrop-blur">
              <Database className="text-primary size-4" />
              <span>{schema.tables.length} tables</span>
              <span className="text-border-strong">/</span>
              <span>{schema.relationships.length} relationships</span>
              <span className="text-border-strong">/</span>
              <span>{groups.length} groups</span>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      <DatabaseMinimap nodes={nodes} />

      {isSidebarCollapsed && onRestoreSidebar ? (
        <Button
          type="button"
          onClick={onRestoreSidebar}
          className="border-primary/40 text-primary-foreground absolute top-1/2 left-3 z-30 h-10 -translate-y-1/2 gap-2 px-3 shadow-[0_18px_55px_rgba(52,211,153,0.28)] hover:translate-x-1"
          aria-label="Open code sidebar"
        >
          <ChevronRight className="size-4" />
          <span className="text-xs font-semibold">Open code</span>
        </Button>
      ) : null}

      <SchemaContextMenu
        state={contextMenu}
        canPaste={clipboardTableIds.length > 0}
        onClose={() => setContextMenu(null)}
        onCopy={copyTables}
        onCut={cutTables}
        onPaste={pasteClipboard}
        onGroup={groupSelectedTables}
        onCreateGroup={createGroupFromSelection}
        onDeleteGroup={() => {
          if (contextMenu?.groupId) {
            setGroupPendingDelete({
              id: contextMenu.groupId,
              title: contextMenu.groupTitle ?? "this group"
            });
          }
        }}
      />

      <ConfirmDestructiveDialog
        open={Boolean(groupPendingDelete)}
        title="Delete group?"
        description={`This will remove ${groupPendingDelete?.title ?? "this group"} from the canvas.`}
        warningMessage="Tables inside group will not be deleted!"
        confirmLabel="Remove group"
        onCancel={() => setGroupPendingDelete(null)}
        onConfirm={() => {
          if (groupPendingDelete) {
            deleteGroup(groupPendingDelete.id);
            toast.success("Group removed.");
          }
          setGroupPendingDelete(null);
        }}
      />

      {schema.tables.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="border-border bg-card/95 max-w-md rounded-md border p-6 text-center shadow-2xl backdrop-blur">
            <div className="border-primary/25 bg-primary/10 text-primary mx-auto mb-4 flex size-12 items-center justify-center rounded-md border">
              <Database className="size-6" />
            </div>
            <h2 className="text-lg font-semibold">Start with schema code</h2>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              Paste DBML, SQL, or PostgreSQL CREATE TABLE statements on the
              left, or load a preset.
            </p>
          </div>
        </div>
      ) : null}

      {errors.length > 0 ? (
        <div className="border-destructive/30 bg-card/95 absolute right-4 bottom-4 z-20 max-w-md rounded-md border p-3 text-sm shadow-2xl backdrop-blur">
          <div className="text-destructive flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="font-medium">{errors[0]?.message}</div>
              {errors[0]?.detail ? (
                <div className="text-muted-foreground mt-1 text-xs">
                  {errors[0].detail}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {schema.warnings.length > 0 && errors.length === 0 ? (
        <div className="bg-card/95 absolute right-4 bottom-4 z-20 max-w-md rounded-md border border-amber-300/25 p-3 text-sm shadow-2xl backdrop-blur">
          <div className="flex items-start gap-2 text-amber-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="font-medium">{schema.warnings[0]}</div>
              <div className="text-muted-foreground mt-1 text-xs">
                The canvas still renders every table the parser could normalize.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isGenerating ? (
        <div className="bg-background/55 absolute inset-0 z-30 flex items-center justify-center backdrop-blur-sm">
          <div className="border-border bg-card flex items-center gap-3 rounded-md border px-4 py-3 shadow-2xl">
            <Sparkles className={cn("text-primary size-4", "animate-pulse")} />
            <span className="text-sm font-medium">
              Generating schema locally...
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SchemaCanvas(props: SchemaCanvasProps) {
  return (
    <ReactFlowProvider>
      <SchemaCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
