import { useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  CheckCircle2,
  Database,
  FileCode2,
  FileInput,
  FileSearch,
  GitBranch,
  History,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Undo2,
  Wand2
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SchemaEditor } from "@/components/editor/schema-editor";
import { SchemaUiEditor } from "@/components/editor/schema-ui-editor";
import { formatLabels, samplePresets } from "@/lib/samples";
import { useSchemaStore } from "@/lib/store/schema-store";
import type { SchemaCodeFormat, SchemaFormat } from "@/types/schema";

const prompts = [
  "Create users, orders, products, categories, payments and foreign keys",
  "Build a SaaS workspace schema with teams, members, users and audit events",
  "Create a blog schema with users, posts and comments"
];

const importSteps = [
  {
    title: "Reading dump",
    detail: "Loading the SQL file from disk.",
    icon: FileSearch
  },
  {
    title: "Skipping inserts",
    detail: "Focusing on table structure, indexes, and constraints.",
    icon: FileCode2
  },
  {
    title: "Detecting keys",
    detail: "Finding primary keys and ALTER TABLE relationships.",
    icon: GitBranch
  },
  {
    title: "Building grid",
    detail: "Arranging tables with clean spacing.",
    icon: Database
  },
  {
    title: "Loading diagram",
    detail: "Preparing the canvas view.",
    icon: Sparkles
  }
];

interface ImportProgress {
  fileName: string;
  fileSize: number;
  activeStep: number;
  percent: number;
}

interface LeftWorkspacePanelProps {
  onCollapseSidebar?: () => void;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImportLoader({ progress }: { progress: ImportProgress | null }) {
  if (!progress) {
    return null;
  }

  const activeStep = importSteps[progress.activeStep] ?? importSteps[0];
  const ActiveIcon = activeStep.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
      <div className="import-loader-grid border-border bg-card text-card-foreground relative w-full max-w-xl overflow-hidden rounded-md border shadow-[0_28px_120px_rgba(0,0,0,0.48)]">
        <div className="import-loader-scan pointer-events-none absolute inset-x-0 top-0 h-24" />
        <div className="relative p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="border-primary/30 bg-primary/10 relative flex size-14 shrink-0 items-center justify-center rounded-md border">
              <div className="import-loader-orbit border-primary/70 absolute inset-1 rounded-md border border-r-transparent" />
              <ActiveIcon className="text-primary size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
                Importing schema
              </div>
              <h2 className="mt-1 truncate text-lg font-semibold">
                {progress.fileName}
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {formatBytes(progress.fileSize)} · {activeStep.detail}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <div className="bg-secondary h-2 overflow-hidden rounded">
              <div
                className="bg-primary h-full rounded transition-all duration-500"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
              <span>{activeStep.title}</span>
              <span>{progress.percent}%</span>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {importSteps.map((step, index) => {
              const StepIcon = step.icon;
              const complete = index < progress.activeStep;
              const active = index === progress.activeStep;

              return (
                <div
                  key={step.title}
                  className={`border-border flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-primary/10 text-primary"
                      : complete
                        ? "bg-secondary/50 text-foreground"
                        : "text-muted-foreground bg-background/50"
                  }`}
                >
                  <div className="flex size-7 shrink-0 items-center justify-center">
                    {complete ? (
                      <CheckCircle2 className="text-primary size-4" />
                    ) : active ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <StepIcon className="size-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium">{step.title}</div>
                    <div className="text-muted-foreground truncate text-xs">
                      {step.detail}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LeftWorkspacePanel({
  onCollapseSidebar
}: LeftWorkspacePanelProps) {
  const [tab, setTab] = useState("code");
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(
    null
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const code = useSchemaStore((state) => state.code);
  const format = useSchemaStore((state) => state.format);
  const codeFormat = useSchemaStore((state) => state.codeFormat);
  const schema = useSchemaStore((state) => state.schema);
  const errors = useSchemaStore((state) => state.errors);
  const undoCount = useSchemaStore((state) => state.undoStack.length);
  const aiPrompt = useSchemaStore((state) => state.aiPrompt);
  const history = useSchemaStore((state) => state.history);
  const isGenerating = useSchemaStore((state) => state.isGenerating);
  const lastAiSummary = useSchemaStore((state) => state.lastAiSummary);
  const setCode = useSchemaStore((state) => state.setCode);
  const setFormat = useSchemaStore((state) => state.setFormat);
  const loadPreset = useSchemaStore((state) => state.loadPreset);
  const resetCode = useSchemaStore((state) => state.resetCode);
  const undo = useSchemaStore((state) => state.undo);
  const setAiPrompt = useSchemaStore((state) => state.setAiPrompt);
  const generateFromPrompt = useSchemaStore(
    (state) => state.generateFromPrompt
  );

  const handleGenerate = () => {
    setCode(code);
    if (errors.length > 0) {
      toast.error(errors[0]?.message ?? "Schema has parser errors.");
      return;
    }
    toast.success(
      `Rendered ${schema.tables.length} tables and ${schema.relationships.length} relationships.`
    );
  };

  const handleAiGenerate = async () => {
    await generateFromPrompt();
    const state = useSchemaStore.getState();
    if (state.errors.length > 0) {
      toast.error(state.errors[0]?.message ?? "AI output could not be parsed.");
      return;
    }
    toast.success(state.lastAiSummary ?? "Schema generated.");
    setTab("code");
  };

  const importFile = async (file: File) => {
    setTab("code");
    setImportProgress({
      fileName: file.name,
      fileSize: file.size,
      activeStep: 0,
      percent: 8
    });

    try {
      await wait(180);
      const text = await file.text();

      for (let index = 1; index < importSteps.length; index += 1) {
        setImportProgress({
          fileName: file.name,
          fileSize: file.size,
          activeStep: index,
          percent: Math.min(92, 8 + index * 18)
        });
        await wait(index === 1 ? 260 : 320);
      }

      const lowerName = file.name.toLowerCase();
      const detectedFormat: SchemaCodeFormat = lowerName.endsWith(".dbml")
        ? "dbml"
        : lowerName.endsWith(".sql")
          ? "sql"
          : codeFormat;
      useSchemaStore.getState().setFormat(detectedFormat);
      useSchemaStore.getState().setCode(text);
      const state = useSchemaStore.getState();
      setImportProgress({
        fileName: file.name,
        fileSize: file.size,
        activeStep: importSteps.length - 1,
        percent: 100
      });
      await wait(450);
      toast.success(
        `Imported ${file.name}: ${state.schema.tables.length} tables, ${state.schema.relationships.length} relationships.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Could not import ${file.name}.`
      );
    } finally {
      setImportProgress(null);
    }
  };

  return (
    <>
      <ImportLoader progress={importProgress} />
      <aside className="border-border bg-card text-card-foreground flex h-full min-h-0 flex-col border-r dark:bg-[#0d0d0c]">
        <Tabs
          value={tab}
          onValueChange={setTab}
          className="flex h-full min-h-0 flex-col"
        >
          <div className="border-border flex items-center justify-between border-b px-3 py-2">
            <TabsList className="h-[38px]">
              <TabsTrigger value="code">
                <FileCode2 className="mr-1.5 size-3.5" />
                Code
              </TabsTrigger>
              <TabsTrigger value="ai">
                <Sparkles className="mr-1.5 size-3.5" />
                AI
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <Badge
                variant={errors.length ? "danger" : "secondary"}
                className="h-7"
              >
                {errors.length ? "needs fix" : "live"}
              </Badge>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={undo}
                disabled={undoCount === 0}
                className="h-7 gap-1.5 px-2 text-[10px] font-semibold tracking-normal normal-case"
                aria-label="Undo last change"
                title={`Undo${undoCount ? ` (${undoCount} available)` : ""}`}
              >
                <Undo2 className="size-3.5" />
                <span className="hidden xl:inline">Undo</span>
              </Button>
              {onCollapseSidebar ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={onCollapseSidebar}
                  className="h-7 w-7"
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
              ) : null}
            </div>
          </div>

          <TabsContent
            value="code"
            className="m-0 flex min-h-0 flex-1 flex-col"
          >
            <div className="border-border bg-secondary/55 flex flex-wrap items-center gap-2 border-b px-3 py-2 dark:bg-black/20">
              {(["ui", "dbml", "sql", "postgresql"] as SchemaFormat[]).map((item) => (
                <button
                  key={item}
                  className={`rounded px-2.5 py-1 text-[11px] font-semibold tracking-[0.15em] uppercase transition-colors ${
                    format === item
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground dark:hover:bg-white/[0.05]"
                  }`}
                  onClick={() => setFormat(item)}
                >
                  {formatLabels[item]}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1">
              {format === "ui" ? <SchemaUiEditor /> : <SchemaEditor />}
            </div>

            <div className="border-border bg-card/95 space-y-3 border-t p-3 dark:bg-[#10100f]">
              {errors.length > 0 ? (
                <div className="border-destructive/25 bg-destructive/10 text-destructive rounded-md border p-2 text-xs">
                  <div className="mb-2 flex items-center gap-2 font-semibold">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    <span>
                      {errors.length} validation issue
                      {errors.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="max-h-24 space-y-1 overflow-auto pr-1">
                    {errors.slice(0, 4).map((error, index) => (
                      <div
                        key={`${error.code ?? "schema-error"}-${error.line ?? index}-${index}`}
                        className="text-destructive/90"
                      >
                        {error.line ? (
                          <span className="font-mono opacity-70">
                            L{error.line}:{" "}
                          </span>
                        ) : null}
                        {error.message}
                      </div>
                    ))}
                    {errors.length > 4 ? (
                      <div className="text-destructive/65">
                        +{errors.length - 4} more in the editor
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={handleGenerate}
                  size="sm"
                  className="text-white dark:text-black"
                >
                  <Play className="size-4" />
                  Generate Schema
                </Button>
                <Button
                  onClick={() => setTab("ai")}
                  variant="secondary"
                  size="sm"
                  className="border-violet-600/70 bg-violet-800 text-white hover:border-violet-500/80 hover:bg-violet-700 dark:text-black"
                >
                  <Wand2 className="size-4" />
                  Ask AI
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                  disabled={Boolean(importProgress)}
                >
                  <FileInput className="size-4" />
                  Import code
                </Button>
                <Button variant="outline" size="sm" onClick={resetCode}>
                  <RotateCcw className="size-4" />
                  Reset
                </Button>
              </div>

              <input
                ref={inputRef}
                type="file"
                accept=".sql,.dbml,.txt"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void importFile(file);
                  }
                  event.currentTarget.value = "";
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="ai" className="m-0 flex min-h-0 flex-1 flex-col">
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-5 p-4">
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold">
                        AI schema prompt
                      </h2>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Local mock provider, ready for LLM wiring.
                      </p>
                    </div>
                    <Badge>{formatLabels[codeFormat]}</Badge>
                  </div>
                  <Textarea
                    value={aiPrompt}
                    onChange={(event) => setAiPrompt(event.target.value)}
                    placeholder="create users and orders tables with foreign keys"
                    className="min-h-32 resize-none"
                  />
                  <Button
                    className="mt-3 w-full"
                    onClick={handleAiGenerate}
                    disabled={isGenerating || !aiPrompt.trim()}
                  >
                    <Sparkles className="size-4" />
                    {isGenerating ? "Generating..." : "Generate Schema"}
                  </Button>
                  {lastAiSummary ? (
                    <p className="text-primary mt-2 text-xs">{lastAiSummary}</p>
                  ) : null}
                </section>

                <section>
                  <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-[0.16em] uppercase">
                    Quick prompts
                  </h3>
                  <div className="space-y-2">
                    {prompts.map((prompt) => (
                      <button
                        key={prompt}
                        className="border-border bg-secondary/45 text-muted-foreground hover:border-border-strong hover:text-foreground w-full rounded-md border px-3 py-2 text-left text-xs leading-5 transition-colors"
                        onClick={() => setAiPrompt(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-[0.16em] uppercase">
                    Sample schemas
                  </h3>
                  <div className="space-y-2">
                    {samplePresets.map((preset) => (
                      <button
                        key={preset.id}
                        className="border-border bg-secondary/45 hover:border-primary/45 hover:bg-primary/8 w-full rounded-md border p-3 text-left transition-colors"
                        onClick={() => {
                          loadPreset(preset);
                          toast.success(`${preset.name} loaded.`);
                          setTab("code");
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            {preset.name}
                          </span>
                          <Badge variant="secondary">
                            {formatLabels[preset.format]}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground mt-1 text-xs leading-5">
                          {preset.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold tracking-[0.16em] uppercase">
                    <History className="size-3.5" />
                    History
                  </h3>
                  <div className="space-y-1">
                    {history.map((item) => (
                      <button
                        key={item}
                        className="text-muted-foreground hover:bg-secondary hover:text-foreground w-full truncate rounded px-2 py-1.5 text-left text-xs transition-colors dark:hover:bg-white/[0.05]"
                        onClick={() => setAiPrompt(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </aside>
    </>
  );
}
