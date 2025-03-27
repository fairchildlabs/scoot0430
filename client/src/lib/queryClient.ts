import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

/**
 * Makes a request to the scootd API wrapper
 * 
 * @param method The HTTP method (GET, POST, etc.)
 * @param endpoint The scootd endpoint (e.g., "game-set-status", "checkin", etc.)
 * @param data The request data (for POST requests)
 * @returns The parsed JSON response
 */
export async function scootdApiRequest<T>(
  method: string,
  endpoint: string,
  data?: unknown | undefined,
): Promise<T> {
  const url = `/api/scootd/${endpoint}`;
  console.log(`🚀 SCOOTD API CALL: ${method} ${endpoint}`, data || '(no data)');
  
  const res = await apiRequest(method, url, data);
  const responseData = await res.json();
  
  console.log(`📥 SCOOTD API RESPONSE: ${endpoint}`, responseData);
  return responseData;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true, 
      staleTime: 0, 
      gcTime: 0, // Changed from cacheTime to gcTime (TanStack Query v5 upgrade)
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});