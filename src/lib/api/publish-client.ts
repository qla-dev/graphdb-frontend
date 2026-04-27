import type {
  ParsedSchema,
  PublishedApi,
  SchemaCodeFormat
} from "@/types/schema";

const LOCAL_API_BASE_URL = "http://127.0.0.1:8000/api";
const DEFAULT_API_BASE_URL = LOCAL_API_BASE_URL;

export function apiBaseUrl() {
  return (
    (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
      /\/+$/,
      ""
    ) || DEFAULT_API_BASE_URL
  );
}

function apiUrl(path: string) {
  return `${apiBaseUrl()}/${path.replace(/^\/+/, "")}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.message || `Request failed: ${response.status}`);
  }

  return payload as T;
}

export interface StartPublishPayload {
  projectName: string;
  format: SchemaCodeFormat;
  code: string;
  schema: ParsedSchema;
}

export interface PublishStartResponse {
  id: string;
  status: "queued";
  statusUrl: string;
}

export interface PublishStatusResponse {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  step: string;
  message: string | null;
  error: string | null;
  apiBasePath: string | null;
  apiToken: string | null;
}

export async function startPublish(payload: StartPublishPayload) {
  const response = await fetch(apiUrl("publish"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  return readJson<PublishStartResponse>(response);
}

export async function getPublishStatus(id: string) {
  const response = await fetch(apiUrl(`publish/${id}`), {
    headers: {
      Accept: "application/json"
    }
  });

  return readJson<PublishStatusResponse>(response);
}

export function publishedApiFromStatus(
  status: PublishStatusResponse
): PublishedApi | null {
  if (status.status !== "succeeded" || !status.apiBasePath || !status.apiToken) {
    return null;
  }

  return {
    id: status.id,
    apiBasePath: status.apiBasePath,
    apiToken: status.apiToken,
    publishedAt: Date.now()
  };
}
