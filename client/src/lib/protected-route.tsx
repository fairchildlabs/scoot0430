import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route, useLocation } from "wouter";
import { useEffect } from "react";

type ComponentProps = {
  [key: string]: any;
};

type ProtectedRouteProps = {
  path: string;
  component: React.ComponentType<any>;
} & ComponentProps;

export function ProtectedRoute({
  path,
  component: Component,
  ...props
}: ProtectedRouteProps) {
  const { user, isLoading, error } = useAuth();
  const [location] = useLocation();
  
  useEffect(() => {
    console.log(`ProtectedRoute (${path}) - Auth state:`, { 
      isLoading, 
      isAuthenticated: !!user,
      user: user ? { id: user.id, username: user.username } : null,
      currentLocation: location,
      error: error ? error.message : null
    });
  }, [user, isLoading, error, path, location]);

  return (
    <Route path={path}>
      {(params) => {
        if (isLoading) {
          console.log(`ProtectedRoute (${path}) - Loading authentication state...`);
          return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading your profile...</p>
            </div>
          );
        }

        if (!user) {
          console.log(`ProtectedRoute (${path}) - User not authenticated, redirecting to /auth`);
          return <Redirect to="/auth" />;
        }

        console.log(`ProtectedRoute (${path}) - User authenticated, rendering component`);
        return <Component {...props} {...params} />;
      }}
    </Route>
  );
}
