"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const sanitizedClassName = className
    ? className
        .split(/\s+/)
        .filter((c) => !c.startsWith("bg-muted") && !c.startsWith("bg-card"))
        .join(" ")
    : ""

  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 p-1 text-white border border-blue-700/40 shadow-sm",
        sanitizedClassName
      )}
      {...props}
    />
  )
})
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const sanitizedClassName = className
    ? className
        .split(/\s+/)
        .filter(
          (c) =>
            !c.startsWith("text-muted-foreground") &&
            !c.startsWith("data-[state=active]:bg-background") &&
            !c.startsWith("data-[state=active]:bg-card") &&
            !c.startsWith("data-[state=active]:text-foreground")
        )
        .join(" ")
    : ""

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-bold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 text-white/85 hover:text-white hover:bg-white/10 data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-md",
        sanitizedClassName
      )}
      {...props}
    />
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
