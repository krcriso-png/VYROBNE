import * as React from "react";
import { cn } from "@/lib/utils";

// Clean, accessible button with a small set of variants and sizes.
type Variant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary/70",
  outline:
    "border border-input bg-background hover:bg-muted hover:text-foreground",
  ghost: "hover:bg-muted hover:text-foreground",
  destructive:
    "bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-6 text-sm",
  icon: "h-10 w-10",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
