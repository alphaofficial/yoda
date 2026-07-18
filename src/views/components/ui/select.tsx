import * as React from "react"

import { cn } from "@/views/lib/utils"

function Select({ className, onBlur, onChange, onKeyDown, onPointerDown, ...props }: React.ComponentProps<"select">) {
  const pointerSelection = React.useRef(false)

  return (
    <select
		data-slot="select"
		className={cn(
			"h-10 w-full rounded-md border border-input bg-background px-3.5 py-2 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
			className
		)}
      {...props}
		onPointerDown={(event) => {
			pointerSelection.current = true
			onPointerDown?.(event)
		}}
		onKeyDown={(event) => {
			pointerSelection.current = false
			onKeyDown?.(event)
		}}
		onChange={(event) => {
			onChange?.(event)
			if (pointerSelection.current) {
				pointerSelection.current = false
				event.currentTarget.blur()
			}
		}}
		onBlur={(event) => {
			pointerSelection.current = false
			onBlur?.(event)
		}}
    />
  )
}

export { Select }
