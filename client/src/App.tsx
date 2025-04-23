import React, { Suspense } from "react";
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
import { VersionProvider, useVersion } from "./hooks/use-version";
import { ProtectedRoute } from "./lib/protected-route";

{/* Router function has been removed and replaced with direct use of VersionAwareRoutes */}

function VersionAwareRoutes() {
  const { version } = useVersion();
  
  if (version === "Scoot(1995)") {
    const Home1995 = React.lazy(() => import("@/pages/home-1995"));
    
    return (
      <Switch>
        <ProtectedRoute 
          path="/" 
          component={() => (
            <Suspense fallback={<div className="min-h-screen bg-black"></div>}>
              <Home1995 />
            </Suspense>
          )} 
        />
        <Route path="/auth" component={AuthPage} />
        <Route component={NotFound} />
      </Switch>
    );
  }
  
  // Regular Scoot(34) routes
  return (
    <Switch>
      <ProtectedRoute path="/" component={HomePage} />
      <ProtectedRoute path="/users" component={UserManagementPage} />
      <ProtectedRoute path="/games" component={GamesPage} />
      <ProtectedRoute path="/game-set/:id" component={HomePage} />
      <ProtectedRoute path="/home/:id" component={HomePage} />
      <Route path="/auth" component={AuthPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DatabaseRefreshProvider>
        <VersionProvider>
          <AuthProvider>
            <VersionAwareRoutes />
            <Toaster />
          </AuthProvider>
        </VersionProvider>
      </DatabaseRefreshProvider>
    </QueryClientProvider>
  );
}

export default App;