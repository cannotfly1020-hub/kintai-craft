"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createStaffId,
  deleteStaffRecords,
  ensureStaffWorkspace,
  saveCurrentStaffId,
  saveStaffList,
  type StaffMember,
} from "@/lib/staff";

interface StaffContextValue {
  ready: boolean;
  staffList: StaffMember[];
  currentStaffId: string | null;
  currentStaff: StaffMember | null;
  selectStaff: (staffId: string) => void;
  addStaff: (input: Omit<StaffMember, "id">) => StaffMember;
  updateStaff: (staffId: string, patch: Partial<Omit<StaffMember, "id">>) => void;
  removeStaff: (staffId: string) => void;
}

const StaffContext = createContext<StaffContextValue | null>(null);

export function StaffProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [currentStaffId, setCurrentStaffId] = useState<string | null>(null);

  useEffect(() => {
    const workspace = ensureStaffWorkspace();
    // localStorage is only available after mount, and the first paint must match the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the staff list once
    setStaffList(workspace.staff);
    setCurrentStaffId(workspace.currentId);
    setReady(true);
  }, []);

  const selectStaff = useCallback((staffId: string) => {
    setCurrentStaffId(staffId);
    saveCurrentStaffId(staffId);
  }, []);

  const updateStaff = useCallback((staffId: string, patch: Partial<Omit<StaffMember, "id">>) => {
    setStaffList((current) => {
      const next = current.map((staff) => (staff.id === staffId ? { ...staff, ...patch } : staff));
      saveStaffList(next);
      return next;
    });
  }, []);

  const addStaff = useCallback((input: Omit<StaffMember, "id">) => {
      const staff: StaffMember = { ...input, id: createStaffId(staffList) };
      const next = [...staffList, staff];
      setStaffList(next);
      saveStaffList(next);
      setCurrentStaffId(staff.id);
      saveCurrentStaffId(staff.id);
      return staff;
    },
    [staffList],
  );

  const removeStaff = useCallback(
    (staffId: string) => {
      const next = staffList.filter((staff) => staff.id !== staffId);
      if (next.length === 0) return;
      deleteStaffRecords(staffId);
      setStaffList(next);
      saveStaffList(next);
      if (currentStaffId === staffId) {
        setCurrentStaffId(next[0].id);
        saveCurrentStaffId(next[0].id);
      }
    },
    [currentStaffId, staffList],
  );

  const currentStaff = staffList.find((staff) => staff.id === currentStaffId) ?? null;
  const value = useMemo(
    () => ({ ready, staffList, currentStaffId, currentStaff, selectStaff, addStaff, updateStaff, removeStaff }),
    [ready, staffList, currentStaffId, currentStaff, selectStaff, addStaff, updateStaff, removeStaff],
  );

  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff() {
  const value = useContext(StaffContext);
  if (!value) throw new Error("useStaff must be used within StaffProvider");
  return value;
}
