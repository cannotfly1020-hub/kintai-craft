import { AttendanceApp } from "@/components/attendance-app";
import { StaffProvider } from "@/components/staff-provider";

export default function Home() {
  return (
    <StaffProvider>
      <AttendanceApp />
    </StaffProvider>
  );
}
