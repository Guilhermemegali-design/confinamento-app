import RegistroServiceWorker from "@/components/RegistroServiceWorker";
import "./globals.css";

export const metadata = {
  title: "Rastro Confinamento",
  description: "Cadastro de clientes e acompanhamento de lotes de confinamento",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/rastro-icon-192.png?v=3", sizes: "192x192", type: "image/png" },
      { url: "/rastro-icon-512.png?v=3", sizes: "512x512", type: "image/png" },
    ],
    apple: "/rastro-apple-touch-icon.png?v=3",
  },
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
        <link rel="apple-touch-icon" href="/rastro-apple-touch-icon.png?v=3" />
      </head>
      <body>
        <RegistroServiceWorker />
        {children}
      </body>
    </html>
  );
}
