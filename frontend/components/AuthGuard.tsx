"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { isAuthenticated, getUserSession } from "@/utils/auth";
import HipaaConsentModal from "./HipaaConsentModal";

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  
  const [checking, setChecking] = useState(true);
  const [hasConsent, setHasConsent] = useState(false);

  // Define public pages that don't need auth checks
  const publicPaths = ["/", "/login"];

  useEffect(() => {
    const checkAuth = () => {
      const isPublic = publicPaths.includes(pathname);
      if (isPublic) {
        setChecking(false);
        return;
      }

      if (!isAuthenticated()) {
        router.push("/login");
        return;
      }

      const session = getUserSession();
      if (!session) {
        router.push("/login");
        return;
      }

      setHasConsent(session.consentGiven);
      setChecking(false);
    };

    checkAuth();
  }, [pathname, router]);

  const handleConsentGranted = () => {
    setHasConsent(true);
  };

  if (publicPaths.includes(pathname)) {
    return <>{children}</>;
  }

  if (checking) {
    return (
      <div
        style={{
          background: "#020617",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 16,
          fontFamily: "var(--font-inter), sans-serif",
          color: "#94A3B8"
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "3px solid rgba(37, 99, 235, 0.15)",
            borderTopColor: "#3B82F6",
            animation: "spin 1s linear infinite"
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 500 }}>Decrypting security profile...</span>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!hasConsent) {
    return <HipaaConsentModal onConsentGranted={handleConsentGranted} />;
  }

  return <>{children}</>;
}
