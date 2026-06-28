import { useState } from "react";
import { Link } from "wouter";
import { Mail, ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import logoPath from "@assets/IMG_3645.png";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        const data = await res.json();
        setError(data.message || "Something went wrong");
      }
    } catch {
      setError("Connection error — please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080B14] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logoPath} alt="VEDD" className="h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-white">Reset your password</h1>
          <p className="text-gray-500 text-sm mt-1">Enter your email and we'll send you a reset link</p>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-[#0D1117] p-6">
          {sent ? (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
              <h2 className="text-white font-bold text-lg mb-2">Check your inbox</h2>
              <p className="text-gray-400 text-sm mb-6">
                If an account exists for <strong className="text-white">{email}</strong>, a reset link has been sent. It expires in 1 hour.
              </p>
              <Link href="/auth">
                <button className="text-sm text-red-400 hover:text-red-300 font-medium">
                  ← Back to login
                </button>
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide block mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full bg-[#161D2E] border border-white/10 rounded-xl h-11 pl-10 pr-4 text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-red-500/50"
                  />
                </div>
              </div>

              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-2xl font-semibold bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Send reset link
              </button>

              <div className="text-center pt-1">
                <Link href="/auth">
                  <button className="text-sm text-gray-500 hover:text-gray-300 flex items-center gap-1 mx-auto">
                    <ArrowLeft className="w-3.5 h-3.5" /> Back to login
                  </button>
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
