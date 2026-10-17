import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Grain } from "@/components/atmosphere";
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
  title: "unif.ai",
  description: "Your agent meets people, so you don't have to start cold.",
};

export const viewport: Viewport = {
  themeColor: "#f3f1ed",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full">
        <div className="relative isolate flex min-h-dvh w-full flex-col overflow-x-clip">
          <Grain />
          {children}
        </div>
      </body>
    </html>
  );
}
