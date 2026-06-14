import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Docent PDF Workspace",
  description: "PDF area selection and multi-provider AI analysis workspace"
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
