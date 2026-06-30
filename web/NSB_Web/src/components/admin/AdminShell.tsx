"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LeonIcon, type LeonIconName } from "@/components/admin/leon/LeonIcon";
import { useIdleLogout } from "@/lib/use-idle-logout";

const NSB_LOGO_SRC = "/assets/images/nsb-logo.png";

const navItems: { href: string; label: string; icon: LeonIconName }[] = [
  { href: "/admin", label: "Home", icon: "home" },
  { href: "/admin/invoices", label: "Invoices", icon: "receipt" },
  { href: "/admin/mv-database", label: "MV Database", icon: "database" },
];

type SessionUser = {
  username: string;
  displayName: string | null;
  role: string;
};

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  const isLoginPage = pathname === "/admin/login" || pathname === "/admin/reset-password";

  useEffect(() => {
    if (isLoginPage) return;
    fetch("/api/auth/login")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser({
            username: data.user.username,
            displayName: data.user.displayName,
            role: data.user.role ?? 'user',
          });
        }
      })
      .catch(() => {});
  }, [isLoginPage]);

  const toggleSidebar = () => setSidebarOpen((open) => !open);
  const closeSidebar = () => setSidebarOpen(false);

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }, [router]);

  useIdleLogout(handleLogout, !isLoginPage);

  if (isLoginPage) {
    return <>{children}</>;
  }

  const displayLabel = user?.displayName || user?.username || "User";

  return (
    <div className="admin-layout">
      <aside className={`admin-sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="admin-sidebar__brand">
          <Link href="/admin" onClick={closeSidebar} className="d-flex align-items-center gap-2">
            <Image
              src={NSB_LOGO_SRC}
              alt="NSB Motors Ug"
              width={32}
              height={32}
              style={{ objectFit: "contain" }}
              priority
            />
            <span>NSB Motors Ug</span>
          </Link>
        </div>
        <nav className="admin-sidebar__nav">
          {navItems.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-sidebar__link${active ? " active" : ""}`}
                onClick={closeSidebar}
              >
                <LeonIcon name={item.icon} size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="admin-sidebar__footer d-flex flex-column gap-2">
          <div className="small text-muted px-2 text-truncate" title={displayLabel}>
            {displayLabel}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="btn btn-link btn-sm text-decoration-none text-muted p-0 d-flex align-items-center gap-2"
          >
            <LeonIcon name="arrow-left" size={16} />
            Sign out
          </button>
        </div>
      </aside>

      <div
        className={`admin-main__backdrop${sidebarOpen ? " show" : ""}`}
        onClick={closeSidebar}
      />

      <main className="admin-main">
        <div className="d-flex d-lg-none align-items-center justify-content-between mb-3">
          <button
            type="button"
            className="btn btn-outline-dark btn-sm rounded-pill d-inline-flex align-items-center gap-2 font-mono text-[11px] uppercase tracking-wider"
            onClick={toggleSidebar}
          >
            <LeonIcon name="menu" size={15} />
            <span>Menu</span>
          </button>
          <div className="d-flex align-items-center gap-2">
            <Image
              src={NSB_LOGO_SRC}
              alt="NSB Motors Ug"
              width={24}
              height={24}
              style={{ objectFit: "contain" }}
            />
            <span className="fw-semibold small text-muted leon-section-label mb-0">NSB Motors Ug</span>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
