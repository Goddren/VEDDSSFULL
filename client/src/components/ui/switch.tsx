import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

const labelColorMap: Record<string, { active: string; inactive: string }> = {
  green: { active: "text-green-400", inactive: "text-gray-500" },
  red: { active: "text-red-400", inactive: "text-gray-500" },
  blue: { active: "text-blue-400", inactive: "text-gray-500" },
  amber: { active: "text-amber-400", inactive: "text-gray-500" },
  orange: { active: "text-orange-400", inactive: "text-gray-500" },
};

const trackColorMap: Record<string, { checked: string; glow: string }> = {
  green: { checked: "data-[state=checked]:bg-green-500", glow: "data-[state=checked]:shadow-green-500/40" },
  red: { checked: "data-[state=checked]:bg-red-500", glow: "data-[state=checked]:shadow-red-500/40" },
  blue: { checked: "data-[state=checked]:bg-blue-500", glow: "data-[state=checked]:shadow-blue-500/40" },
  amber: { checked: "data-[state=checked]:bg-amber-500", glow: "data-[state=checked]:shadow-amber-500/40" },
  orange: { checked: "data-[state=checked]:bg-orange-500", glow: "data-[state=checked]:shadow-orange-500/40" },
};

const sizeMap = {
  sm: { root: "h-5 w-9", thumbTranslate: "data-[state=checked]:translate-x-4", thumbSize: 16 },
  md: { root: "h-7 w-12", thumbTranslate: "data-[state=checked]:translate-x-5", thumbSize: 20 },
  lg: { root: "h-9 w-16", thumbTranslate: "data-[state=checked]:translate-x-7", thumbSize: 28 },
};

const FeatureToggle = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> & {
    activeColor?: string;
    size?: "sm" | "md" | "lg";
    showLabel?: boolean;
    activeLabel?: string;
    inactiveLabel?: string;
  }
>(({ className, activeColor = "green", size = "md", showLabel = false, activeLabel = "ON", inactiveLabel = "OFF", ...props }, ref) => {
  const colors = trackColorMap[activeColor] || trackColorMap.green;
  const labelColors = labelColorMap[activeColor] || labelColorMap.green;
  const sizes = sizeMap[size];

  return (
    <div className="flex items-center gap-2">
      {showLabel && (
        <span className={cn(
          "text-xs font-semibold uppercase tracking-wide transition-colors duration-200",
          props.checked ? labelColors.active : labelColors.inactive
        )}>
          {props.checked ? activeLabel : inactiveLabel}
        </span>
      )}
      <SwitchPrimitives.Root
        className={cn(
          "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
          "transition-all duration-300 ease-in-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "data-[state=unchecked]:bg-gray-700",
          colors.checked,
          "data-[state=checked]:shadow-md",
          colors.glow,
          sizes.root,
          className
        )}
        {...props}
        ref={ref}
      >
        <SwitchPrimitives.Thumb
          className={cn(
            "pointer-events-none block rounded-full shadow-lg ring-0",
            "transition-all duration-300 ease-in-out",
            "data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-gray-400",
            "data-[state=checked]:bg-white data-[state=checked]:scale-110",
            sizes.thumbTranslate
          )}
          style={{
            width: sizes.thumbSize,
            height: sizes.thumbSize,
          }}
        />
      </SwitchPrimitives.Root>
    </div>
  );
})
FeatureToggle.displayName = "FeatureToggle"

export { Switch, FeatureToggle }
