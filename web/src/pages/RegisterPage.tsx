import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AtSign, Check, Eye, EyeOff, Lock, Mail, RefreshCw } from "lucide-react";
import { api } from "../api";
import type { AssetManifest } from "../types";
import { useAuth } from "../store/user";
import { Button, Field, useToast } from "../components/ui";
import { cn } from "../lib/utils";
import AuthShell from "../components/AuthShell";

export default function RegisterPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, setUser } = useAuth();

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [avatar, setAvatar] = useState("");
  const [manifest, setManifest] = useState<AssetManifest | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate("/walls", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    api.assets().then(setManifest).catch(() => setManifest(null));
  }, []);

  const avatars = useMemo(() => manifest?.avatars ?? [], [manifest]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { user: u } = await api.register({ ...form, email: form.email.trim() });
      let registeredUser = u;
      if (avatar) {
        try { registeredUser = (await api.updateProfile({ avatar })).user; }
        catch { toast.push("账号已创建，头像可以稍后在个人菜单更换"); }
      }
      setUser(registeredUser);
      toast.push("注册成功，开始创建照片墙吧！", "success");
      navigate("/walls", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="w-full max-w-[26rem]">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="eyebrow">A FRESH LITTLE START</span>
          <h1 className="font-[family-name:var(--font-brush)] text-3xl">创建你的照片墙</h1>
          <p className="text-sm text-[var(--color-ink-soft)]">取个名字，选个头像，就出发 ✈︎</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="card-paper paper-grain anim-slide-up relative px-6 pt-8 pb-7"
        >
          <div className="tape tape--butter" style={{ top: -13, left: "50%", marginLeft: -46 }} />

          <div className="space-y-4">
            <Field label="用户名">
              <div className="relative">
                <AtSign size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]" />
                <input
                  className="field pl-9"
                  value={form.username}
                  onChange={set("username")}
                  placeholder="2-24 个字符"
                  maxLength={24}
                  required
                  minLength={2}
                  autoComplete="username"
                />
              </div>
            </Field>

            <Field label="邮箱">
              <div className="relative">
                <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]" />
                <input
                  className="field pl-9"
                  type="email"
                  inputMode="email"
                  required
                  value={form.email}
                  onChange={set("email")}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            </Field>

            <Field label="密码" hint="至少 6 位">
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]" />
                <input
                  className="field px-9"
                  type={showPwd ? "text" : "password"}
                  value={form.password}
                  onChange={set("password")}
                  placeholder="••••••"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  maxLength={64}
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

            <Field label="确认密码">
              <div className="relative">
                <Check size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]" />
                <input
                  className="field pl-9"
                  type={showPwd ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={set("confirmPassword")}
                  placeholder="再输入一次"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  maxLength={64}
                />
              </div>
            </Field>
          </div>

          {avatars.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-bold text-[var(--color-ink-soft)]">选一个头像</span>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-[var(--color-ink-faint)] hover:text-[var(--color-pink)]"
                  onClick={() => setAvatar(avatars[Math.floor(Math.random() * avatars.length)].url)}
                >
                  <RefreshCw size={12} /> 随机
                </button>
              </div>
              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                {avatars.map((a) => (
                  <button
                    key={a.name}
                    type="button"
                    onClick={() => setAvatar(a.url)}
                    className={cn(
                      "size-14 shrink-0 rounded-2xl border-2 bg-[var(--color-paper)] p-1 transition-all duration-200",
                      avatar === a.url
                        ? "scale-110 border-[var(--color-pink)] shadow-[2px_2px_0_rgba(61,52,40,0.85)]"
                        : "border-transparent opacity-80 hover:opacity-100"
                    )}
                  >
                    <img src={a.url} alt={a.name} className="size-full object-contain" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-xl bg-[var(--color-pink-soft)] px-3 py-2 text-sm font-bold text-[#b73e68]">
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" className="mt-6 w-full" disabled={busy}>
            {busy ? "创建中 …" : "注册并开始"}
          </Button>

          <p className="mt-5 text-center text-sm text-[var(--color-ink-soft)]">
            已经有照片墙了？
            <Link
              to="/login"
              className="ml-1 font-bold text-[var(--color-pink)] underline decoration-wavy decoration-2 underline-offset-4 hover:opacity-80"
            >
              直接登录
            </Link>
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
