import { CircleCheck, CircleDashed, CircleX, Clock, LoaderCircle, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";

/** Every status the UI shows: a Run's, a Step's, and a Test File's latest Run (`none` = never run). */
export type Status = "queued" | "running" | "passed" | "failed" | "pending" | "active" | "none";

type Look = { role: "success" | "destructive" | "warning" | "muted"; Icon: LucideIcon; spin?: boolean };

// The one place that maps a status to its role and icon (design-system.md 2.3); the shape tells the statuses
// apart without color.
const LOOKS: Record<Status, Look> = {
  passed: { role: "success", Icon: CircleCheck },
  failed: { role: "destructive", Icon: CircleX },
  running: { role: "warning", Icon: LoaderCircle, spin: true },
  active: { role: "warning", Icon: LoaderCircle, spin: true },
  queued: { role: "muted", Icon: Clock },
  pending: { role: "muted", Icon: CircleDashed },
  none: { role: "muted", Icon: CircleDashed },
};

const TEXT: Record<Look["role"], string> = {
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-warning",
  muted: "text-muted-foreground",
};

/** The status icon alone, colored by its role; give it a label or a title next to it. */
export function StatusIcon({ status, className }: { status: Status; className?: string }) {
  const { role, Icon, spin } = LOOKS[status];
  return (
    <Icon
      aria-hidden="true"
      className={cn("size-4 shrink-0", TEXT[role], spin && "animate-spin motion-reduce:animate-none", className)}
    />
  );
}

/** A status as a badge: its icon and its label. */
export function StatusBadge({ status, label }: { status: Status; label: string }) {
  return (
    <Badge variant={LOOKS[status].role}>
      <StatusIcon status={status} className="text-current" />
      {label}
    </Badge>
  );
}
