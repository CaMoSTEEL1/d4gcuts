import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef(({ className, type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "h-11 w-full rounded-xl border border-[#2a3653] bg-[#0c1322] px-4 py-2 text-[#dbe6ff] placeholder:text-[#6f84b2] outline-none transition-all duration-200 focus:border-[#4c78ff] focus:ring-2 focus:ring-[#4c78ff]/30",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
