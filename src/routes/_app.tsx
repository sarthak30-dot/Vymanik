import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { AppFooter } from "@/components/layout/AppFooter";
import { I18nProvider } from "@/lib/i18n";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <I18nProvider>
      <div className="min-h-screen bg-grey-50 flex flex-col">
        <AppHeader />
        <main className="flex-1 pb-20 md:pb-0">
          <Outlet />
        </main>
        <AppFooter />
        <MobileBottomNav />
        <Toaster richColors position="bottom-right" />
      </div>
    </I18nProvider>
  );
}
