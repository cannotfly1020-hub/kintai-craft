import { AttendanceApp } from "@/components/attendance-app";
import { AuthProvider } from "@/components/auth-provider";
import { DemoUserBar } from "@/components/demo-user-bar";
import { StaffProvider } from "@/components/staff-provider";

export default function Home() {
  return (
    <StaffProvider>
      <AuthProvider>
        <DemoUserBar />
        <AttendanceApp />
      </AuthProvider>
    </StaffProvider>
  );
}
