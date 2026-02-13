import * as React from "react";
import { cn } from "@/lib/utils";

const Select = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={cn(
        "h-11 w-full appearance-none rounded-xl border border-[#2a3653] bg-[#0c1322] px-4 py-2 pr-10 text-sm text-[#dbe6ff] outline-none transition-all duration-200",
        "focus:border-[#4c78ff] focus:ring-2 focus:ring-[#4c78ff]/30",
        "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%237aa2ff%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]",
        "bg-[length:16px] bg-[right_12px_center] bg-no-repeat",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});
Select.displayName = "Select";

const SelectOption = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <option
      ref={ref}
      className={cn("bg-[#0c1322] text-[#dbe6ff]", className)}
      {...props}
    />
  );
});
SelectOption.displayName = "SelectOption";

export { Select, SelectOption };
