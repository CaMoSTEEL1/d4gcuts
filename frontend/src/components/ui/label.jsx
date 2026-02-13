import * as React from "react";
import { cn } from "@/lib/utils";

const Label = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <label
      ref={ref}
      className={cn(
        "text-xs font-semibold uppercase tracking-[0.12em] text-[#a5b9e2]",
        className
      )}
      {...props}
    />
  );
});
Label.displayName = "Label";

export { Label };
