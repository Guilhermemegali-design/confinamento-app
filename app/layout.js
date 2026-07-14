import RegistroServiceWorker from "@/components/RegistroServiceWorker";
import "./globals.css";

export const metadata = {
  title: "Confinamento - Painel do Consultor",
  description: "Cadastro de clientes e acompanhamento de lotes de confinamento",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#1F4D45",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icon.jpg" />
      </head>
      <body>
        <RegistroServiceWorker />
        {children}
      </body>
    </html>
  );
}
