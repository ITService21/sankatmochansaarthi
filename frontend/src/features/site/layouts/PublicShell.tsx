import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { DevotionalBanner } from "../../learner/components/DevotionalBanner";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

/** Public pages (landing, test series): devotional banner (scrolls away) + sticky reference-style header + footer. Scrolls to #hash targets (e.g. #callback). */
export function PublicShell() {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (hash) setTimeout(() => document.querySelector(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    else window.scrollTo({ top: 0 });
  }, [hash, pathname]);
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <DevotionalBanner />
      <SiteHeader />
      <main className="flex-1"><Outlet /></main>
      <SiteFooter />
    </div>
  );
}
