import crypto from "node:crypto";

export const SESSION_COOKIE_NAME = "superkagi_session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Hash a password with a random salt using SHA-256
 * Returns format: salt$hash
 */
export function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto
        .createHash("sha256")
        .update(salt + password)
        .digest("hex");
    return `${salt}$${hash}`;
}

/**
 * Verify a password against a stored hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
    const [salt, hash] = storedHash.split("$");
    if (!salt || !hash) return false;
    const testHash = crypto
        .createHash("sha256")
        .update(salt + password)
        .digest("hex");
    return hash === testHash;
}

/**
 * Generate a secure random session token
 */
export function generateSessionToken(): string {
    return crypto.randomBytes(32).toString("hex");
}

/**
 * Generate a unique user ID
 */
export function generateUserId(): string {
    return crypto.randomBytes(16).toString("hex");
}
