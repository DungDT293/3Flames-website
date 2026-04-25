import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { ChevronDown } from "lucide-react";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  placeholder?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, placeholder, ...props }, ref) => {
    return (
      <div className="w-full">
        <div className="relative">
          <select
            className={cn(
              "flex h-10 w-full appearance-none rounded-md border bg-app-input px-3 py-2 pr-10 text-sm text-app-fg",
              "transition-colors duration-200",
              "focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error
                ? "border-red-500 focus:ring-red-500/50 focus:border-red-500"
                : "border-app-border",
              className,
            )}
            ref={ref}
            {...props}
          >
            {placeholder && (
              <option value="" disabled className="text-app-muted">
                {placeholder}
              </option>
            )}
            {children}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
        </div>
        {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
      </div>
    );
  },
);
Select.displayName = "Select";

export { Select };
