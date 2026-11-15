import { ArrowDown, ArrowRight } from "lucide-react";
import { cn } from "cn";

export type FlowNode = { title: string; detail?: string; tone?: "plain" | "info" | "success" };

const TONES: Record<NonNullable<FlowNode["tone"]>, string> = {
  plain: "bg-card ring-foreground/10",
  info: "bg-info/12 ring-info/40",
  success: "bg-success/12 ring-success/40",
};

/**
 * A small left-to-right diagram, top to bottom on narrow screens. It is an ordered list, so its text is the diagram's
 * text alternative; the arrows are decoration.
 */
export function Flow({ label, nodes }: { label: string; nodes: FlowNode[] }) {
  return (
    <ol aria-label={label} className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
      {nodes.map((node, index) => (
        <li key={node.title} className="flex flex-col items-center gap-2 md:flex-1 md:flex-row">
          <div className={cn("w-full rounded-lg px-3 py-2 ring-1", TONES[node.tone ?? "plain"])}>
            <p className="font-medium">{node.title}</p>
            {node.detail && <p className="text-xs text-muted-foreground">{node.detail}</p>}
          </div>
          {index < nodes.length - 1 && (
            <>
              <ArrowDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground md:hidden" />
              <ArrowRight aria-hidden="true" className="hidden size-4 shrink-0 text-muted-foreground md:block" />
            </>
          )}
        </li>
      ))}
    </ol>
  );
}
