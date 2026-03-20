import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef(({ className, type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "h-11 w-full rounded-[var(--radius,0.5rem)] border border-[#2a2a2a] bg-[#181818] px-4 py-2 text-[#f0ebe0] placeholder:text-[#786f65] outline-none transition-all duration-150 focus:border-[#c8952a] focus:ring-2 focus:ring-[#c8952a]/20 font-[var(--font-body,Inter,sans-serif)]",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
