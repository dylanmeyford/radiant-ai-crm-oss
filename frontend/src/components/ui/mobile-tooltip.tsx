"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/lib/utils"

interface MobileTooltipProps {
  children: React.ReactNode
  content: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  sideOffset?: number
  className?: string
  contentClassName?: string
}

/**
 * Mobile-friendly tooltip that works on both hover (desktop) and tap (mobile)
 * On mobile, tapping shows the tooltip and tapping elsewhere dismisses it
 * On desktop, it behaves like a normal hover tooltip
 */
export const MobileTooltip: React.FC<MobileTooltipProps> = ({
  children,
  content,
  side = "top",
  sideOffset = 4,
  className,
  contentClassName
}) => {
  const [open, setOpen] = React.useState(false)
  const [isMobile, setIsMobile] = React.useState(false)
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  // Detect if we're on a mobile device
  React.useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0)
      setIsMobile(isMobileDevice)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Handle click/touch events for mobile
  const handleTriggerClick = React.useCallback((e: React.MouseEvent) => {
    if (isMobile) {
      e.preventDefault()
      e.stopPropagation()
      setOpen(prev => !prev)
    }
  }, [isMobile])

  // Handle touch start for mobile (provides better responsiveness)
  const handleTriggerTouchStart = React.useCallback((_e: React.TouchEvent) => {
    if (isMobile) {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      
      // Show tooltip immediately on touch
      setOpen(true)
    }
  }, [isMobile])

  // Close tooltip when clicking outside on mobile
  React.useEffect(() => {
    if (!isMobile || !open) return

    const handleClickOutside = (_e: MouseEvent | TouchEvent) => {
      setOpen(false)
    }

    // Add a small delay to prevent immediate closing
    timeoutRef.current = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true)
      document.addEventListener('touchstart', handleClickOutside, true)
    }, 100)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      document.removeEventListener('click', handleClickOutside, true)
      document.removeEventListener('touchstart', handleClickOutside, true)
    }
  }, [open, isMobile])

  // For desktop, use controlled state for hover behavior
  const handleOpenChange = React.useCallback((newOpen: boolean) => {
    if (!isMobile) {
      setOpen(newOpen)
    }
  }, [isMobile])

  return (
    <TooltipPrimitive.Provider delayDuration={isMobile ? 0 : 400}>
      <TooltipPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <TooltipPrimitive.Trigger
          asChild
          onClick={handleTriggerClick}
          onTouchStart={handleTriggerTouchStart}
          className={cn("cursor-pointer", className)}
        >
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={sideOffset}
            className={cn(
              "bg-gray-900 text-white animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-2 text-xs shadow-lg border border-gray-700",
              contentClassName
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-gray-900 border-gray-700" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

export default MobileTooltip
