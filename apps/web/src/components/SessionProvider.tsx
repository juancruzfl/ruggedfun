"use client";

import type { Me } from "@ruggedfun/shared";
import { createContext, useContext, useState, type ReactNode } from "react";

interface SessionContextValue {
  me: Me | null;
  setMe: (me: Me | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Holds the signed-in user and wallet. Seeded from the server render so there's no loading flash. */
export function SessionProvider({ initialMe, children }: { initialMe: Me | null; children: ReactNode }) {
  const [me, setMe] = useState(initialMe);
  return <SessionContext.Provider value={{ me, setMe }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}
