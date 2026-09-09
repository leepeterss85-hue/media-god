import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { SOCIAL_LOGIN_PROVIDERS } from "@/components/mg/SocialLoginSection";
import { safeReturnTo } from "@/lib/authReturnTo";
import { mediaGodAuthReturnUrl } from "@/lib/mediaGodAuth";

const FIRE_TV_RE = /(?:AFT[A-Z0-9]*|Fire TV|AmazonWebAppPlatform|Silk)/i;

const isFireTv = () =>
  typeof navigator !== "undefined" &&
  FIRE_TV_RE.test(String(navigator.userAgent || ""));

const isSelectKey = (event) => {
  const key = String(event?.key || event?.code || "");
  const code = Number(event?.keyCode || event?.which || 0);

  return (
    key === "Enter" ||
    key === "NumpadEnter" ||
    key === "Select" ||
    key === "Accept" ||
    code === 13 ||
    code === 23 ||
    code === 66
  );
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState(null);
  const googleButtonRef = useRef(null);
  const fireTv = isFireTv();

  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();

  useEffect(() => {
    if (!fireTv) return undefined;

    const focusGoogle = () => {
      const button = googleButtonRef.current;

      if (!(button instanceof HTMLElement)) return;

      try {
        button.focus({ preventScroll: true });
      } catch {
        button.focus();
      }
    };

    focusGoogle();
    const timer = window.setTimeout(focusGoogle, 220);

    return () => window.clearTimeout(timer);
  }, [fireTv]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = (provider) => {
    setError("");
    setSocialLoading(provider);

    try {
      base44.auth.loginWithProvider(
        provider,
        mediaGodAuthReturnUrl(returnTo)
      );
    } catch (err) {
      setSocialLoading(null);
      setError(err?.message || `Could not start ${provider} sign-in`);
    }
  };

  const handleGoogleRemoteKey = (event) => {
    if (!fireTv || !isSelectKey(event)) return;

    event.preventDefault();
    event.stopPropagation();
    handleSocial("google");
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in to your account"
      footer={
        <>
          Don't have an account?{" "}
          <Link
            to={"/register" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "")}
            className="text-primary font-medium hover:underline"
          >
            Create one
          </Link>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
        {SOCIAL_LOGIN_PROVIDERS.map(({ id, label, Icon }, index) => (
          <Button
            key={id}
            ref={index === 0 ? googleButtonRef : undefined}
            variant="outline"
            className="w-full h-12 text-sm font-medium"
            onClick={() => handleSocial(id)}
            onKeyDown={id === "google" ? handleGoogleRemoteKey : undefined}
            autoFocus={fireTv && index === 0}
            disabled={socialLoading !== null}
            data-mg-fire-tv-auth-primary={index === 0 ? "true" : undefined}
          >
            {socialLoading === id ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Icon className="w-5 h-5 mr-2" />
            )}
            Continue with {label}
          </Button>
        ))}
      </div>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus={!fireTv}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
