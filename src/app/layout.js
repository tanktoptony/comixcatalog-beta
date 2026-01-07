import "./globals.css";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { LibraryProvider } from "../context/LibraryContext";
import { AuthProvider } from "../context/AuthContext";

export const metadata = {
  title: "ComixCatalog",
  description: "ComixCatalog marketplace frontend",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="page-shell">
        <AuthProvider>
          <LibraryProvider>
            <Header />
            <main className="page-wrapper">{children}</main>
            <Footer />
          </LibraryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
