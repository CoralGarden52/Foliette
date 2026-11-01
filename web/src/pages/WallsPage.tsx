import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowUpRight, LogOut, Pencil, Plus, Smile, Trash2, UserCog,
} from "lucide-react";
import { api } from "../api";
import type { AssetManifest, User, Wall } from "../types";
import { useAuth } from "../store/user";
import { Button, Field, Logo, Modal, Segmented, Spinner, useToast } from "../components/ui";
import { LayoutThumb } from "../components/LayoutThumb";
import { LAYOUTS, RATIO_PRESETS } from "../data/layouts";
import { DEFAULT_BACKGROUND } from "../data/backgrounds";
import { cn, formatDate } from "../lib/utils";
import { DemoPhoto } from "../components/AuthShell";

export default function WallsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user, setUser, logout } = useAuth();

  const [walls, setWalls] = useState<Wall[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [manifest, setManifest] = useState<AssetManifest | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Wall | null>(null);

  const [draft, setDraft] = useState({
    title: "",
    ratio: RATIO_PRESETS[2],
    layoutId: LAYOUTS[0].id,
  });
  const [busy, setBusy] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { walls } = await api.listWalls();
      setWalls(walls);
    } catch (err) {
      setLoadError((err as Error).message);
      toast.push((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api.assets().then(setManifest).catch(() => null);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const totalPhotos = useMemo(() => walls.reduce((s, w) => s + w.photoCount, 0), [walls]);

  async function createWall() {
    setBusy(true);
    try {
      const { wall } = await api.createWall({
        title: draft.title.trim() || undefined,
        ratio: { w: draft.ratio.w, h: draft.ratio.h },
        layoutId: draft.layoutId,
        theme: DEFAULT_BACKGROUND.color,
      });
      toast.push("新照片墙建好啦，去贴照片吧", "success");
      navigate(`/editor/${wall.id}`);
    } catch (err) {
      toast.push((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeWall(w: Wall) {
    try {
      await api.deleteWall(w.id);
      setWalls((prev) => prev.filter((x) => x.id !== w.id));
      toast.push("已经收进碎纸机了", "success");
    } catch (err) {
      toast.push((err as Error).message, "error");
    }
    setPendingDelete(null);
  }

  async function pickAvatar(url: string) {
    try {
      const { user: u } = await api.updateProfile({ avatar: url });
      setUser(u);
      setAvatarOpen(false);
      toast.push("头像换好啦", "success");
    } catch (err) {
      toast.push((err as Error).message, "error");
    }
  }

  return (
    <div className="min-h-full pb-16">
      {/* ------------------------------ 顶栏 ------------------------------ */}
      <header className="library-header sticky top-0 z-40 border-b border-[rgba(61,52,40,0.1)] bg-[var(--color-cream)]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link to="/walls" className="shrink-0">
            <Logo size={34} />
          </Link>
          <span className="hidden text-xs text-[var(--color-ink-faint)] sm:block">
            手帐风照片墙
          </span>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative" ref={menuRef}>
              <button
                aria-label="用户菜单"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                className="library-user flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition"
              >
                {user?.avatar ? (
                  <img src={user.avatar} alt="" className="size-8 rounded-full object-contain" />
                ) : (
                  <span className="flex size-8 items-center justify-center rounded-full bg-[var(--color-butter)]">
                    <Smile size={18} />
                  </span>
                )}
                <span className="hidden max-w-[7rem] truncate text-sm font-bold min-[400px]:inline">{user?.username}</span>
              </button>

              {menuOpen && (
                <div className="card-paper anim-pop absolute right-0 top-12 w-48 overflow-hidden p-1.5">
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-bold">{user?.username}</p>
                    <p className="truncate text-xs text-[var(--color-ink-faint)]">{user?.email}</p>
                  </div>
                  <div className="my-1 h-px bg-[rgba(61,52,40,0.1)]" />
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setAvatarOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold hover:bg-[var(--color-butter-soft)]"
                  >
                    <UserCog size={15} /> 更换头像
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await logout();
                        navigate("/login", { replace: true });
                      } catch (error) {
                        toast.push((error as Error).message, "error");
                      }
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-[#b73e68] hover:bg-[var(--color-pink-soft)]"
                  >
                    <LogOut size={15} /> 退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ------------------------------ 主体 ------------------------------ */}
      <main className="library-main mx-auto max-w-6xl px-4 pt-8">
        <section className="library-hero card-paper paper-grain relative mb-8 overflow-hidden px-6 py-7 sm:px-9 sm:py-9">
          <div className="tape tape--lilac" style={{ top: -12, right: 40, transform: "rotate(7deg)" }} />
          <div className="tape tape--butter" style={{ bottom: -12, left: 46, transform: "rotate(-5deg)" }} />
          <p className="eyebrow">
            MY LITTLE COLLECTION / 我的照片墙
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-brush)] text-4xl sm:text-5xl">
            生活的小片段，都在这里。
          </h1>
          <div className="collection-summary" aria-label="收藏概览">
            <span><strong>{String(walls.length).padStart(2, "0")}</strong><small>面照片墙</small></span>
            <span><strong>{String(totalPhotos).padStart(2, "0")}</strong><small>张日常片段</small></span>
          </div>
          <div className="library-hero-art" aria-hidden="true"><div className="library-mini-photo"><DemoPhoto variant="flowers" /><span>little things, big feelings.</span></div><img src="/assets/stickers/elements/element-120.png" alt="" /><span className="tape tape--butter" /></div>
        </section>

        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <div><p className="eyebrow mb-1">PAGES OF MY LIFE</p><h2 className="font-[family-name:var(--font-hand)] text-2xl">我的照片墙 <span className="ml-1 text-sm text-[var(--color-ink-faint)]">/ {walls.length}</span></h2></div>
          <p className="text-[11px] text-[var(--color-ink-soft)]">20 张照片 · {LAYOUTS.length} 种排版 · 无限小灵感</p>
        </div>

          <div className="library-grid grid grid-cols-1 gap-6 min-[480px]:grid-cols-2 lg:grid-cols-3">
            <button type="button" data-create-wall-card="true" className="create-wall-card anim-slide-up" onClick={() => setCreating(true)} aria-label="新建照片墙">
              <div className="create-wall-art" aria-hidden="true"><span className="create-paper create-paper-back" /><span className="create-paper create-paper-front"><Plus size={25} strokeWidth={1} /><span>here begins a little story</span></span><span className="create-card-tape" /></div>
              <div className="create-wall-caption"><div><h3>新建照片墙</h3><p>从一页空白，收藏新的故事</p></div><ArrowUpRight size={20} strokeWidth={1.2} /></div>
            </button>
            {loadError ? <div className="card-paper px-6 py-12 text-center"><p className="mb-4 text-sm text-[var(--color-ink-soft)]">{loadError}</p><Button onClick={() => void load()}>重新加载</Button></div> : loading ? Array.from({ length: 2 }).map((_, index) => <div key={`loading-${index}`} className="skeleton aspect-[4/5] rounded-xl" />) : (
              <>
            {walls.map((w, idx) => (
              <article
                key={w.id}
                className="wall-card card-paper anim-slide-up group relative overflow-hidden"
                style={{ animationDelay: `${Math.min(idx, 8) * 0.05}s` }}
              >
                <button
                  onClick={() => navigate(`/editor/${w.id}`)}
                  className="block w-full text-left"
                >
                  <div
                    className="wall-card-cover relative w-full overflow-hidden"
                  >
                    {w.cover ? (
                      <img src={w.cover} alt={w.title} className="size-full object-contain p-5" loading="lazy" />
                    ) : (
                      <div className="flex size-full items-center justify-center p-4">
                        <LayoutThumb layoutId={w.layoutId} ratio={w.ratio} count={Math.max(1, w.photoCount)} />
                      </div>
                    )}
                    <span className="wall-photo-count">
                      {String(w.photoCount).padStart(2, "0")} / 20
                    </span>
                  </div>
                  <div className="wall-card-caption px-4 pt-4 pb-5 pr-24">
                    <h3 className="truncate font-[family-name:var(--font-hand)] text-lg">{w.title}</h3>
                    <p className="mt-0.5 text-xs text-[var(--color-ink-faint)]">
                      {w.ratio.w}:{w.ratio.h} · {formatDate(w.updatedAt)}
                    </p>
                  </div>
                </button>

                <div className="wall-card-actions absolute right-2 bottom-3 flex gap-1.5 transition-opacity duration-200">
                  <button
                    onClick={() => navigate(`/editor/${w.id}`)}
                    className="flex size-9 items-center justify-center rounded-full border-2 border-[var(--color-ink)] bg-[var(--color-butter)] shadow-[2px_2px_0_rgba(61,52,40,0.85)] active:translate-x-[2px] active:translate-y-[2px]"
                    title="编辑"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setPendingDelete(w)}
                    className="flex size-9 items-center justify-center rounded-full border-2 border-[var(--color-ink)] bg-[var(--color-pink)] text-white shadow-[2px_2px_0_rgba(61,52,40,0.85)] active:translate-x-[2px] active:translate-y-[2px]"
                    title="删除"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            ))}
              </>
            )}
          </div>
      </main>

      {/* ---------------------------- 新建弹窗 ---------------------------- */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="新建照片墙"
        width="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={createWall} disabled={busy}>
              {busy ? "创建中 …" : "开始拼贴"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Field label="给它起个名字">
            <input
              className="field"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="例如：十月的海边"
              maxLength={60}
            />
          </Field>

          <div>
            <p className="mb-2 text-sm font-bold text-[var(--color-ink-soft)]">画布比例</p>
            <div className="flex flex-wrap gap-2">
              {RATIO_PRESETS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setDraft((d) => ({ ...d, ratio: r }))}
                  className={cn(
                    "rounded-xl border-2 px-3 py-2 text-xs font-bold transition",
                    draft.ratio.id === r.id
                      ? "border-[var(--color-ink)] bg-[var(--color-butter)] shadow-[2px_2px_0_rgba(61,52,40,0.85)]"
                      : "border-[rgba(61,52,40,0.16)] bg-white/60 text-[var(--color-ink-soft)] hover:border-[var(--color-ink)]"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold text-[var(--color-ink-soft)]">
              初始布局（{LAYOUTS.length} 种，之后可随时换）
            </p>
            <div className="no-scrollbar grid max-h-64 grid-cols-3 gap-2.5 overflow-y-auto sm:grid-cols-4">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setDraft((d) => ({ ...d, layoutId: l.id }))}
                  className={cn(
                    "rounded-xl border-2 bg-white p-1.5 text-left transition",
                    draft.layoutId === l.id
                      ? "border-[var(--color-pink)] shadow-[2px_2px_0_rgba(61,52,40,0.85)]"
                      : "border-[rgba(61,52,40,0.14)] hover:border-[var(--color-ink)]"
                  )}
                >
                  <div className="h-16 w-full overflow-hidden rounded-lg bg-[var(--color-paper-2)]">
                    <LayoutThumb layoutId={l.id} ratio={draft.ratio} count={4} />
                  </div>
                  <p className="mt-1 truncate text-[11px] font-bold">{l.name}</p>
                </button>
              ))}
            </div>
          </div>

        </div>
      </Modal>

      {/* ---------------------------- 头像弹窗 ---------------------------- */}
      <Modal open={avatarOpen} onClose={() => setAvatarOpen(false)} title="更换头像">
        {manifest && manifest.avatars.length > 0 ? (
          <div className="grid grid-cols-4 gap-3">
            {manifest.avatars.map((a) => (
              <button
                key={a.name}
                onClick={() => pickAvatar(a.url)}
                className={cn(
                  "aspect-square rounded-2xl border-2 bg-[var(--color-paper)] p-1.5 transition",
                  user?.avatar === a.url
                    ? "border-[var(--color-pink)] shadow-[2px_2px_0_rgba(61,52,40,0.85)]"
                    : "border-[rgba(61,52,40,0.14)] hover:border-[var(--color-ink)]"
                )}
              >
                <img src={a.url} alt={a.name} className="size-full object-contain" />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
      </Modal>

      {/* ---------------------------- 删除确认 ---------------------------- */}
      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="删除这面照片墙？"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              再想想
            </Button>
            <Button
              variant="primary"
              onClick={() => pendingDelete && removeWall(pendingDelete)}
            >
              <Trash2 size={16} /> 确认删除
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-[var(--color-ink-soft)]">
          「{pendingDelete?.title}」里的 {pendingDelete?.photoCount} 张照片会一起被删掉，找不回来哦。
        </p>
      </Modal>
    </div>
  );
}
