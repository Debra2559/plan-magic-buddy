import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { FocusTimerProvider } from "@/lib/focus-sessions";
import { FocusTimerOverlay } from "@/components/FocusTimer";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login", search: { redirect: location.href } as any });
    }
  },
  component: () => (
    <FocusTimerProvider>
      <Outlet />
      <FocusTimerOverlay />
    </FocusTimerProvider>
  ),
});
