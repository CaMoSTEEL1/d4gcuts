import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
  {
    variants: {
      variant: {
        default: "bg-[#4c78ff]/20 text-[#a9c2ff] border border-[#4c78ff]/40",
        muted: "bg-[#1a2742] text-[#92a8d3] border border-[#31456f]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
