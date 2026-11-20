import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";
import AppShell from "@/components/shell/AppShell";
import { WorkspaceProvider } from "@/components/WorkspaceContext";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], display: "swap" });

// Pocket mode: viewportFit cover makes env(safe-area-inset-bottom) real on iOS.
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

// Live fix wave C1 (T1-25): the plain default. Each page's own tab title
// ("Channels · Quarry Studio") is set by the shell from its breadcrumb
// (components/shell/AppShell.js); the login page names itself.
export const metadata = {
  title: "Quarry Studio",
  description: "Multi-platform content control room — live channels, production pipeline & analytics",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider>
          <WorkspaceProvider>
            <AppShell>{children}</AppShell>
          </WorkspaceProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
