import "./globals.css";

export const metadata = {
  title: "Consent Phone Tracker",
  description: "Permission-based live phone location sharing."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
