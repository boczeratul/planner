import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider, UserButton } from "@clerk/nextjs";
import { SyncProvider } from "@/components/SyncProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Tour Planner",
  description: "Plan trips that fit your travel style — drag, drop, and let AI sort the logistics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          {/* Account menu / sign-out. UserButton renders nothing when signed
              out; after sign-out, middleware redirects to /sign-in. */}
          <div className="fixed right-3 top-2 z-50">
            <UserButton />
          </div>
          <SyncProvider>{children}</SyncProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
