import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verso — PDF reading companion",
  description: "Read, mark, and understand any PDF with multi-provider AI"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
