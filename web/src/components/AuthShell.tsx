import type { ReactNode } from "react";
import { ArrowUpRight, Heart, Image, Move, Sparkles } from "lucide-react";
import { Logo } from "./ui";
import { LAYOUTS } from "../data/layouts";

export function DemoPhoto({ variant = "hills" }: { variant?: "hills" | "sea" | "flowers" }) {
  const photographs = { hills: "/assets/demo/alpine-lake.jpg", sea: "/assets/demo/slow-coast.jpg", flowers: "/assets/demo/forest-light.jpg" };
  return <img src={photographs[variant]} alt="" className="size-full object-cover" draggable={false} />;
}

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell">
      <header className="auth-header">
        <Logo size={35} />
      </header>
      <div className="auth-layout">
        <section className="auth-story" aria-label="Foliette 照片墙拼贴展示">
          <span className="eyebrow"><Sparkles size={13} /> A LITTLE COLLECTION OF YOU</span>
          <h2>把喜欢的瞬间，<br /><span className="hand-underline">认真收藏。</span></h2>
          <p className="auth-description">照片里有风，纸页间有光。<br />把平凡日子的温柔，收藏在一面照片墙里。</p>
          <div className="memory-board">
            <div className="board-grid" />
            <span className="board-note">dear little days,</span>
            <div className="memory-photo memory-photo--hills">
              <span className="tape tape--mint" />
              <div className="memory-picture"><DemoPhoto /></div>
              <span>去有风的地方 ↗</span>
            </div>
            <div className="memory-photo memory-photo--sea">
              <span className="memory-pin" />
              <div className="memory-picture"><DemoPhoto variant="sea" /></div>
              <span>a little closer to the sea.</span>
            </div>
            <div className="memory-photo memory-photo--flowers">
              <div className="memory-picture"><DemoPhoto variant="flowers" /></div>
              <span>where the light stays.</span>
            </div>
            <img className="board-heart" src="/assets/stickers/elements/element-120.png" alt="" />
            <img className="board-sparkle" src="/assets/stickers/elements/element-006.png" alt="" />
            <div className="board-label">把喜欢的瞬间，<br /><b>好好收藏。</b><Heart size={16} /></div>
            <span className="board-date">VOL. 01 / OUR EVERYDAY</span>
            <span className="board-arrow"><ArrowUpRight size={28} /></span>
          </div>
          <div className="auth-features"><span><Image size={14} /> {LAYOUTS.length} 种灵感排版</span><span><Move size={14} /> 自由拖动拼贴</span><span><Heart size={14} /> 高清珍藏</span></div>
        </section>
        <section className="auth-form-panel">{children}</section>
      </div>
      <footer className="auth-footer"><span>Foliette · 让平凡的日子有迹可循</span><span>MADE FOR YOUR LITTLE MOMENTS ♡</span></footer>
    </main>
  );
}
