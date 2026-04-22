const SESSION_STORAGE_KEY = "graphdb.session-login";
const HARDCODED_PASSWORD = "password123";

const SESSION_USERS = {
  "qla.dev": { isAdmin: false },
  "qla.dev.admin": { isAdmin: true }
} as const;

export type SessionUsername = keyof typeof SESSION_USERS;

function browserSessionStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage;
}

export function getSessionUsername(): SessionUsername | null {
  const username = browserSessionStorage()?.getItem(SESSION_STORAGE_KEY);

  if (!username || !(username in SESSION_USERS)) {
    return null;
  }

  return username as SessionUsername;
}

export function hasActiveSession() {
  return getSessionUsername() !== null;
}

export function isAdminSession() {
  return getSessionUsername() === "qla.dev.admin";
}

export function validateSessionCredentials(
  username: string,
  password: string
): SessionUsername | null {
  const trimmedUsername = username.trim();

  if (!(trimmedUsername in SESSION_USERS) || password !== HARDCODED_PASSWORD) {
    return null;
  }

  return trimmedUsername as SessionUsername;
}

export function setSessionUsername(username: SessionUsername | null) {
  const storage = browserSessionStorage();
  if (!storage) {
    return;
  }

  if (username) {
    storage.setItem(SESSION_STORAGE_KEY, username);
    return;
  }

  storage.removeItem(SESSION_STORAGE_KEY);
}
