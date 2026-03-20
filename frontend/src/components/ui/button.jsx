import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-bold uppercase tracking-widest transition-all duration-150 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c8952a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0f0f]",
  {
    variants: {
      variant: {
        default:
          "bg-[#c8952a] text-black hover:brightness-110 rounded-sm active:scale-[0.98]",
        ghost:
          "border border-[#2a2a2a] bg-transparent text-[#f0ebe0] hover:border-[#f0ebe0] rounded-sm",
        secondary:
          "bg-[#181818] border border-[#1e1e1e] text-[#f0ebe0] hover:border-[#2a2a2a] rounded-sm",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-7 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = "Button";

export { Button };
