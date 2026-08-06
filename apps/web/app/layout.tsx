import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Costeo claro | Asistente gratuito",
  description: "Costeo organizacional configurable y trazable para PyMEs"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
