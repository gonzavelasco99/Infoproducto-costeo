import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Costeo claro | Beta",
  description: "Costeo organizacional trazable para PyMEs"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
