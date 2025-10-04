import "./globals.css";

export const metadata = { title: "GitZipQR", description: "Secure share and vault your data" };

function Social({ href, label, svg }: { href: string; label: string; svg: string }) {
  return (
    <a className="link-pill" href={href} target="_blank" rel="noreferrer" title={label}
       style={{ textDecoration: "none", color: "inherit" }}>
      <span dangerouslySetInnerHTML={{ __html: svg }} />
      <span>{label}</span>
    </a>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /></head>
      <body style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        <div className="container">
          <header style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img src="/logo.jpg" alt="Logo" style={{ height: 52, width: 52, objectFit: "contain", borderRadius: 12, boxShadow: "0 8px 24px rgba(255,140,60,.25)" }} />
              <div>
                <h1 style={{ margin: 0, fontSize: 22 }}><span className="brand-grad">GitZipQR</span></h1>
                <div style={{ fontSize: 12, opacity: .9 }}>Secure share and vault your data</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Social href="https://t.me/GitZipQR" label="Telegram"
                svg='<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9.2 15.3l-.4 5 4.9-3.3 4.9 3.3 1.9-16.4-15.9 6 4.7 1.4L18 7.1 9.2 15.3z" stroke="currentColor" stroke-width="1.4"/></svg>' />
              <Social href="https://vk.com/GitZipQR" label="VK"
                svg='<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M2 7h4l3 6 3-6h4l-2 3 3 5h-4l-2-3-2 3H6l3-5-2-3H2z" stroke="currentColor" stroke-width="1.4"/></svg>' />
              <Social href="https://github.com/GitZipQR" label="GitHub"
                svg='<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.3 3.3 0 00-.9-2.6c3-.3 6.2-1.5 6.2-6.8a5.3 5.3 0 00-1.5-3.7 4.9 4.9 0 00-.1-3.7S18.7 0.5 15 2.6a13.6 13.6 0 00-6 0C5.3 0.5 3.3 1.3 3.3 1.3a4.9 4.9 0 00-.1 3.7 5.3 5.3 0 00-1.5 3.7c0 5.3 3.2 6.5 6.2 6.8A3.3 3.3 0 007 19.1V23" stroke="currentColor" stroke-width="1.4"/></svg>' />
              <Social href="https://GitZipQR.github.io" label="Website"
                svg='<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 0c3 2.5 3 17.5 0 20M2 12h20" stroke="currentColor" stroke-width="1.4"/></svg>' />
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
