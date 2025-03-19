import { createContext, useContext, useState, ReactNode } from "react";

type DatabaseRefreshContextType = {
  refreshCounter: number;
  triggerRefresh: () => void;
};

const DatabaseRefreshContext = createContext<DatabaseRefreshContextType | null>(null);

export function DatabaseRefreshProvider({ children }: { children: ReactNode }) {
  const [refreshCounter, setRefreshCounter] = useState(0);

  const triggerRefresh = () => {
    setRefreshCounter(prev => prev + 1);
  };

  return (
    <DatabaseRefreshContext.Provider value={{ refreshCounter, triggerRefresh }}>
      {children}
    </DatabaseRefreshContext.Provider>
  );
}

export function useDatabaseRefresh() {
  const context = useContext(DatabaseRefreshContext);
  if (!context) {
    throw new Error("useDatabaseRefresh must be used within a DatabaseRefreshProvider");
  }
  return context;
}
