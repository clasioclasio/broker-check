import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import MessagesPage from '@/pages/messages';
import { startTrafficTracking } from '@/lib/traffic-tracker';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import Analysis from '@/pages/analysis';
import Results from '@/pages/results';
import { ReportRequestProvider } from '@/components/report-request-provider';
import { ConsultationProvider } from '@/components/consultation';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();
const Admin = lazy(() => import('@/pages/Admin'));
function AdminRoute() {
  return <Suspense fallback={<p className="p-8 text-center">Загружаем панель…</p>}><Admin /></Suspense>;
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/analysis" component={Analysis} />
        <Route path="/results/:id" component={Results} />
        <Route path="/messages" component={MessagesPage} />
        <Route path="/admin" component={AdminRoute} />
        <Route path="/admin/" component={AdminRoute} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  useEffect(() => startTrafficTracking(), []);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <ConsultationProvider>
            <ReportRequestProvider><Router /></ReportRequestProvider>
          </ConsultationProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
