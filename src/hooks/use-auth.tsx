import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  // TEMPORARY DEBUG ([auth-dbg]): remove once the gate remount cause is known.
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  useEffect(() => {
    console.log("[auth-dbg] AuthProvider mounted", document.visibilityState);
    const onVisibility = () => console.log("[auth-dbg] visibilitychange ->", document.visibilityState);
    document.addEventListener("visibilitychange", onVisibility);
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      console.log("[auth-dbg] onAuthStateChange", event, {
        userId: s?.user?.id ?? null,
        loading: loadingRef.current,
        visibility: document.visibilityState,
      });
      if (event === "PASSWORD_RECOVERY") setIsPasswordRecovery(true);
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      console.log("[auth-dbg] getSession resolved", {
        userId: data.session?.user?.id ?? null,
        loading: loadingRef.current,
        visibility: document.visibilityState,
      });
      setSession(data.session);
      setLoading(false);
    });
    return () => {
      console.log("[auth-dbg] AuthProvider unmounted");
      document.removeEventListener("visibilitychange", onVisibility);
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthCtx = {
    user: session?.user ?? null,
    session,
    loading,
    isPasswordRecovery,
    clearPasswordRecovery: () => setIsPasswordRecovery(false),
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}