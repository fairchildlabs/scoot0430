import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    data: user,
    error,
    isLoading,
    refetch,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      console.log("Fetching user authentication state...");
      try {
        const res = await fetch("/api/user", {
          credentials: "include",
        });
        
        if (res.status === 401) {
          console.log("User not authenticated (401 response)");
          return null;
        }
        
        if (!res.ok) {
          throw new Error(`Failed to fetch user: ${res.status} ${res.statusText}`);
        }
        
        const userData = await res.json();
        console.log("Authentication successful, user data:", userData);
        return userData;
      } catch (error) {
        console.error("Error fetching user authentication state:", error);
        throw error;
      }
    },
    retry: 1,
    refetchOnWindowFocus: true,
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60 * 2, // 2 minutes
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      console.log("Attempting login with credentials:", {...credentials, password: "*****"});
      try {
        // Use the fetch API directly to ensure proper cookie handling
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
          credentials: "include", // This is critical for cookie handling
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Login failed: ${res.status} ${errorText || res.statusText}`);
        }
        
        const userData = await res.json();
        console.log("Login successful, received user data:", userData);
        return userData;
      } catch (error) {
        console.error("Login fetch error:", error);
        throw error;
      }
    },
    onSuccess: (user: SelectUser) => {
      console.log("Setting user data in cache after successful login");
      queryClient.setQueryData(["/api/user"], user);
      
      // Force a refetch to ensure session is properly established
      setTimeout(() => {
        console.log("Forcing authentication state refresh after login");
        refetch();
      }, 300);
      
      toast({
        title: "Login successful",
        description: `Welcome back, ${user.username}!`,
        variant: "default",
      });
    },
    onError: (error: Error) => {
      console.error("Login error:", error);
      toast({
        title: "Login failed",
        description: error.message || "Please check your credentials and try again",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      console.log("Attempting registration with credentials:", {...credentials, password: "*****"});
      try {
        // Use the fetch API directly to ensure proper cookie handling
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
          credentials: "include", // This is critical for cookie handling
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Registration failed: ${res.status} ${errorText || res.statusText}`);
        }
        
        const userData = await res.json();
        console.log("Registration successful, received user data:", userData);
        return userData;
      } catch (error) {
        console.error("Registration fetch error:", error);
        throw error;
      }
    },
    onSuccess: (user: SelectUser) => {
      console.log("Registration successful, user data:", user);
      // Set user data in cache after registration since we're automatically logging them in
      queryClient.setQueryData(["/api/user"], user);
      
      // Force a refetch to ensure session is properly established
      setTimeout(() => {
        console.log("Forcing authentication state refresh after registration");
        refetch();
      }, 300);
      
      toast({
        title: "Registration successful",
        description: "Welcome! Your account has been created.",
        variant: "default",
      });
    },
    onError: (error: Error) => {
      console.error("Registration error:", error);
      toast({
        title: "Registration failed",
        description: error.message || "Please try a different username",
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      console.log("Attempting to log out user");
      try {
        // Use fetch directly with credentials
        const res = await fetch("/api/logout", {
          method: "POST",
          credentials: "include",
        });
        
        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Logout failed: ${res.status} ${errorText || res.statusText}`);
        }
        
        console.log("Logout API call successful");
      } catch (error) {
        console.error("Logout fetch error:", error);
        throw error;
      }
    },
    onSuccess: () => {
      console.log("Logout successful, clearing user cache");
      // Immediately clear the user data
      queryClient.setQueryData(["/api/user"], null);
      
      // Clear all cached queries to ensure clean slate
      queryClient.removeQueries();
      
      // Force a refetch after a short delay to verify logged out state
      setTimeout(() => {
        console.log("Forcing authentication check after logout");
        refetch();
      }, 300);
      
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
        variant: "default",
      });
    },
    onError: (error: Error) => {
      console.error("Logout error:", error);
      toast({
        title: "Logout failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
      
      // Try to refresh auth state even after error
      setTimeout(() => refetch(), 500);
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}