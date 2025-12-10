"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/store/auth-store";

type User = {
    id: string;
    username: string;
    isAdmin: boolean;
    createdAt: number;
};

export function AdminPanel() {
    const { user } = useAuthStore();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // New user form
    const [newUsername, setNewUsername] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newIsAdmin, setNewIsAdmin] = useState(false);
    const [creating, setCreating] = useState(false);

    // Change password form
    const [changingPasswordFor, setChangingPasswordFor] = useState<string | null>(null);
    const [newUserPassword, setNewUserPassword] = useState("");

    const fetchUsers = async () => {
        try {
            const res = await fetch("/api/admin/users");
            if (!res.ok) throw new Error("Failed to load users");
            const data = await res.json();
            setUsers(data.users || []);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUsername.trim() || !newPassword) {
            setError("Username and password are required");
            return;
        }

        setCreating(true);
        setError("");
        setSuccess("");

        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: newUsername.trim(),
                    password: newPassword,
                    isAdmin: newIsAdmin,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create user");

            setSuccess(`User "${newUsername}" created successfully`);
            setNewUsername("");
            setNewPassword("");
            setNewIsAdmin(false);
            fetchUsers();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteUser = async (userId: string, username: string) => {
        if (!confirm(`Are you sure you want to delete user "${username}"? All their data will be permanently deleted.`)) {
            return;
        }

        setError("");
        setSuccess("");

        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: "DELETE",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to delete user");

            setSuccess(`User "${username}" deleted`);
            fetchUsers();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const handleChangePassword = async (userId: string) => {
        if (!newUserPassword || newUserPassword.length < 4) {
            setError("Password must be at least 4 characters");
            return;
        }

        setError("");
        setSuccess("");

        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: newUserPassword }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to change password");

            setSuccess("Password changed successfully");
            setChangingPasswordFor(null);
            setNewUserPassword("");
        } catch (err) {
            setError((err as Error).message);
        }
    };

    if (!user?.isAdmin) {
        return <div className="admin-panel">Access denied</div>;
    }

    if (loading) {
        return <div className="admin-panel">Loading users...</div>;
    }

    return (
        <div className="admin-panel">
            {error && <div className="admin-error">{error}</div>}
            {success && <div className="admin-success">{success}</div>}

            <div className="admin-section">
                <h3 className="admin-section-title">Create New User</h3>
                <form onSubmit={handleCreateUser} className="admin-form">
                    <div className="admin-form-row">
                        <input
                            type="text"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            placeholder="Username"
                            className="admin-input"
                            disabled={creating}
                        />
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Password"
                            className="admin-input"
                            disabled={creating}
                        />
                    </div>
                    <div className="admin-form-row">
                        <label className="admin-checkbox">
                            <input
                                type="checkbox"
                                checked={newIsAdmin}
                                onChange={(e) => setNewIsAdmin(e.target.checked)}
                                disabled={creating}
                            />
                            <span>Admin privileges</span>
                        </label>
                        <button type="submit" className="admin-button" disabled={creating}>
                            {creating ? "Creating..." : "Create User"}
                        </button>
                    </div>
                </form>
            </div>

            <div className="admin-section">
                <h3 className="admin-section-title">Users ({users.length})</h3>
                <div className="admin-user-list">
                    {users.map((u) => (
                        <div key={u.id} className="admin-user-item">
                            <div className="admin-user-info">
                                <span className="admin-user-name">
                                    {u.username}
                                    {u.isAdmin && <span className="admin-badge">Admin</span>}
                                    {u.id === user.id && <span className="admin-you-badge">You</span>}
                                </span>
                                <span className="admin-user-date">
                                    Created {new Date(u.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                            <div className="admin-user-actions">
                                {changingPasswordFor === u.id ? (
                                    <div className="admin-password-form">
                                        <input
                                            type="password"
                                            value={newUserPassword}
                                            onChange={(e) => setNewUserPassword(e.target.value)}
                                            placeholder="New password"
                                            className="admin-input admin-input-small"
                                        />
                                        <button
                                            onClick={() => handleChangePassword(u.id)}
                                            className="admin-button admin-button-small"
                                        >
                                            Save
                                        </button>
                                        <button
                                            onClick={() => {
                                                setChangingPasswordFor(null);
                                                setNewUserPassword("");
                                            }}
                                            className="admin-button admin-button-small admin-button-secondary"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => setChangingPasswordFor(u.id)}
                                            className="admin-button admin-button-small admin-button-secondary"
                                        >
                                            Change Password
                                        </button>
                                        {u.id !== user.id && (
                                            <button
                                                onClick={() => handleDeleteUser(u.id, u.username)}
                                                className="admin-button admin-button-small admin-button-danger"
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <style jsx>{`
        .admin-panel {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .admin-section {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          padding: 1rem;
        }
        .admin-section-title {
          font-size: 0.95rem;
          font-weight: 600;
          margin: 0 0 1rem 0;
          color: #ddd;
        }
        .admin-form {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .admin-form-row {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          flex-wrap: wrap;
        }
        .admin-input {
          flex: 1;
          min-width: 120px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 6px;
          padding: 0.5rem 0.75rem;
          color: #fff;
          font-size: 0.9rem;
        }
        .admin-input:focus {
          outline: none;
          border-color: #3b82f6;
        }
        .admin-input-small {
          flex: 0 1 auto;
          width: 140px;
        }
        .admin-checkbox {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #aaa;
          font-size: 0.9rem;
          cursor: pointer;
        }
        .admin-button {
          background: linear-gradient(135deg, #3b82f6, #8b5cf6);
          border: none;
          border-radius: 6px;
          padding: 0.5rem 1rem;
          color: #fff;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .admin-button:hover:not(:disabled) {
          opacity: 0.9;
        }
        .admin-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .admin-button-small {
          padding: 0.375rem 0.75rem;
          font-size: 0.8rem;
        }
        .admin-button-secondary {
          background: rgba(255, 255, 255, 0.1);
        }
        .admin-button-danger {
          background: #ef4444;
        }
        .admin-user-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .admin-user-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 6px;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .admin-user-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .admin-user-name {
          font-weight: 500;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .admin-user-date {
          font-size: 0.8rem;
          color: #888;
        }
        .admin-badge {
          background: #3b82f6;
          font-size: 0.7rem;
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          font-weight: 600;
        }
        .admin-you-badge {
          background: rgba(255, 255, 255, 0.2);
          font-size: 0.7rem;
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
        }
        .admin-user-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .admin-password-form {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          flex-wrap: wrap;
        }
        .admin-error {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 6px;
          padding: 0.75rem;
          color: #ef4444;
          font-size: 0.9rem;
        }
        .admin-success {
          background: rgba(34, 197, 94, 0.15);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: 6px;
          padding: 0.75rem;
          color: #22c55e;
          font-size: 0.9rem;
        }
      `}</style>
        </div>
    );
}
