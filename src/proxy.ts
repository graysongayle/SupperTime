import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/support(.*)",
  "/support-form-preview(.*)",
  "/api/email/inbound/postmark(.*)",
  "/api/inbound-email(.*)",
  "/api/support-form(.*)",
]);

const hasClerkConfig = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

const proxy =
  !hasClerkConfig && process.env.NODE_ENV !== "production"
    ? () => NextResponse.next()
    : clerkMiddleware(async (auth, req) => {
        if (!isPublicRoute(req)) {
          await auth.protect();
        }
      });

export default proxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ico|ttf|woff2?|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
