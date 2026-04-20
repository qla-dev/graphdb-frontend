import type {
  ParsedSchema,
  SchemaCodeFormat,
  SchemaGroup
} from "@/types/schema";
import { downloadTextFile, slugifyIdentifier } from "@/lib/utils";

export type ExportKind = "json" | "code" | "png" | "pdf";

export interface ExportResult {
  ok: boolean;
  message: string;
}

export interface SourceExportPayload {
  schemeName: string;
  schema: ParsedSchema;
  code: string;
  format: SchemaCodeFormat;
  nodePositions: Record<string, { x: number; y: number }>;
  groups: SchemaGroup[];
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function fileBaseName(name: string) {
  return slugifyIdentifier(name || "graphdb-schema") || "graphdb-schema";
}

export function exportSource(
  kind: "json" | "code",
  payload: SourceExportPayload
): ExportResult {
  const stamp = timestampSlug();
  const baseName = fileBaseName(payload.schemeName);

  if (kind === "json") {
    downloadTextFile(
      `${baseName}-${stamp}.json`,
      JSON.stringify(
        {
          name: payload.schemeName,
          format: payload.format,
          code: payload.code,
          schema: payload.schema,
          nodePositions: payload.nodePositions,
          groups: payload.groups
        },
        null,
        2
      ),
      "application/json"
    );
    return { ok: true, message: "Schema JSON exported." };
  }

  const extension = payload.format === "dbml" ? "dbml" : "sql";
  downloadTextFile(`${baseName}-${stamp}.${extension}`, payload.code);
  return { ok: true, message: "Source code exported." };
}

export async function exportCanvasImage(
  kind: "png" | "pdf",
  element: HTMLElement,
  schemeName: string
): Promise<ExportResult> {
  const [{ toPng }, { jsPDF }] = await Promise.all([
    import("html-to-image"),
    import("jspdf")
  ]);
  const stamp = timestampSlug();
  const baseName = fileBaseName(schemeName);
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const dataUrl = await toPng(element, {
    pixelRatio: 2.2,
    backgroundColor: "#070707",
    cacheBust: true,
    width,
    height,
    filter: (node) => {
      if (!(node instanceof HTMLElement)) {
        return true;
      }

      return !(
        node.dataset.exportExclude === "true" ||
        node.classList.contains("react-flow__controls") ||
        node.classList.contains("react-flow__attribution") ||
        node.classList.contains("react-flow__panel")
      );
    },
    style: {
      background: "#070707"
    }
  });

  if (kind === "png") {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${baseName}-${stamp}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return { ok: true, message: "Schema PNG exported." };
  }

  const orientation = width >= height ? "landscape" : "portrait";
  const pdf = new jsPDF({
    orientation,
    unit: "px",
    format: [width, height],
    compress: true
  });

  pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
  pdf.save(`${baseName}-${stamp}.pdf`);
  return { ok: true, message: "Schema PDF exported." };
}
