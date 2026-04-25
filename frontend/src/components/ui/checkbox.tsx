import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Check } from "lucide-react";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  error?: string;
  label?: React.ReactNode;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, error, label, id, checked, onChange, ...props }, ref) => {
    const inputId = id || React.useId();
    const [isChecked, setIsChecked] = React.useState(!!checked);

    React.useEffect(() => {
      setIsChecked(!!checked);
    }, [checked]);

    function handleToggle() {
      const next = !isChecked;
      setIsChecked(next);
      if (onChange) {
        const fakeEvent = {
          target: { checked: next, type: "checkbox", name: props.name || "" },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(fakeEvent);
      }
    }

    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-start gap-2.5">
          <div className="relative flex items-center">
            <input
              type="checkbox"
              id={inputId}
              ref={ref}
              className="sr-only"
              checked={isChecked}
              onChange={onChange}
              {...props}
            />
            <div
              className={cn(
                "h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-all duration-200 cursor-pointer",
                isChecked
                  ? "bg-brand-500 border-brand-500"
                  : error
                    ? "border-red-500"
                    : "border-surface-500 hover:border-zinc-400",
                className,
              )}
              onClick={handleToggle}
            >
              {isChecked && (
                <Check className="h-3 w-3 text-white" strokeWidth={3} />
              )}
            </div>
          </div>
          {label && (
            <label
              htmlFor={inputId}
              className="text-sm text-zinc-400 cursor-pointer leading-snug select-none"
              onClick={(e) => {
                e.preventDefault();
                handleToggle();
              }}
            >
              {label}
            </label>
          )}
        </div>
        {error && <p className="text-xs text-red-400 ml-6">{error}</p>}
      </div>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
