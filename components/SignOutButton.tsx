import { signOut } from "@/auth";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button
        type="submit"
        className="rounded-md border border-[#E2E8F0] px-3 py-1.5 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
      >
        Se déconnecter
      </button>
    </form>
  );
}
