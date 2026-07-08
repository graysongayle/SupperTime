import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Suppertime Helpdesk",
  description: "Internal support desk for email and embedded-form tickets.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

const hasClerkPublishableKey = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const content = (
    <html
      lang="en"
      className={`${jetBrainsMono.variable} h-full antialiased`}
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
      suppressHydrationWarning
    >
      <body
        className="min-h-full bg-background text-foreground"
        style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
        suppressHydrationWarning
      >
        {children}
        <Toaster />
      </body>
    </html>
  );

  if (!hasClerkPublishableKey && process.env.NODE_ENV !== "production") {
    return content;
  }

  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      {content}
    </ClerkProvider>
  );
}
