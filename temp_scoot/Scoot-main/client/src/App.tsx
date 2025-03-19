import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import UserManagementPage from "@/pages/user-management";
import GamesPage from "@/pages/games-page";
import { AuthProvider } from "./hooks/use-auth";
import { DatabaseRefreshProvider } from "./hooks/use-database-refresh";
import { ProtectedRoute } from "./lib/protected-route";

function Router() {
  return (
    <Switch>
      <ProtectedRoute path="/" component={HomePage} />
      <ProtectedRoute path="/users" component={UserManagementPage} />
      <ProtectedRoute path="/games" component={GamesPage} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DatabaseRefreshProvider>
        <AuthProvider>
          <Router />
          <Toaster />
        </AuthProvider>
      </DatabaseRefreshProvider>
    </QueryClientProvider>
  );
}

export default App;