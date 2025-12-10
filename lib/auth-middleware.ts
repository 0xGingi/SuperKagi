import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "./auth";
import { getSession, type StoredUser } from "./persistence";

export type AuthUser = Omit<StoredUser, "passwordHash">;

/**
 * Get the current authenticated user from request cookies
 * Returns null if not authenticated or session expired
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
    try {
        const cookieStore = await cookies();
        const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
        if (!sessionToken) return null;

        const user = getSession(sessionToken);
        if (!user) return null;

        // Don't expose password hash
        const { passwordHash: _, ...safeUser } = user;
        return safeUser;
    } catch {
        return null;
    }
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth(): Promise<AuthUser> {
    const user = await getCurrentUser();
    if (!user) {
        throw new Error("Authentication required");
    }
    return user;
}

/**
 * Require admin privileges - throws if not admin
 */
export async function requireAdmin(): Promise<AuthUser> {
    const user = await requireAuth();
    if (!user.isAdmin) {
        throw new Error("Admin privileges required");
    }
    return user;
}
