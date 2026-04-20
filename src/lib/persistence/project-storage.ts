import type { PersistedProject } from "@/types/schema";

const storageKey = "graphdb.projects.v1";
const legacyStorageKey = "graphdb.schemes.v1";
const activeProjectKey = "graphdb.activeProjectId.v1";
const legacyActiveSchemeKey = "graphdb.activeSchemeId.v1";
const PROD_API_BASE_URL = "https://roomsita.com/backend/public/api";
// const LOCAL_API_BASE_URL = "http://127.0.0.1:8000/api";
const DEFAULT_API_BASE_URL = PROD_API_BASE_URL;

function apiBaseUrl() {
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

function browserStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function normalizeProject(project: PersistedProject): PersistedProject {
  return {
    ...project,
    nodePositions: project.nodePositions ?? {},
    groups: project.groups ?? [],
    tableCount: project.tableCount ?? 0,
    relationshipCount: project.relationshipCount ?? 0
  };
}

function loadLocalProjects(): PersistedProject[] {
  const storage = browserStorage();
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(storageKey) ?? storage.getItem(legacyStorageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((scheme) => ({
      ...scheme,
      nodePositions: scheme.nodePositions ?? {},
      groups: scheme.groups ?? scheme.sections ?? []
    }));
  } catch {
    return [];
  }
}

function saveLocalProjects(projects: PersistedProject[]) {
  const storage = browserStorage();
  if (!storage) {
    return;
  }

  storage.setItem(storageKey, JSON.stringify(projects));
}

async function fetchBackendProjects(): Promise<PersistedProject[]> {
  const response = await fetch(apiUrl("projects"), {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Could not load saved projects: ${response.status}`);
  }

  const payload = (await response.json()) as { projects?: PersistedProject[] };
  return (payload.projects ?? []).map(normalizeProject);
}

async function syncBackendProjects(projects: PersistedProject[]) {
  const response = await fetch(apiUrl("projects"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ projects })
  });

  if (!response.ok) {
    throw new Error(`Could not save projects: ${response.status}`);
  }
}

export async function loadPersistedProjects(): Promise<PersistedProject[]> {
  const localProjects = loadLocalProjects();

  try {
    const backendProjects = await fetchBackendProjects();
    if (backendProjects.length > 0) {
      saveLocalProjects(backendProjects);
      return backendProjects;
    }

    if (localProjects.length > 0) {
      await syncBackendProjects(localProjects);
      return localProjects;
    }

    return [];
  } catch {
    return localProjects;
  }
}

export async function savePersistedProjects(projects: PersistedProject[]) {
  saveLocalProjects(projects);
  await syncBackendProjects(projects);
}

export function getActiveProjectId() {
  const storage = browserStorage();
  return (
    storage?.getItem(activeProjectKey) ??
    storage?.getItem(legacyActiveSchemeKey) ??
    null
  );
}

export function setActiveProjectId(id: string) {
  browserStorage()?.setItem(activeProjectKey, id);
}

export function removeActiveProjectId() {
  browserStorage()?.removeItem(activeProjectKey);
}
