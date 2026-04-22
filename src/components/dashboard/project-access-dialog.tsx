import { useEffect, useState } from "react";
import { Globe2, Lock } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { PersistedProject, ProjectVisibility } from "@/types/schema";

interface ProjectAccessDialogProps {
  open: boolean;
  project: PersistedProject | null;
  onClose: () => void;
  onSave: (payload: {
    visibility: ProjectVisibility;
    password: string;
  }) => Promise<void>;
}

export function ProjectAccessDialog({
  open,
  project,
  onClose,
  onSave
}: ProjectAccessDialogProps) {
  const [visibility, setVisibility] = useState<ProjectVisibility>("public");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !project) {
      setError("");
      setIsSaving(false);
      return;
    }

    setVisibility(project.visibility);
    setPassword(project.password ?? "");
    setError("");
    setIsSaving(false);
  }, [open, project]);

  const handleSave = async () => {
    const nextPassword = visibility === "private" ? password.trim() : "";

    if (visibility === "private" && !nextPassword) {
      setError("Password is required for private projects.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      await onSave({
        visibility,
        password: nextPassword
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not update project access."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSaving) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Project access</DialogTitle>
          <DialogDescription>
            {project
              ? `Update privacy and password for ${project.name}.`
              : "Update privacy and password for this project."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-start gap-2 text-sm">
              {visibility === "private" ? (
                <Lock className="text-primary mt-0.5 size-4 shrink-0" />
              ) : (
                <Globe2 className="text-primary mt-0.5 size-4 shrink-0" />
              )}
              <div className="text-muted-foreground">
                {visibility === "private"
                  ? "Private projects require the project password every time they are opened."
                  : "Public projects open without a password."}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
              Privacy
            </label>
            <Select
              value={visibility}
              onValueChange={(value) => {
                const nextVisibility = value as ProjectVisibility;
                setVisibility(nextVisibility);
                setError("");
                if (nextVisibility !== "private") {
                  setPassword("");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {visibility === "private" ? (
            <div className="space-y-2">
              <label className="text-muted-foreground text-xs font-semibold tracking-[0.16em] uppercase">
                Password
              </label>
              <Input
                autoFocus
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) {
                    setError("");
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleSave();
                  }
                }}
                placeholder="Enter project password"
              />
            </div>
          ) : null}

          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
            Save access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
