import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verso — Document analysis workspace",
  description: "Analyze PDFs and turn images into reviewed Word documents with multi-provider AI"
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
