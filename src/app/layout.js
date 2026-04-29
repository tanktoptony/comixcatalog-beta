import "./globals.css";
import Header from "../components/Header";
import Footer from "../components/Footer";
import PatreonBanner from "../components/PatreonBanner";
import { LibraryProvider } from "../context/LibraryContext";
import { AuthProvider } from "../context/AuthContext";

export const metadata = {
  title: "ComixCatalog",
  description: "Catalog. Collect. Connect.",
  icons: {
    icon: [
      { url: "/favicon/favicon.ico" },
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [
      { url: "/favicon/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/favicon/site.webmanifest",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="page-shell">
        <AuthProvider>
          <LibraryProvider>
            <PatreonBanner />
            <Header />
            <main className="page-wrapper">{children}</main>
            <Footer />
          </LibraryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}