import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import clsx from "clsx";

import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Certivo Compliance Command Center",
  description: "Frontend dashboard aligning with Architecture.md Section 6 to monitor BOMs, suppliers, risk, and CORA activity."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={clsx(inter.className, spaceGrotesk.variable, "min-h-screen bg-slate-950 text-slate-100")}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
