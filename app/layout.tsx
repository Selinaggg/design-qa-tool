import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Design QA Tool",
  description: "设计走查效率工具 — 对比设计稿与线上页面",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="antialiased">
      <body className="min-h-screen bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
