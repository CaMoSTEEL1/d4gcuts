import { useState, useEffect, useCallback } from "react";
import "./App.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import OwnerSchedule from "./OwnerSchedule.jsx";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const STORAGE_KEY_TOKEN = "owner_token";
const STORAGE_KEY_USER = "owner_user";

const clearOwnerSession = () => {
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_USER);
  localStorage.removeItem("token");
  localStorage.removeItem("user");
};

const readJsonSafe = async (res) => {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: res.status >= 500 ? "Server unavailable. Please try again shortly." : "Unexpected server response." };
  }
};

const safeFetch = async (url, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw err;
  }
};

export default function OwnerGate() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Check if there's already a valid owner session
  const verifyExistingSession = useCallback(async () => {
    try {
      const token = localStorage.getItem(STORAGE_KEY_TOKEN);
      const userStr = localStorage.getItem(STORAGE_KEY_USER);
      if (token && userStr) {
        const user = JSON.parse(userStr);
        if (user?.role === "OWNER") {
          // Validate token against a protected route to avoid stale-session lockups.
          const from = new Date().toISOString().slice(0, 10);
          const res = await safeFetch(
            `${API_BASE}/availability/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(from)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (res.ok) {
            // Also set regular token/user keys so OwnerSchedule can use them
            localStorage.setItem("token", token);
            localStorage.setItem("user", userStr);
            setAuthenticated(true);
          } else {
            clearOwnerSession();
          }
        }
      }
    } catch {
      // Corrupt data, clear it
      clearOwnerSession();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    verifyExistingSession();
  }, [verifyExistingSession]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Enter your username and password.");
      return;
    }

    setLoginLoading(true);

    try {
      const res = await safeFetch(`${API_BASE}/auth/owner-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await readJsonSafe(res);

      if (!res.ok) {
        setError(data.message || "Login failed.");
        return;
      }

      if (data.user?.role !== "OWNER") {
        setError("Access denied. Owner account required.");
        return;
      }

      // Store the owner session
      localStorage.setItem(STORAGE_KEY_TOKEN, data.token);
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(data.user));
      // Also set the regular keys so OwnerSchedule can read them
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      setAuthenticated(true);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    clearOwnerSession();
    setAuthenticated(false);
    setUsername("");
    setPassword("");
    setError("");
  };

  // Loading state while checking existing session
  if (loading) {
    return (
      <div className="page owner-page">
        <div className="owner-login-wrapper">
          <p className="muted">Checking session...</p>
        </div>
      </div>
    );
  }

  // Authenticated — render the actual dashboard with a logout button
  if (authenticated) {
    return (
      <div>
        <div className="owner-logout-bar">
          <span className="owner-logout-label">Owner Portal</span>
          <button className="owner-logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
        <OwnerSchedule />
      </div>
    );
  }

  // Login form
  return (
    <div className="page owner-page">
      <div className="owner-login-wrapper">
        <div className="owner-login-card">
          <div className="owner-login-header">
            <img src="/IMG_7755.png" alt="d4gcutz" className="owner-login-logo" />
            <h1>Owner Portal</h1>
            <p className="muted">Sign in to manage your schedule</p>
          </div>

          <form className="owner-login-form" onSubmit={handleLogin}>
            <div className="owner-login-field">
              <label htmlFor="owner-username">Username</label>
              <Input
                id="owner-username"
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
              />
            </div>

            <div className="owner-login-field">
              <label htmlFor="owner-password">Password</label>
              <Input
                id="owner-password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error && <p className="owner-login-error">{error}</p>}

            <Button className="primary owner-login-btn" type="submit" disabled={loginLoading}>
              {loginLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <a className="owner-login-back" href="/">
            &larr; Back to site
          </a>
        </div>
      </div>
    </div>
  );
}
