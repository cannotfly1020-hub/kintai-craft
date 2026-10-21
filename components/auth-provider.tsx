"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { visibleStaffFor } from "@/lib/access";
import { saveCurrentUserId, type StaffMember } from "@/lib/staff";
import { useStaff } from "@/components/staff-provider";

interface AuthContextValue {
  currentUser: StaffMember | null;
  visibleStaff: StaffMember[];
  setCurrentUserId: (userId: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { staffList, currentUserId, setCurrentUserId: setUserId, selectStaff, currentStaff } = useStaff();

  const currentUser = staffList.find((staff) => staff.id === currentUserId) ?? null;

  const visibleStaff = useMemo(() => {
    if (!currentUser) return [];
    return visibleStaffFor(currentUser, staffList);
  }, [currentUser, staffList]);

  const setCurrentUserId = useCallback(
    (userId: string) => {
      const user = staffList.find((staff) => staff.id === userId);
      if (!user) return;
      setUserId(userId);
      saveCurrentUserId(userId);
      const allowed = visibleStaffFor(user, staffList);
      const stillVisible = currentStaff && allowed.some((staff) => staff.id === currentStaff.id);
      if (!stillVisible) {
        selectStaff(allowed[0]?.id ?? user.id);
      }
    },
    [staffList, setUserId, selectStaff, currentStaff],
  );

  const value = useMemo(
    () => ({ currentUser, visibleStaff, setCurrentUserId }),
    [currentUser, visibleStaff, setCurrentUserId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
