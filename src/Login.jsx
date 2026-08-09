import React, { useState } from "react";

const API_BASE = "/api";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const resp = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data?.error || "Error iniciando sesión");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      onLogin(data.user);
    } catch (err) {
      setError(err.message || "Error iniciando sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0f172a",
      color: "#e5e7eb",
      padding: 24
    }}>
      <form onSubmit={submit} style={{
        width: "100%",
        maxWidth: 420,
        background: "rgba(15,23,42,0.95)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 18,
        padding: 28,
        boxShadow: "0 20px 60px rgba(0,0,0,0.35)"
      }}>
        <h2 style={{ marginTop: 0 }}>MORIS ViewerJS</h2>
        <p style={{ opacity: 0.75 }}>Ingreso al sistema</p>

        <label style={{ display: "block", marginTop: 18 }}>
          Usuario o correo
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={inputStyle}
            autoComplete="username"
          />
        </label>

        <label style={{ display: "block", marginTop: 14 }}>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            autoComplete="current-password"
          />
        </label>

        {error && (
          <div style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            background: "rgba(239,68,68,0.15)",
            color: "#fecaca"
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            marginTop: 20,
            padding: "12px 16px",
            borderRadius: 14,
            border: "none",
            background: "#38bdf8",
            color: "#020617",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          {loading ? "Ingresando..." : "Iniciar sesión"}
        </button>
      </form>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  marginTop: 6,
  padding: "11px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  outline: "none",
};
