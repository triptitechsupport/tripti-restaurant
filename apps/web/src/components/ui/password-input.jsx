import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

/**
 * PasswordInput — a drop-in replacement for <Input type="password"> that adds
 * a Show/Hide toggle (eye icon) on the right side. It forwards a ref and
 * spreads all standard input props, so existing validation, autoComplete,
 * disabled, value/onChange, and styling (via className) keep working exactly
 * as before. Only the password visibility is added.
 */
const PasswordInput = React.forwardRef(({ className, ...props }, ref) => {
  const [showPassword, setShowPassword] = React.useState(false)

  return (
    <div className="relative w-full">
      <Input
        type={showPassword ? "text" : "password"}
        className={cn("pr-10", className)}
        ref={ref}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={showPassword ? "Hide password" : "Show password"}
        onClick={() => setShowPassword((s) => !s)}
        className="absolute right-0 top-0 bottom-0 flex items-center justify-center w-10 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
        // Never submit the form or steal focus from the field.
      >
        {showPassword ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </button>
    </div>
  )
})
PasswordInput.displayName = "PasswordInput"

export { PasswordInput }
