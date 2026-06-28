import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "primary" | "success" | "warning" | "destructive";

const tones: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

/** A small status dot used in status badges. */
export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  const color: Record<Tone, string> = {
    neutral: "bg-muted-foreground",
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
  };
  return (
    <span className={cn("size-1.5 rounded-full", color[tone])} aria-hidden />
  );
}
