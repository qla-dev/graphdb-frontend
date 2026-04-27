import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Clipboard, Database } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buildGeneratedApiModels,
  type GeneratedApiEndpoint,
  type GeneratedApiModel
} from "@/lib/api/generated-api";
import { useSchemaStore } from "@/lib/store/schema-store";

const methodStyles: Record<
  GeneratedApiEndpoint["method"],
  {
    badge: string;
    panel: string;
    toggle: string;
    detailBorder: string;
    accent: string;
    parameter: string;
  }
> = {
  GET: {
    badge: "bg-sky-500 text-white dark:bg-sky-400 dark:text-[#03121f]",
    panel:
      "border-sky-500/70 bg-sky-50/85 dark:border-sky-400/45 dark:bg-sky-950/24",
    toggle:
      "text-slate-900 hover:bg-sky-100 dark:text-slate-100 dark:hover:bg-sky-400/10",
    detailBorder: "border-sky-500/60 dark:border-sky-400/35",
    accent: "bg-sky-400",
    parameter:
      "border-sky-500/40 bg-white/60 text-slate-700 dark:border-sky-400/30 dark:bg-white/[0.04] dark:text-slate-300"
  },
  POST: {
    badge: "bg-emerald-500 text-white dark:bg-emerald-400 dark:text-[#04110c]",
    panel:
      "border-emerald-500/70 bg-emerald-50/80 dark:border-emerald-400/45 dark:bg-emerald-950/20",
    toggle:
      "text-slate-900 hover:bg-emerald-100 dark:text-slate-100 dark:hover:bg-emerald-400/10",
    detailBorder: "border-emerald-500/60 dark:border-emerald-400/35",
    accent: "bg-emerald-400",
    parameter:
      "border-emerald-500/40 bg-white/60 text-slate-700 dark:border-emerald-400/30 dark:bg-white/[0.04] dark:text-slate-300"
  },
  PUT: {
    badge: "bg-amber-500 text-white dark:bg-amber-400 dark:text-[#211500]",
    panel:
      "border-amber-500/70 bg-amber-50/85 dark:border-amber-400/45 dark:bg-amber-950/20",
    toggle:
      "text-slate-900 hover:bg-amber-100 dark:text-slate-100 dark:hover:bg-amber-400/10",
    detailBorder: "border-amber-500/60 dark:border-amber-400/35",
    accent: "bg-amber-400",
    parameter:
      "border-amber-500/40 bg-white/60 text-slate-700 dark:border-amber-400/30 dark:bg-white/[0.04] dark:text-slate-300"
  },
  DELETE: {
    badge: "bg-rose-500 text-white dark:bg-rose-400 dark:text-[#26070d]",
    panel:
      "border-rose-500/70 bg-rose-50/85 dark:border-rose-400/45 dark:bg-rose-950/22",
    toggle:
      "text-slate-900 hover:bg-rose-100 dark:text-slate-100 dark:hover:bg-rose-400/10",
    detailBorder: "border-rose-500/60 dark:border-rose-400/35",
    accent: "bg-rose-400",
    parameter:
      "border-rose-500/40 bg-white/60 text-slate-700 dark:border-rose-400/30 dark:bg-white/[0.04] dark:text-slate-300"
  }
};

function MethodBadge({ method }: { method: GeneratedApiEndpoint["method"] }) {
  const styles = methodStyles[method];

  return (
    <span
      className={`flex h-9 w-24 shrink-0 items-center justify-center rounded text-sm font-bold ${styles.badge}`}
    >
      {method}
    </span>
  );
}

function EndpointRow({
  endpoint,
  expanded,
  onToggle
}: {
  endpoint: GeneratedApiEndpoint;
  expanded: boolean;
  onToggle: () => void;
}) {
  const styles = methodStyles[endpoint.method];

  const copyEndpoint = async () => {
    await navigator.clipboard?.writeText(endpoint.path);
    toast.success("Endpoint path copied.");
  };

  return (
    <div
      className={`overflow-hidden rounded border text-slate-900 shadow-sm dark:text-slate-100 ${styles.panel}`}
    >
      <div className="flex min-h-12 items-center gap-3 px-2 py-2 sm:px-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
        >
          <MethodBadge method={endpoint.method} />
          <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-50">
            {endpoint.path}
          </span>
          <span className="hidden truncate text-sm text-slate-700 md:block dark:text-slate-300">
            {endpoint.description}
          </span>
        </button>
        {expanded ? (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => void copyEndpoint()}
            className="h-8 w-8 bg-slate-600 text-white hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
            aria-label={`Copy ${endpoint.path}`}
          >
            <Clipboard className="size-4" />
          </Button>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${styles.toggle}`}
          aria-label={expanded ? "Collapse endpoint" : "Expand endpoint"}
        >
          {expanded ? (
            <ChevronUp className="size-5" />
          ) : (
            <ChevronDown className="size-5" />
          )}
        </button>
      </div>

      {expanded ? (
        <div className={`border-t px-6 py-8 ${styles.detailBorder}`}>
          <p className="text-sm text-slate-800 dark:text-slate-200">
            {endpoint.description}
          </p>
          <div className="mt-5 flex gap-3 text-sm">
            <a className="text-blue-700 underline dark:text-sky-300" href="#">
              Additional info
            </a>
            <a className="text-blue-700 underline dark:text-sky-300" href="#">
              Help
            </a>
          </div>

          <div className="mt-5 text-xs font-semibold tracking-[0.14em] text-slate-600 uppercase dark:text-slate-400">
            {endpoint.sampleLabel}
          </div>
          <pre className="mt-5 max-h-80 overflow-auto rounded bg-slate-200/70 p-3 font-mono text-sm leading-6 text-violet-700 dark:bg-black/35 dark:text-violet-300">
            <code>{endpoint.sample}</code>
          </pre>

          <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Parameters
              </h3>
              <div className={`mt-4 h-1 w-28 rounded ${styles.accent}`} />
              <div className="mt-4 flex flex-wrap gap-2">
                {endpoint.parameters.map((parameter) => (
                  <span
                    key={parameter}
                    className={`rounded border px-2 py-1 font-mono text-xs ${styles.parameter}`}
                  >
                    {parameter}
                  </span>
                ))}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="min-w-32 bg-white text-slate-900 hover:bg-slate-100 dark:bg-[#121211] dark:text-slate-100 dark:hover:bg-[#1c1c1a]"
            >
              Try it out
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ApiModelSection({
  model,
  expanded,
  expandedEndpointId,
  onToggleModel,
  onToggleEndpoint
}: {
  model: GeneratedApiModel;
  expanded: boolean;
  expandedEndpointId: string | null;
  onToggleModel: () => void;
  onToggleEndpoint: (endpointId: string) => void;
}) {
  return (
    <section>
      <button
        type="button"
        onClick={onToggleModel}
        className="mb-2 flex w-full items-center justify-between border-b border-slate-300 px-3 py-4 text-left dark:border-slate-700"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-bold tracking-wide text-slate-800 dark:text-slate-100">
            {model.title}
          </h2>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {model.table.columns.length} fields · CRUD model
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="size-5 shrink-0 text-slate-900 dark:text-slate-100" />
        ) : (
          <ChevronDown className="size-5 shrink-0 text-slate-900 dark:text-slate-100" />
        )}
      </button>

      {expanded ? (
        <div className="space-y-4">
          {model.endpoints.map((endpoint) => (
            <EndpointRow
              key={endpoint.id}
              endpoint={endpoint}
              expanded={expandedEndpointId === endpoint.id}
              onToggle={() => onToggleEndpoint(endpoint.id)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ApiExplorer() {
  const schema = useSchemaStore((state) => state.schema);
  const publishedApi = useSchemaStore((state) => state.publishedApi);
  const apiModels = useMemo(
    () => buildGeneratedApiModels(schema.tables, { publishedApi }),
    [publishedApi, schema.tables]
  );
  const defaultExpandedModelIds = useMemo(
    () => new Set(apiModels.map((model) => model.id)),
    [apiModels]
  );
  const [expandedModelIds, setExpandedModelIds] = useState<Set<string> | null>(
    null
  );
  const [expandedEndpointId, setExpandedEndpointId] = useState<string | null>(
    null
  );
  const visibleExpandedModelIds = expandedModelIds ?? defaultExpandedModelIds;

  const toggleModel = (modelId: string) => {
    setExpandedModelIds((current) => {
      const next = new Set(current ?? defaultExpandedModelIds);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  const toggleEndpoint = (endpointId: string) => {
    setExpandedEndpointId((current) =>
      current === endpointId ? null : endpointId
    );
  };

  return (
    <div className="h-full overflow-auto bg-[#f7f8f8] text-slate-900 dark:bg-[#070707] dark:text-slate-100">
      <div className="mx-auto w-full max-w-none px-4 py-4 sm:px-6">
        {apiModels.length === 0 ? (
          <div className="mx-3 flex min-h-[360px] items-center justify-center rounded border border-slate-300 bg-white/70 p-8 text-center dark:border-slate-700 dark:bg-white/[0.03]">
            <div>
              <Database className="mx-auto mb-4 size-10 text-emerald-500" />
              <h2 className="text-lg font-semibold">No schema tables yet</h2>
              <p className="mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
                Import or generate a schema in the sidebar, then switch back to
                API to see CRUD endpoints for each table model.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {publishedApi ? (
              <div className="mx-3 rounded border border-emerald-500/50 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-400/40 dark:bg-emerald-950/20 dark:text-emerald-100">
                <div className="font-semibold">Published API</div>
                <div className="mt-1 font-mono text-xs">
                  {publishedApi.apiBasePath}
                </div>
              </div>
            ) : null}
            {apiModels.map((model) => (
              <ApiModelSection
                key={model.id}
                model={model}
                expanded={visibleExpandedModelIds.has(model.id)}
                expandedEndpointId={expandedEndpointId}
                onToggleModel={() => toggleModel(model.id)}
                onToggleEndpoint={toggleEndpoint}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
