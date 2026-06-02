import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MemoryGraph — Neural Memory for Cluely",
  description: "Local AI memory graph with live knowledge visualization, hybrid retrieval, and real-time context injection.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#09090b] text-zinc-200 font-sans antialiased">{children}</body>
    </html>
  );
}
