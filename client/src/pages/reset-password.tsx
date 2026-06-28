import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Lock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import logoPath from "@assets/IMG_3645.png";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setDone(true);
        setTimeout(() => setLocation("/auth"), 3000);
      } else {
        setError(data.message || "Reset failed");
      }
    } catch {
      setError("Connection error — please try again");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-[#080B14] flex items-center justify-center p-4">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-white font-bold text-lg mb-2">Invalid reset link</h2>
          <p className="text-gray-400 text-sm mb-4">This link is missing a token.</p>
          <Link href="/forgot-password">
            <button className="text-red-400 hover:text-red-300 text-sm font-medium">Request a new link →</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080B14] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logoPath} alt="VEDD" className="h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-white">Set a new password</h1>
          <p className="text-gray-500 text-sm mt-1">Choose something strong — at least 6 characters</p>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-[#0D1117] p-6">
          {done ? (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
              <h2 className="text-white font-bold text-lg mb-2">Password updated!</h2>
              <p className="text-gray-400 text-sm">Redirecting you to login in a moment…</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide block mb-1.5">
                  New password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="New password"
                    required
                    className="w-full bg-[#161D2E] border border-white/10 rounded-xl h-11 pl-10 pr-4 text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-red-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide block mb-1.5">
                  Confirm password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Confirm password"
                    required
                    className="w-full bg-[#161D2E] border border-white/10 rounded-xl h-11 pl-10 pr-4 text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-red-500/50"
                  />
                </div>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-2xl font-semibold bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Update password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
