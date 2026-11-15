"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorText } from "@/lib/format-error";
import type { Destination } from "@/lib/tree";

type MoveDialogProps = {
  // The folder's or Test File's name; null closes the dialog.
  name: string | null;
  destinations: Destination[];
  onMove: (destination: Destination) => Promise<void>;
  onClose: () => void;
};

/**
 * "Move to…": the keyboard way to do what dragging a row does (frontend.md 1.6). Each place is a button; a move the
 * backend refuses keeps the dialog open with its message.
 */
export function MoveDialog({ name, destinations, onMove, onClose }: MoveDialogProps) {
  const [isMoving, setIsMoving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const move = async (destination: Destination) => {
    if (isMoving) return;
    setIsMoving(true);
    setErrorMessage(null);
    try {
      await onMove(destination);
      onClose();
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <Dialog open={name !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move {name}</DialogTitle>
          <DialogDescription>Choose the project or folder to move it to.</DialogDescription>
        </DialogHeader>
        {destinations.length === 0 ? (
          <p className="text-muted-foreground">There is no other project or folder to move it to.</p>
        ) : (
          <ul aria-label="Places" className="max-h-72 space-y-0.5 overflow-auto">
            {destinations.map((destination) => (
              <li key={`${destination.projectId}/${destination.folderId ?? ""}`}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start truncate"
                  disabled={isMoving}
                  onClick={() => void move(destination)}
                >
                  {destination.label}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {errorMessage && (
          <p role="alert" className="text-destructive">
            {errorMessage}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isMoving}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
