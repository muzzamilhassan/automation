import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata = {
  title: "Quarry Studio — Command Center",
  description: "Multi-platform content empire control room",
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/channels", label: "Channels" },
  { href: "/logs", label: "Posting Logs" },
  { href: "/tasks", label: "Tasks" },
];

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex">
        <aside className="w-56 shrink-0 border-r border-zinc-900 bg-black min-h-screen p-4 hidden md:block">
          <div className="px-2 py-3 mb-4">
            <div className="text-white font-extrabold text-lg tracking-tight">Quarry Studio</div>
            <div className="text-zinc-500 text-xs">Command Center</div>
          </div>
          <nav className="space-y-1">
            {NAV.map(n => (
              <a key={n.href} href={n.href} className="block px-3 py-2 rounded-lg text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white transition">
                {n.label}
              </a>
            ))}
            <a href="https://muzzamilhassan.github.io/quarrystudio/dashboard.html" target="_blank" className="block px-3 py-2 rounded-lg text-sm text-zinc-500 hover:bg-zinc-900 transition mt-3">
              TikTok Dashboard ↗
            </a>
          </nav>
          <div className="absolute bottom-4 px-4 text-[11px] text-zinc-600">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5"></span>
            Machine connected
          </div>
        </aside>
        <div className="flex-1 min-h-screen">
          <div className="md:hidden bg-black border-b border-zinc-900 px-4 py-3 flex gap-4 text-sm overflow-x-auto">
            {NAV.map(n => <a key={n.href} href={n.href} className="text-zinc-300 whitespace-nowrap">{n.label}</a>)}
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
