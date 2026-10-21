"use client";

import { accessLabel, USER_ROLE_LABEL } from "@/lib/access";
import { useAuth } from "@/components/auth-provider";
import { useStaff } from "@/components/staff-provider";

const DEMO_IDS = ["demo_yamada", "demo_sato", "demo_suzuki"] as const;

export function DemoUserBar() {
  const { staffList } = useStaff();
  const { currentUser, setCurrentUserId } = useAuth();
  const demos = DEMO_IDS.map((id) => staffList.find((staff) => staff.id === id)).filter(Boolean);

  if (demos.length === 0) return null;

  return (
    <div className="border-b border-amber-200/80 bg-amber-50/90">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-amber-950/80">
          <span className="font-semibold">デモ切替</span>
          {currentUser ? (
            <>
              {" "}
              — 現在は <span className="font-medium text-amber-950">{accessLabel(currentUser)}</span> として操作中
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {demos.map((user) => {
            if (!user) return null;
            const active = currentUser?.id === user.id;
            return (
              <button
                key={user.id}
                type="button"
                onClick={() => setCurrentUserId(user.id)}
                className={
                  active
                    ? "rounded-full border border-amber-500 bg-amber-500 px-3 py-1 text-xs font-semibold text-white"
                    : "rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-950 hover:bg-amber-100"
                }
              >
                {user.name}（{USER_ROLE_LABEL[user.role]}）
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
