/**
 * auth.ts — Client-side authentication and session state utilities.
 * Handles JWT storage, authorization headers, electronic consent status, and logout flows.
 */

export interface UserSession {
  userId: number;
  email: string;
  role: "patient" | "doctor" | "admin";
  consentGiven: boolean;
  consentTimestamp: string | null;
  isGuest: boolean;
  expiresAt: string | null;
}

const ACCESS_TOKEN_KEY = "mediscan_access_token";
const USER_SESSION_KEY = "mediscan_user_session";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function getUserSession(): UserSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserSession;
  } catch {
    return null;
  }
}

export function setUserSession(session: UserSession) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_SESSION_KEY, JSON.stringify(session));
}

export function setConsentStatus(consentGiven: boolean) {
  if (typeof window === "undefined") return;
  const session = getUserSession();
  if (session) {
    session.consentGiven = consentGiven;
    if (consentGiven) {
      session.consentTimestamp = new Date().toISOString();
    }
    setUserSession(session);
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(USER_SESSION_KEY);
  // Clear refresh cookie by hitting refresh-delete or letting it expire
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {})
  };
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}
