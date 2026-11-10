
import { useState } from "react";

function Auth({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (isRegister && username.trim() === "") {
      setError("Please enter your username.");
      return;
    }

    if (email.trim() === "" || password === "") {
      setError("Please fill in all required fields.");
      return;
    }

    setLoading(true);

    const endpoint = isRegister ? "register" : "login";

    const body = isRegister
      ? {
          username: username.trim(),
          email: email.trim(),
          password,
        }
      : {
          email: email.trim(),
          password,
        };

    try {
      const response = await fetch(
        `http://localhost:5000/api/auth/${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Something went wrong.");
      }

      if (isRegister) {
        setSuccess("Registration successful! Please log in.");
        setIsRegister(false);
        setUsername("");
        setPassword("");
        setShowPassword(false);
      } else {
        onLogin(data.user, data.token);
      }
    } catch (err) {
      setError(err.message || "Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  function switchAuthMode() {
    setIsRegister(!isRegister);
    setError("");
    setSuccess("");
    setPassword("");
    setShowPassword(false);
  }

  return (
    <div className="auth-container">
      <div className="auth-card">

        <h2 className="auth-logo">Chat App 💬</h2>

        <h3>
          {isRegister ? "Create Account" : "Welcome Back"}
        </h3>

        <p className="auth-description">
          {isRegister
            ? "Register to start chatting"
            : "Login to continue chatting"}
        </p>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <div className="password-wrapper">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                isRegister ? "new-password" : "current-password"
              }
              required
            />

            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={
                showPassword ? "Hide password" : "Show password"
              }
            >
              {showPassword ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="21"
                  height="21"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 3l18 18" />
                  <path d="M10.6 10.6a2 2 0 002.8 2.8" />
                  <path d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.3 4.2 9 7-.3 1.2-1 2.3-1.8 3.3" />
                  <path d="M6.2 6.2C4.4 7.4 3.4 9.1 3 12c.7 2.8 4 7 9 7 1.2 0 2.3-.2 3.3-.7" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="21"
                  height="21"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          {error && (
            <p className="auth-error">{error}</p>
          )}

          {success && (
            <p className="auth-success">{success}</p>
          )}

          <button type="submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : isRegister
              ? "Register"
              : "Login"}
          </button>
        </form>

        <p className="auth-switch">
          {isRegister
            ? "Already have an account?"
            : "Don't have an account?"}

          <span onClick={switchAuthMode}>
            {isRegister ? " Login" : " Register"}
          </span>
        </p>

      </div>
    </div>
  );
}

export default Auth;
