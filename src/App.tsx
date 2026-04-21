import { Toaster } from "sonner";
import { SessionLoginGate } from "@/components/auth/session-login-gate";
import { SchemaWorkbench } from "@/components/dashboard/schema-workbench";
import { ThemeProvider } from "@/components/providers/theme-provider";

export function App() {
  return (
    <ThemeProvider>
      <SchemaWorkbench />
      <SessionLoginGate />
      <Toaster richColors theme="dark" position="bottom-right" />
    </ThemeProvider>
  );
}
