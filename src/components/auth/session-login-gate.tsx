import { useEffect, useRef, useState, type FormEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const SESSION_STORAGE_KEY = "graphdb.session-login";
const HARDCODED_USERNAME = "qla.dev";
const HARDCODED_PASSWORD = "password123";

function hasActiveSession() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.sessionStorage.getItem(SESSION_STORAGE_KEY) === HARDCODED_USERNAME;
}

function setSessionState(isAuthenticated: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  if (isAuthenticated) {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, HARDCODED_USERNAME);
    return;
  }

  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

export function SessionLoginGate() {
  const [isAuthenticated, setIsAuthenticated] = useState(hasActiveSession);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const wasAuthenticatedRef = useRef(isAuthenticated);

  useEffect(() => {
    const syncSessionState = () => {
      const hasSession = hasActiveSession();

      if (wasAuthenticatedRef.current && !hasSession) {
        setErrorMessage("");
        setPassword("");
      }

      wasAuthenticatedRef.current = hasSession;
      setIsAuthenticated(hasSession);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncSessionState();
      }
    };

    syncSessionState();

    const intervalId = window.setInterval(syncSessionState, 1000);
    window.addEventListener("focus", syncSessionState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncSessionState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const isValidLogin =
      username.trim() === HARDCODED_USERNAME && password === HARDCODED_PASSWORD;

    if (!isValidLogin) {
      setSessionState(false);
      wasAuthenticatedRef.current = false;
      setIsAuthenticated(false);
      setErrorMessage("Invalid username or password.");
      setPassword("");
      return;
    }

    setSessionState(true);
    wasAuthenticatedRef.current = true;
    setErrorMessage("");
    setPassword("");
    setIsAuthenticated(true);
  };

  return (
    <Dialog open={!isAuthenticated}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="items-center gap-3 text-center">
          <div className="bg-primary/12 text-primary flex size-11 items-center justify-center rounded-full">
            <LockKeyhole className="size-5" />
          </div>
          <div className="space-y-1">
            <DialogTitle>Session login required</DialogTitle>
            <DialogDescription>
              Enter your frontend session credentials to continue.
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="border-border mt-2 border-t" />
        <form className="space-y-4 pt-3" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label
              className="block pb-1 text-sm font-medium"
              htmlFor="session-username"
            >
              Username
            </label>
            <Input
              id="session-username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                if (errorMessage) {
                  setErrorMessage("");
                }
              }}
              placeholder="Enter username"
            />
          </div>
          <div className="space-y-2">
            <label
              className="block pb-1 text-sm font-medium"
              htmlFor="session-password"
            >
              Password
            </label>
            <Input
              id="session-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (errorMessage) {
                  setErrorMessage("");
                }
              }}
              placeholder="Enter password"
            />
          </div>
          {errorMessage ? (
            <p className="text-destructive text-sm">{errorMessage}</p>
          ) : null}
          <DialogFooter>
            <Button className="w-full" type="submit">
              Sign in
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
