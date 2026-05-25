import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "ForgeCI — Distributed CI/CD Pipeline Engine",
  description:
    "Build, test, and deploy code inside isolated Docker containers. Orchestrated with Kafka, cached with Redis, powered by Spring Boot.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-black text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
