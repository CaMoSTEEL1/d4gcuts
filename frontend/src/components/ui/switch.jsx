import * as React from "react";
import { cn } from "@/lib/utils";

const Switch = React.forwardRef(({ className, checked, onCheckedChange, label, ...props }, ref) => {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2.5 cursor-pointer select-none text-sm text-[#dbe6ff]",
        className
      )}
    >
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4c78ff]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0f1a]",
          checked ? "bg-[#4c78ff]" : "bg-[#2a3653]"
        )}
        {...props}
      >
        <span
          className={cn(
            "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform duration-200",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
      {label && <span>{label}</span>}
    </label>
  );
});
Switch.displayName = "Switch";

export { Switch };
