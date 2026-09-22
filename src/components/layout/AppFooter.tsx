export function AppFooter() {
  return (
    <footer className="hidden md:block border-t border-border bg-card mt-12">
      <div className="mx-auto max-w-7xl px-6 py-6 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-3">
        <p>© 2026 Vymanik Aerospace Technologies Pvt. Ltd. · IEC 62446-3 Certified Inspections</p>
        <div className="flex items-center gap-4">
          <p>support@vymanikaero.com · +91 8182830960</p>
          <a href="https://vymanikaero.in/" target="_blank" rel="noopener noreferrer" className="opacity-70 hover:opacity-100 transition-opacity" title="Visit Vymanik Aerospace">
            <img src="/vymanik-logo.webp" alt="Vymanik Aerospace" className="h-6 w-auto object-contain" />
          </a>
        </div>
      </div>
    </footer>
  );
}
