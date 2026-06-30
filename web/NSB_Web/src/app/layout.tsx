import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'NSB Motors Ug',
    template: '%s | NSB Motors Ug',
  },
  description:
    'NSB Motors Ug — vehicle importation, sales, and invoicing in Uganda.',
  keywords:
    'NSB Motors Ug, car dealership Uganda, buy car Uganda, used cars Kampala, car import Uganda',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light-theme">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="description"
          content="NSB Motors Ug — vehicle importation, sales, and invoicing in Uganda."
        />
        <meta
          name="keywords"
          content="NSB Motors Ug, car dealership Uganda, buy car Uganda, used cars Kampala, car import Uganda, vehicle financing Uganda, Japanese cars Uganda"
        />
        <meta name="author" content="NSB Motors Ug" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Sets data-home-hero before paint so mobile vs desktop hero blocks ignore stale CSS order / CDN cache */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){function s(){try{document.documentElement.setAttribute('data-home-hero',window.matchMedia('(max-width: 1023px)').matches?'narrow':'wide')}catch(e){}}s();var m=window.matchMedia('(max-width: 1023px)');if(m.addEventListener)m.addEventListener('change',s);else if(m.addListener)m.addListener(s)})();`,
          }}
        />
        <meta name="currency" content="USD" />
        <link rel="icon" href="/assets/images/favicon-32x32.png" type="image/png" />

        <link href="/assets/css/bootstrap.min.css" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Raleway:wght@500;600&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.7.2/font/bootstrap-icons.css" />

        <link rel="stylesheet" type="text/css" href="/assets/plugins/slick/slick.css" />
        <link rel="stylesheet" type="text/css" href="/assets/plugins/slick/slick-theme.css" />

        <link href="/assets/css/style.css" rel="stylesheet" />
        <link href="/assets/css/dark-theme.css" rel="stylesheet" />
        <link href="/assets/css/jumia-ui.css" rel="stylesheet" />
        <link href="/assets/css/sbi-motor.css" rel="stylesheet" />
        <link href="/assets/css/hero-enhancements.css" rel="stylesheet" />
        {/* Must load after theme CSS so home mobile/desktop split is not overridden */}
        <link
          href="/assets/css/home-mobile-layout.css?v=3"
          rel="stylesheet"
        />
        {/* Leonxlnx slate palette — must load last to override Bootstrap blue */}
        <link href="/assets/css/leon-overrides.css?v=1" rel="stylesheet" />
      </head>
      <body className="jumia-ui">
        {/* Load before other afterInteractive scripts so `shop-grid.js` / `index.js` always see jQuery. */}
        <Script src="/assets/js/jquery.min.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
