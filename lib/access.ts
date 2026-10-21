import type { Department, StaffRole, UserRole } from "@/types/kintai";
import { ROLE_LABEL } from "@/lib/schedule";

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  staff: "一般職員",
  manager: "科の管理者",
  admin: "事務 / 総務",
};

export const DEPARTMENT_LABEL: Record<Department, string> = {
  rehabilitation: "リハビリ科",
  nursing: "看護部",
  radiology: "放射線科",
  office: "医事・総務",
  other: "その他",
};

export const USER_ROLES: UserRole[] = ["staff", "manager", "admin"];
export const DEPARTMENTS: Department[] = ["rehabilitation", "nursing", "radiology", "office", "other"];

type AccessIdentity = {
  id: string;
  name: string;
  role: UserRole;
  department: Department;
  jobRole: StaffRole;
  jobTitle?: string;
};

export function isUserRole(value: unknown): value is UserRole {
  return value === "staff" || value === "manager" || value === "admin";
}

export function isDepartment(value: unknown): value is Department {
  return value === "rehabilitation" || value === "nursing" || value === "radiology" || value === "office" || value === "other";
}

export function defaultDepartmentForJobRole(jobRole: StaffRole): Department {
  if (jobRole === "nurse") return "nursing";
  if (jobRole === "radiologist") return "radiology";
  if (jobRole === "clerk") return "office";
  if (jobRole === "pt_outpatient" || jobRole === "pt_inpatient" || jobRole === "rehab_assistant") return "rehabilitation";
  return "other";
}

export function staffJobLabel(staff: Pick<AccessIdentity, "jobRole" | "jobTitle">): string {
  return staff.jobTitle?.trim() || ROLE_LABEL[staff.jobRole];
}

export function accessLabel(user: Pick<AccessIdentity, "name" | "role" | "department">): string {
  const name = user.name.trim() || "氏名未設定";
  return `${name}（${USER_ROLE_LABEL[user.role]} / ${DEPARTMENT_LABEL[user.department]}）`;
}

/** ログイン中ユーザーが閲覧・編集できる職員一覧 */
export function visibleStaffFor<T extends Pick<AccessIdentity, "id" | "role" | "department">>(user: T, staffList: T[]): T[] {
  if (user.role === "admin") return staffList;
  if (user.role === "manager") return staffList.filter((staff) => staff.department === user.department);
  return staffList.filter((staff) => staff.id === user.id);
}

export function canSwitchStaff(user: Pick<AccessIdentity, "role">): boolean {
  return user.role === "manager" || user.role === "admin";
}

export function canManageStaffDirectory(user: Pick<AccessIdentity, "role">): boolean {
  return user.role === "admin";
}

export function canEditStaffProfile(user: Pick<AccessIdentity, "role">): boolean {
  return user.role === "admin";
}
