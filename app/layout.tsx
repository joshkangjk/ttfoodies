import type { Metadata } from "next";

// If you have a global CSS file for Tailwind, import it here:
// import "./globals.css"; 

export const metadata: Metadata = {
  title: "TikTok Food Discovery",
  description: "Find the nearest MRT for trending TikTok food spots.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}