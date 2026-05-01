import type { Metadata, Viewport } from "next";

// If you have a global CSS file for Tailwind, import it here:
import "./globals.css"; 

export const viewport: Viewport = {
  themeColor: "#C8471A", // chili-accent
};

export const metadata: Metadata = {
  title: "TTFoodie",
  description: "Find the nearest MRT for trending TikTok food spots.",
  appleWebApp: {
    capable: true,
    title: "TTFoodie",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  }
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