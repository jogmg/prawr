import type { Metadata } from "next";
import { Header } from "./components/header";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Prawr",
  description: "Decentralized micropayment streaming on Arc",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
