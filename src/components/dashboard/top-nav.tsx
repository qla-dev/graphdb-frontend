import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  Braces,
  Check,
  Cloud,
  Copy,
  GitBranch,
  DatabaseZap,
  Download,
  FileCode2,
  FileJson,
  FilePlus2,
  FolderOpen,
  Globe2,
  Layers3,
  LockKeyhole,
  Loader2,
  Maximize2,
  Minimize2,
  Moon,
  Pencil,
  Rocket,
  Save,
  Sun,
  Trash2
} from "lucide-react";
import { toast } from "sonner";
import { useGraphTheme } from "@/components/providers/theme-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import {
  getPublishStatus,
  publishedApiFromStatus,
  startPublish,
  type PublishStatusResponse
} from "@/lib/api/publish-client";
import { isAdminSession } from "@/lib/auth/session";
import { exportSource, type ExportKind } from "@/lib/export/schema-export";
import { formatLabels, samplePresets } from "@/lib/samples";
import { useSchemaStore } from "@/lib/store/schema-store";
import { cn } from "@/lib/utils";
import type {
  PersistedProject,
  ProjectVisibility,
  SchemaFormat,
  SchemaPreset
} from "@/types/schema";

const exportItems: Array<{
  kind: ExportKind;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { kind: "json", label: "Schema JSON", icon: FileJson },
  { kind: "code", label: "Source code", icon: FileCode2 },
  { kind: "png", label: "PNG image", icon: Download },
  { kind: "pdf", label: "PDF document", icon: Download }
];

export type WorkbenchView = "playground" | "api";

interface TopNavProps {
  activeView: WorkbenchView;
  onViewChange: (view: WorkbenchView) => void;
}

function saveStatusCopy(status: string) {
  if (status === "saving") {
    return "Saving";
  }
  if (status === "dirty") {
    return "Saving";
  }
  if (status === "error") {
    return "Save error";
  }
  return "Saved";
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatProjectTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function accessBadgeVariant(visibility: ProjectVisibility) {
  return visibility === "private" ? "danger" : "default";
}

function accessCopy(visibility: ProjectVisibility) {
  return visibility === "private"
    ? "Private project, password required"
    : "Public project, opens without password";
}

export function TopNav({ activeView, onViewChange }: TopNavProps) {
  const { theme, toggleTheme } = useGraphTheme();
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [newSchemeOpen, setNewSchemeOpen] = useState(false);
  const [loadSchemesOpen, setLoadSchemesOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [newSchemeName, setNewSchemeName] = useState("");
  const [newSchemeVisibility, setNewSchemeVisibility] =
    useState<ProjectVisibility>("public");
  const [newSchemePassword, setNewSchemePassword] = useState("");
  const [newSchemePresetId, setNewSchemePresetId] = useState(
    samplePresets[0].id
  );
  const [schemeSearch, setSchemeSearch] = useState("");
  const [pendingProtectedScheme, setPendingProtectedScheme] =
    useState<PersistedProject | null>(null);
  const [loadSchemePassword, setLoadSchemePassword] = useState("");
  const [loadSchemePasswordError, setLoadSchemePasswordError] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishStatus, setPublishStatus] =
    useState<PublishStatusResponse | null>(null);
  const code = useSchemaStore((state) => state.code);
  const format = useSchemaStore((state) => state.format);
  const codeFormat = useSchemaStore((state) => state.codeFormat);
  const currentSchemeId = useSchemaStore((state) => state.currentSchemeId);
  const schemeName = useSchemaStore((state) => state.schemeName);
  const projectVisibility = useSchemaStore((state) => state.projectVisibility);
  const schema = useSchemaStore((state) => state.schema);
  const errors = useSchemaStore((state) => state.errors);
  const groups = useSchemaStore((state) => state.groups);
  const nodePositions = useSchemaStore((state) => state.nodePositions);
  const saveStatus = useSchemaStore((state) => state.saveStatus);
  const lastSavedAt = useSchemaStore((state) => state.lastSavedAt);
  const savedSchemes = useSchemaStore((state) => state.savedSchemes);
  const setFormat = useSchemaStore((state) => state.setFormat);
  const setSchemeName = useSchemaStore((state) => state.setSchemeName);
  const createScheme = useSchemaStore((state) => state.createScheme);
  const loadScheme = useSchemaStore((state) => state.loadScheme);
  const deleteScheme = useSchemaStore((state) => state.deleteScheme);
  const saveCurrentScheme = useSchemaStore((state) => state.saveCurrentScheme);
  const setPublishedApi = useSchemaStore((state) => state.setPublishedApi);

  const filteredSchemes = useMemo(() => {
    const query = schemeSearch.trim().toLowerCase();
    if (!query) {
      return savedSchemes;
    }

    return savedSchemes.filter((scheme) =>
      scheme.name.toLowerCase().includes(query)
    );
  }, [savedSchemes, schemeSearch]);

  const commitName = () => {
    const cleaned = draftName.trim();
    setSchemeName(cleaned || "Untitled project");
    setIsEditingName(false);
  };

  const beginNameEdit = () => {
    setDraftName(schemeName);
    setIsEditingName(true);
  };

  const resetNewSchemeForm = () => {
    setNewSchemeName("");
    setNewSchemeVisibility("public");
    setNewSchemePassword("");
    setNewSchemePresetId(samplePresets[0].id);
  };

  const handleNewSchemeOpenChange = (open: boolean) => {
    setNewSchemeOpen(open);
    if (!open) {
      resetNewSchemeForm();
    }
  };

  const closeProtectedSchemeDialog = () => {
    setPendingProtectedScheme(null);
    setLoadSchemePassword("");
    setLoadSchemePasswordError("");
  };

  useEffect(() => {
    const updateFullscreenState = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    updateFullscreenState();
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenEnabled) {
        toast.error("Fullscreen is not available in this browser.");
        return;
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not toggle fullscreen."
      );
    }
  };

  const handleExport = async (kind: ExportKind) => {
    if (kind === "png" || kind === "pdf") {
      window.dispatchEvent(
        new CustomEvent("graphdb:export-canvas", { detail: { kind } })
      );
      return;
    }

    const result = exportSource(kind, {
      schemeName,
      schema,
      code,
      format: codeFormat,
      nodePositions,
      groups
    });
    toast.success(result.message);
  };

  const pollPublishStatus = async (id: string) => {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const status = await getPublishStatus(id);
      setPublishStatus(status);

      if (status.status === "succeeded") {
        const publishedApi = publishedApiFromStatus(status);
        if (publishedApi) {
          setPublishedApi(publishedApi);
        }
        toast.success("Schema published.");
        return;
      }

      if (status.status === "failed") {
        throw new Error(status.error || status.message || "Publish failed.");
      }

      await sleep(1800);
    }

    throw new Error("Publish timed out while waiting for the backend.");
  };

  const handlePublish = async () => {
    if (isPublishing) {
      return;
    }

    if (errors.length > 0) {
      toast.error("Fix parser errors before publishing.");
      return;
    }

    if (schema.tables.length === 0) {
      toast.error("Add at least one table before publishing.");
      return;
    }

    setIsPublishing(true);
    setPublishDialogOpen(true);
    setPublishStatus({
      id: "",
      status: "queued",
      progress: 0,
      step: "queued",
      message: "Starting publish.",
      error: null,
      apiBasePath: null,
      apiToken: null
    });

    try {
      const started = await startPublish({
        projectName: schemeName,
        format: codeFormat,
        code,
        schema
      });

      setPublishStatus((current) =>
        current
          ? {
              ...current,
              id: started.id,
              status: started.status,
              message: "Publish queued."
            }
          : current
      );

      await pollPublishStatus(started.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Publish failed.";
      toast.error(message);
      setPublishStatus((current) =>
        current
          ? {
              ...current,
              status: "failed",
              progress: 100,
              step: "failed",
              message: "Publish failed.",
              error: message
            }
          : current
      );
    } finally {
      setIsPublishing(false);
    }
  };

  const copyPublishedValue = async (value: string, label: string) => {
    await navigator.clipboard?.writeText(value);
    toast.success(`${label} copied.`);
  };

  const handleCreateScheme = async () => {
    const cleaned = newSchemeName.trim();
    if (!cleaned) {
      toast.error("Project name is required.");
      return;
    }

    const password =
      newSchemeVisibility === "private" ? newSchemePassword.trim() : "";

    if (newSchemeVisibility === "private" && !password) {
      toast.error("Password is required for private projects.");
      return;
    }

    if (saveStatus === "dirty") {
      await saveCurrentScheme();
    }

    const preset =
      samplePresets.find((item) => item.id === newSchemePresetId) ??
      samplePresets[0];
    createScheme(cleaned, preset, {
      visibility: newSchemeVisibility,
      password
    });
    resetNewSchemeForm();
    setNewSchemeOpen(false);
    toast.success(`${cleaned} created.`);
  };

  const handleLoadSavedScheme = async (scheme: PersistedProject) => {
    if (scheme.id === currentSchemeId) {
      setLoadSchemesOpen(false);
      return;
    }

    if (saveStatus === "dirty") {
      await saveCurrentScheme();
    }

    if (scheme.visibility === "private" && !isAdminSession()) {
      setPendingProtectedScheme(scheme);
      setLoadSchemePassword("");
      setLoadSchemePasswordError("");
      return;
    }

    loadScheme(scheme.id);
    setLoadSchemesOpen(false);
  };

  const handleProtectedSchemeUnlock = () => {
    if (!pendingProtectedScheme) {
      return;
    }

    if (isAdminSession()) {
      loadScheme(pendingProtectedScheme.id);
      setLoadSchemesOpen(false);
      closeProtectedSchemeDialog();
      return;
    }

    if (loadSchemePassword !== pendingProtectedScheme.password) {
      setLoadSchemePassword("");
      setLoadSchemePasswordError("Incorrect project password.");
      return;
    }

    loadScheme(pendingProtectedScheme.id);
    setLoadSchemesOpen(false);
    closeProtectedSchemeDialog();
  };

  return (
    <TooltipProvider delayDuration={200}>
      <header className="border-border bg-background/92 text-foreground flex h-14 shrink-0 items-center justify-start gap-3 overflow-hidden border-b px-3 shadow-[0_1px_0_rgba(255,255,255,0.04)] backdrop-blur md:gap-5 md:px-4 dark:bg-[#070707]/95 dark:text-[#f2f2ee]">
        <div className="flex min-w-0 shrink-0 items-center gap-3 md:gap-5">
          <div className="flex items-center gap-2">
            <div className="border-primary/30 bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md border shadow-[0_0_28px_rgba(52,211,153,0.24)]">
              <DatabaseZap className="size-4" />
            </div>
            <div className="hidden leading-tight sm:block">
              <div className="text-foreground text-sm font-semibold tracking-tight dark:text-white">
                GraphDB Studio
              </div>
            </div>
          </div>

          <div className="bg-border hidden h-6 w-px md:block" />

          <div className="min-w-0 max-w-[min(360px,34vw)]">
            <div className="group flex h-6 min-w-36 max-w-full items-center gap-2">
              {isEditingName ? (
                <Input
                  autoFocus
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={commitName}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      commitName();
                    }
                    if (event.key === "Escape") {
                      setIsEditingName(false);
                    }
                  }}
                  className="h-7 px-2 text-sm font-medium"
                />
              ) : (
                <button
                  className="text-foreground hover:text-primary min-w-0 truncate text-left text-sm font-medium transition-colors dark:text-white"
                  onClick={beginNameEdit}
                  title="Rename project"
                >
                  {schemeName}
                </button>
              )}
              <Badge
                variant={accessBadgeVariant(projectVisibility)}
                className="gap-1 px-2 py-1"
                title={accessCopy(projectVisibility)}
              >
                {projectVisibility === "private" ? (
                  <LockKeyhole className="size-3" />
                ) : (
                  <Globe2 className="size-3" />
                )}
                {projectVisibility}
              </Badge>
              {!isEditingName ? (
                <button
                  className="text-muted-foreground hover:text-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={beginNameEdit}
                  aria-label="Edit project name"
                >
                  <Pencil className="size-3.5" />
                </button>
              ) : null}
            </div>
            <div className="text-muted-foreground hidden text-xs md:block">
              {schema.tables.length} tables, {schema.relationships.length}{" "}
              relationships, {groups.length} groups
            </div>
          </div>
        </div>

        <div className="bg-border hidden h-6 w-px shrink-0 md:block" />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden w-36 sm:block">
              <Select
                value={format}
                onValueChange={(value) => setFormat(value as SchemaFormat)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["ui", "dbml", "sql", "postgresql"] as SchemaFormat[]).map(
                    (item) => (
                      <SelectItem value={item} key={item}>
                        {formatLabels[item]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setNewSchemeOpen(true)}
                  aria-label="New project"
                  className="size-10"
                >
                  <FilePlus2 className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New project</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setLoadSchemesOpen(true)}
                  aria-label="Load projects"
                  className="size-10"
                >
                  <FolderOpen className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Load projects</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void saveCurrentScheme()}
                  aria-label="Cloud save"
                  className={cn(
                    "size-10",
                    saveStatus === "dirty"
                      ? "text-amber-300"
                      : saveStatus === "error"
                        ? "text-destructive"
                        : saveStatus === "saved"
                          ? "text-primary"
                          : undefined
                  )}
                >
                  {saveStatus === "saving" ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : saveStatus === "saved" ? (
                    <Cloud className="size-5" />
                  ) : saveStatus === "error" ? (
                    <AlertTriangle className="size-5" />
                  ) : (
                    <Save className="size-5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {saveStatusCopy(saveStatus)}
                {lastSavedAt && saveStatus === "saved"
                  ? ` at ${new Date(lastSavedAt).toLocaleTimeString()}`
                  : ""}
              </TooltipContent>
            </Tooltip>
            <span className="text-muted-foreground hidden min-w-[6rem] truncate text-sm font-medium xl:inline">
              {saveStatusCopy(saveStatus)}
            </span>
          </div>

          <div className="min-w-4 flex-1" />

          <div className="flex shrink-0 items-center gap-2">

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-9">
                <Download className="size-4" />
                <span className="hidden sm:inline">Export</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {exportItems.map((item, index) => (
                <div key={item.kind}>
                  {index === 2 ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    onClick={() => void handleExport(item.kind)}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </DropdownMenuItem>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            className="h-9"
            onClick={() => void handlePublish()}
            disabled={isPublishing}
          >
            {isPublishing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Rocket className="size-4" />
            )}
            <span className="hidden sm:inline">
              {isPublishing ? "Publishing" : "Publish"}
            </span>
          </Button>

          <div className="border-border bg-secondary hidden h-9 items-center rounded-md border p-1 md:flex">
            {(["playground", "api"] as WorkbenchView[]).map((view) => (
              <button
                key={view}
                type="button"
                aria-pressed={activeView === view}
                onClick={() => onViewChange(view)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors",
                  activeView === view
                    ? "bg-background text-foreground shadow-sm dark:bg-white dark:text-black"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {view === "playground" ? (
                  <DatabaseZap className="size-3.5" />
                ) : (
                  <Braces className="size-3.5" />
                )}
                <span>{view === "api" ? "API" : "Playground"}</span>
              </button>
            ))}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                onClick={toggleTheme}
                aria-label={
                  theme === "dark"
                    ? "Switch to light theme"
                    : "Switch to dark theme"
                }
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80 dark:bg-[#121211] dark:text-white dark:hover:bg-[#1c1c1a]"
              >
                {theme === "dark" ? (
                  <Sun className="size-4" />
                ) : (
                  <Moon className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {theme === "dark"
                ? "Switch to light theme"
                : "Switch to dark theme"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                onClick={() => void toggleFullscreen()}
                aria-label={
                  isFullscreen ? "Exit fullscreen" : "Enter fullscreen"
                }
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80 dark:bg-[#121211] dark:text-white dark:hover:bg-[#1c1c1a]"
              >
                {isFullscreen ? (
                  <Minimize2 className="size-4" />
                ) : (
                  <Maximize2 className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            </TooltipContent>
          </Tooltip>

          <div className="border-border bg-secondary text-muted-foreground hidden h-9 items-center gap-2 rounded-md border px-3 text-xs lg:flex">
            <Braces className="text-accent size-3.5" />
            Live parse
          </div>
          </div>
        </div>
      </header>

      <Dialog open={newSchemeOpen} onOpenChange={handleNewSchemeOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Create a fresh project with a starter schema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
                Name
              </label>
              <Input
                value={newSchemeName}
                onChange={(event) => setNewSchemeName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleCreateScheme();
                  }
                }}
                placeholder="Billing graph"
              />
            </div>
            <div className="space-y-2">
              <label className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
                Starter template
              </label>
              <Select
                value={newSchemePresetId}
                onValueChange={setNewSchemePresetId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {samplePresets.map((preset: SchemaPreset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
                Access
              </label>
              <Select
                value={newSchemeVisibility}
                onValueChange={(value) => {
                  const visibility = value as ProjectVisibility;
                  setNewSchemeVisibility(visibility);
                  if (visibility !== "private") {
                    setNewSchemePassword("");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="private">
                    Private (password required)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {newSchemeVisibility === "private"
                  ? "Private projects require a password every time they are opened."
                  : "Public projects open without a password."}
              </p>
            </div>
            {newSchemeVisibility === "private" ? (
              <div className="space-y-2">
                <label className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
                  Project password
                </label>
                <Input
                  type="password"
                  value={newSchemePassword}
                  onChange={(event) => setNewSchemePassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void handleCreateScheme();
                    }
                  }}
                  placeholder="Enter project password"
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleNewSchemeOpenChange(false)}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleCreateScheme()}>
              <Check className="size-4" />
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={loadSchemesOpen} onOpenChange={setLoadSchemesOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Load project</DialogTitle>
            <DialogDescription>
              Open a saved project.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={schemeSearch}
            onChange={(event) => setSchemeSearch(event.target.value)}
            placeholder="Search saved projects"
          />
          <div className="grid max-h-[520px] gap-3 overflow-auto pr-1 sm:grid-cols-2">
            {filteredSchemes.length === 0 ? (
              <div className="border-border text-muted-foreground rounded-md border p-6 text-center text-sm">
                No saved projects found.
              </div>
            ) : (
              filteredSchemes.map((scheme) => (
                <div
                  key={scheme.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => void handleLoadSavedScheme(scheme)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      void handleLoadSavedScheme(scheme);
                    }
                  }}
                  className={cn(
                    "border-border bg-secondary/35 cursor-pointer rounded-xl border p-4 transition-all hover:border-primary/70 hover:shadow-[inset_0_0_0_1px_rgba(52,211,153,0.35)] hover:bg-secondary/45 focus-visible:border-primary/80 focus-visible:shadow-[inset_0_0_0_1px_rgba(52,211,153,0.5)] focus-visible:outline-none",
                    scheme.id === currentSchemeId &&
                      "border-primary/45 bg-primary/6 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.28)]"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-base font-semibold">
                            {scheme.name}
                          </div>
                          {scheme.id === currentSchemeId ? (
                            <Badge>Current</Badge>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant={accessBadgeVariant(scheme.visibility)}
                          className="gap-1 px-2.5 py-1"
                          title={accessCopy(scheme.visibility)}
                        >
                          {scheme.visibility === "private" ? (
                            <LockKeyhole className="size-3" />
                          ) : (
                            <Globe2 className="size-3" />
                          )}
                          {scheme.visibility}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteScheme(scheme.id);
                            toast.success("Project deleted.");
                          }}
                          aria-label={`Delete ${scheme.name}`}
                          className="shrink-0"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      Updated {new Date(scheme.updatedAt).toLocaleString()} ·{" "}
                      {scheme.tableCount} tables · {scheme.groups?.length ?? 0}{" "}
                      groups
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        {formatLabels[scheme.format]}
                      </Badge>
                      {scheme.codeFormat && scheme.format === "ui" ? (
                        <Badge variant="secondary">
                          Source {formatLabels[scheme.codeFormat]}
                        </Badge>
                      ) : null}
                      <Badge variant="secondary">
                        Created {formatProjectTimestamp(scheme.createdAt)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid w-full grid-cols-3 gap-2">
                      <div className="border-border bg-background/70 rounded-lg border p-3">
                        <div className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase">
                          <DatabaseZap className="size-3.5" />
                          Tables
                        </div>
                        <div className="mt-2 text-lg font-semibold">
                          {scheme.tableCount}
                        </div>
                      </div>
                      <div className="border-border bg-background/70 rounded-lg border p-3">
                        <div className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase">
                          <GitBranch className="size-3.5" />
                          Links
                        </div>
                        <div className="mt-2 text-lg font-semibold">
                          {scheme.relationshipCount}
                        </div>
                      </div>
                      <div className="border-border bg-background/70 rounded-lg border p-3">
                        <div className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase">
                          <Layers3 className="size-3.5" />
                          Groups
                        </div>
                        <div className="mt-2 text-lg font-semibold">
                          {scheme.groups?.length ?? 0}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingProtectedScheme)}
        onOpenChange={(open) => {
          if (!open) {
            closeProtectedSchemeDialog();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Private project</DialogTitle>
            <DialogDescription>
              {pendingProtectedScheme
                ? `Enter the password for ${pendingProtectedScheme.name}.`
                : "Enter the project password to continue."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
                Password
              </label>
              <Input
                autoFocus
                type="password"
                value={loadSchemePassword}
                onChange={(event) => {
                  setLoadSchemePassword(event.target.value);
                  if (loadSchemePasswordError) {
                    setLoadSchemePasswordError("");
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleProtectedSchemeUnlock();
                  }
                }}
                placeholder="Enter project password"
              />
            </div>
            {loadSchemePasswordError ? (
              <p className="text-destructive text-sm">
                {loadSchemePasswordError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => closeProtectedSchemeDialog()}
            >
              Cancel
            </Button>
            <Button onClick={handleProtectedSchemeUnlock}>Open project</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish schema</DialogTitle>
            <DialogDescription>
              Provisioning an isolated database and generated API.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border-border bg-secondary/45 rounded-md border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">
                    {publishStatus?.message ?? "Waiting for backend."}
                  </div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    {publishStatus?.step ?? "queued"}
                  </div>
                </div>
                {publishStatus?.status === "succeeded" ? (
                  <Check className="text-primary size-5" />
                ) : publishStatus?.status === "failed" ? (
                  <AlertTriangle className="text-destructive size-5" />
                ) : (
                  <Loader2 className="text-primary size-5 animate-spin" />
                )}
              </div>
              <div className="bg-border mt-4 h-2 overflow-hidden rounded">
                <div
                  className="bg-primary h-full transition-all"
                  style={{ width: `${publishStatus?.progress ?? 0}%` }}
                />
              </div>
              {publishStatus?.error ? (
                <div className="text-destructive mt-3 text-sm">
                  {publishStatus.error}
                </div>
              ) : null}
            </div>

            {publishStatus?.status === "succeeded" &&
            publishStatus.apiBasePath &&
            publishStatus.apiToken ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
                    API base path
                  </label>
                  <div className="flex gap-2">
                    <Input readOnly value={publishStatus.apiBasePath} />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={() =>
                        void copyPublishedValue(
                          publishStatus.apiBasePath!,
                          "API base path"
                        )
                      }
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
                    API token
                  </label>
                  <div className="flex gap-2">
                    <Input readOnly value={publishStatus.apiToken} />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={() =>
                        void copyPublishedValue(
                          publishStatus.apiToken!,
                          "API token"
                        )
                      }
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPublishDialogOpen(false)}
              disabled={isPublishing}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
