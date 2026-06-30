import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "NyaTube",
  description: "Личный локальный видеохостинг с персональными рекомендациями",
  icons: { icon: "/play-icon.svg" },
};

// Ставим тему до отрисовки контента, чтобы не было «вспышки».
const themeScript = `try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.add('light');}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
