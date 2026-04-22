import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

interface ConfirmDestructiveDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  warningMessage?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDestructiveDialog({
  open,
  title,
  description,
  confirmLabel,
  warningMessage,
  onCancel,
  onConfirm
}: ConfirmDestructiveDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {warningMessage ? (
          <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3">
            <div className="flex items-start gap-2 text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div className="text-sm font-medium">{warningMessage}</div>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
