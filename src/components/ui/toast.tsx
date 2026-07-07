"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { CircleAlert, CircleCheck, Info, X } from "lucide-react"
import { Toast as ToastPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

const ToastProvider = ToastPrimitive.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      "fixed right-0 bottom-0 z-100 flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:max-w-sm",
      className,
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitive.Viewport.displayName

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border bg-background p-4 pr-8 text-sm shadow-lg transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=open]:slide-in-from-bottom-full data-[state=closed]:slide-out-to-right-full",
  {
    variants: {
      variant: {
        default: "border-zinc-200 text-foreground",
        neutral: "border-zinc-200 text-foreground",
        success: "border-emerald-200 bg-emerald-50 text-emerald-950",
        destructive: "border-red-200 bg-red-50 text-red-950",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
)

const toastIconStyles = {
  default: "text-cyan-700",
  neutral: "text-cyan-700",
  success: "text-emerald-700",
  destructive: "text-red-700",
}

function ToastIcon({
  variant,
}: {
  variant: NonNullable<VariantProps<typeof toastVariants>["variant"]>
}) {
  const className = cn("mt-0.5 size-4 shrink-0", toastIconStyles[variant])

  if (variant === "success") {
    return <CircleCheck className={className} />
  }

  if (variant === "destructive") {
    return <CircleAlert className={className} />
  }

  return <Info className={className} />
}

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant = "neutral", children, ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    className={cn(toastVariants({ variant }), className)}
    {...props}
  >
    <ToastIcon variant={variant ?? "neutral"} />
    <div className="grid flex-1 gap-1">{children}</div>
  </ToastPrimitive.Root>
))
Toast.displayName = ToastPrimitive.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-muted focus:ring-2 focus:ring-ring focus:outline-none disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitive.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    className={cn(
      "absolute top-2 right-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:ring-2 group-hover:opacity-100",
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="size-4" />
  </ToastPrimitive.Close>
))
ToastClose.displayName = ToastPrimitive.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn("font-medium", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitive.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn("text-muted-foreground", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitive.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>

type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  type ToastActionElement,
  type ToastProps,
}
