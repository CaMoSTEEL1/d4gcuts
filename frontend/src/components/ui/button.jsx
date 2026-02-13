import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7aa2ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0f1a]",
  {
    variants: {
      variant: {
        default: "bg-[#4c78ff] text-[#061022] hover:brightness-110",
        ghost: "border border-[#3c4d7c] bg-transparent text-[#d9e5ff] hover:bg-[#12213f]",
        secondary: "bg-[#111829] border border-[#27314a] text-[#d9e5ff] hover:border-[#4c78ff]",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3",
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
