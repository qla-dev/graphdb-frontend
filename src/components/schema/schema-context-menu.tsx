import {
  ClipboardPaste,
  Copy,
  Group,
  Layers,
  Scissors,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SchemaContextMenuState {
  x: number;
  y: number;
  tableIds: string[];
  groupId?: string;
  groupTitle?: string;
}

interface SchemaContextMenuProps {
  state: SchemaContextMenuState | null;
  canPaste: boolean;
  onClose: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onGroup: () => void;
  onCreateGroup: () => void;
  onDeleteGroup: () => void;
}

export function SchemaContextMenu({
  state,
  canPaste,
  onClose,
  onCopy,
  onCut,
  onPaste,
  onGroup,
  onCreateGroup,
  onDeleteGroup
}: SchemaContextMenuProps) {
  if (!state) {
    return null;
  }

  const items = [
    { key: "copy", label: "Copy", icon: Copy },
    { key: "cut", label: "Cut", icon: Scissors },
    { key: "paste", label: "Paste", icon: ClipboardPaste },
    { key: "group", label: "Group", icon: Group },
    { key: "createGroup", label: "Create Group", icon: Layers },
    ...(state.groupId
      ? ([{ key: "deleteGroup", label: "Delete group", icon: Trash2 }] as const)
      : [])
  ] as const;

  const handlers = {
    copy: onCopy,
    cut: onCut,
    paste: onPaste,
    group: onGroup,
    createGroup: onCreateGroup,
    deleteGroup: onDeleteGroup
  };

  return (
    <>
      <button
        className="fixed inset-0 z-40 cursor-default"
        aria-label="Close schema context menu"
        onClick={onClose}
      />
      <div
        className="border-border bg-popover text-popover-foreground fixed z-50 w-56 overflow-hidden rounded-md border p-1 shadow-2xl"
        style={{ left: state.x, top: state.y }}
      >
        <div className="text-muted-foreground px-2.5 py-2 text-[10px] font-semibold tracking-[0.16em] uppercase">
          {state.groupId
            ? state.groupTitle ?? "Group"
            : `${state.tableIds.length} selected`}
        </div>
        {items.map((item) => {
          const Icon = item.icon;
          const disabled =
            (item.key === "paste" && !canPaste) ||
            ((item.key === "group" || item.key === "createGroup") &&
              state.tableIds.length === 0);

          return (
            <button
              key={item.key}
              disabled={disabled}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm transition-colors",
                disabled
                  ? "text-muted-foreground/35 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
              )}
              onClick={() => {
                handlers[item.key]();
                onClose();
              }}
            >
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
