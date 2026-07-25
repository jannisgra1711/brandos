import type { Metadata, Viewport } from "next";
import { BrandMark, Sidebar } from "@/components/layout/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "BrandOS – Research & Decision Intelligence",
    template: "%s · BrandOS",
  },
  description:
    "BrandOS erkennt profitable Produktchancen, versteht Märkte und liefert begründete Entscheidungen für E-Commerce.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfc" },
    { media: "(prefers-color-scheme: dark)", color: "#08080a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-dvh">
        <div className="flex min-h-dvh">
          {/*
            Feste Seitennavigation ab Desktop. Auf kleinen Viewports wandert
            sie in eine horizontale Leiste – das Produkt wird unterwegs
            gelesen, nicht bedient.
          */}
          <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-bg-subtle/50 px-3 py-5 lg:flex">
            <BrandMark />
            <div className="mt-6">
              <Sidebar />
            </div>
            <div className="mt-auto px-3 pt-6">
              <p className="text-xs leading-relaxed text-faint">
                BrandOS interpretiert Marktdaten. Jede Aussage ist auf ihre Quelle zurückführbar.
              </p>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-10 border-b border-border bg-bg/85 backdrop-blur lg:hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <BrandMark />
              </div>
              <div className="overflow-x-auto px-2 pb-2">
                <Sidebar className="flex-row gap-1" />
              </div>
            </header>

            <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8 lg:py-10">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
