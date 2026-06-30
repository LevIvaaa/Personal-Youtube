import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Personal YouTube",
  description: "Личный локальный видеохостинг с персональными рекомендациями",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%23ff0000'/><polygon points='40,30 40,70 72,50' fill='white'/></svg>",
  },
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
