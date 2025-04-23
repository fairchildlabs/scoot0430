import { createContext, ReactNode, useContext, useState } from "react";

type VersionContextType = {
  version: string;
  setVersion: (version: string) => void;
};

export const VersionContext = createContext<VersionContextType | null>(null);

export function VersionProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState("Scoot(34)");

  return (
    <VersionContext.Provider
      value={{
        version,
        setVersion,
      }}
    >
      {children}
    </VersionContext.Provider>
  );
}

export function useVersion() {
  const context = useContext(VersionContext);
  if (!context) {
    throw new Error("useVersion must be used within a VersionProvider");
  }
  return context;
}