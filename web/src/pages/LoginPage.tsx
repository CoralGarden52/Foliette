import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail, Sparkles } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../store/user";
import { Button, Field, useToast } from "../components/ui";
import AuthShell from "../components/AuthShell";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const destination = new URLSearchParams(location.search).get('next') === '/admin/stats' || location.state?.from === '/admin/stats' ? '/admin/stats' : '/walls';
  const toast = useToast();
  const { user, setUser } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate(destination, { replace: true });
  }, [user, navigate, destination]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("邮箱和密码都要填哦");
      return;
    }
    setBusy(true);
    try {
      const { user: u } = await api.login({ email: email.trim(), password });
      setUser(u);
      toast.push(`欢迎回来，${u.username}`, "success");
      navigate(destination, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="w-full max-w-[26rem]">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <span className="eyebrow">OPEN YOUR LITTLE WORLD</span>
          <h1 className="font-[family-name:var(--font-brush)] text-3xl leading-tight">
            欢迎回到你的照片墙
          </h1>
        </div>

        <form
          onSubmit={onSubmit}
          className="card-paper paper-grain anim-slide-up relative overflow-visible px-6 pt-8 pb-7"
        >
          <div className="tape tape--pink" style={{ top: -13, left: 28, transform: "rotate(-8deg)" }} />
          <div className="tape tape--mint" style={{ top: -13, right: 28, transform: "rotate(9deg)" }} />

          <div className="space-y-4">
            <Field label="邮箱">
              <div className="relative">
                <Mail
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]"
                />
                <input
                  className="field pl-9"
                  required
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </Field>

            <Field label="密码" error={error || undefined}>
              <div className="relative">
                <Lock
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]"
                />
                <input
                  className="field px-9"
                  type={showPwd ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  maxLength={64}
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-[var(--color-ink-soft)] hover:bg-[rgba(61,52,40,0.07)]"
                  aria-label={showPwd ? "隐藏密码" : "显示密码"}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
          </div>

          <Button type="submit" variant="primary" size="lg" className="mt-6 w-full" disabled={busy}>
            {busy ? "正在打开照片墙 …" : "打开我的照片墙 →"}
          </Button>

          <p className="mt-5 text-center text-sm text-[var(--color-ink-soft)]">
            还没有照片墙？
            <Link
              to="/register"
              className="ml-1 font-bold text-[var(--color-pink)] underline decoration-wavy decoration-2 underline-offset-4 hover:opacity-80"
            >
              免费注册一个
            </Link>
          </p>
        </form>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[var(--color-ink-faint)]">
          <Sparkles size={13} />
          照片、贴纸、文字，随心拼贴
        </p>
      </div>
    </AuthShell>
  );
}
