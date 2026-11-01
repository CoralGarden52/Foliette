import type { FontId } from "../types";

export interface FontDef {
  id: FontId;
  name: string;
  family: string;
  hint: string;
  webFamily?: string;
}

export const FONTS: FontDef[] = [
  { id: "mashan", name: "马善政楷书", family: '"Ma Shan Zheng", cursive', webFamily: "Ma Shan Zheng", hint: "温厚笔触 · 手写题字" },
  { id: "longcang", name: "龙藏手书", family: '"Long Cang", cursive', webFamily: "Long Cang", hint: "轻盈随性 · 日记便笺" },
  { id: "zhimang", name: "志莽行书", family: '"Zhi Mang Xing", cursive', webFamily: "Zhi Mang Xing", hint: "流动笔意 · 洒脱标题" },
  { id: "liujian", name: "流江毛草", family: '"Liu Jian Mao Cao", cursive', webFamily: "Liu Jian Mao Cao", hint: "自由草书 · 情绪片段" },
  { id: "kuaile", name: "站酷快乐体", family: '"ZCOOL KuaiLe", cursive', webFamily: "ZCOOL KuaiLe", hint: "圆润童趣 · 可爱注脚" },
  { id: "hand", name: "手写楷", family: "var(--font-hand)", hint: "温柔手写感" },
  { id: "brush", name: "行楷", family: "var(--font-brush)", hint: "潇洒标题" },
  { id: "round", name: "圆润体", family: 'var(--font-round)', hint: "数字英文可爱" },
  { id: "sans", name: "清爽黑", family: 'var(--font-sans)', hint: "干净易读" },
  { id: "serif", name: "衬线宋", family: 'Georgia, "Songti SC", "SimSun", serif', hint: "文艺复古" },
];

export const FONT_MAP: Record<string, FontDef> = Object.fromEntries(FONTS.map((f) => [f.id, f]));

const fontLoads = new Map<FontId, Promise<void>>();

export function loadEditorFont(id: FontId): Promise<void> {
  const family = FONT_MAP[id]?.webFamily;
  if (!family) return Promise.resolve();
  let pending = fontLoads.get(id);
  if (!pending) {
    pending = document.fonts.load(`38px "${family}"`).then((faces) => {
      if (!faces.length) throw new Error("手写字体未能加载，请重试");
    }).catch((error) => { fontLoads.delete(id); throw error; });
    fontLoads.set(id, pending);
  }
  return pending;
}

export const TEXT_COLORS = [
  "#3d3428", "#f2789f", "#e2557f", "#7fc8a9", "#3f9c7c",
  "#ffd166", "#e8a33d", "#8ecae6", "#3b7ea1", "#b5a8e0", "#ffffff", "#ff8a5c",
];

export const TEXT_PRESETS = [
  "今天也很开心 ✿",
  "⋆ ˚｡⋆ 温柔的一天",
  new Date().toLocaleDateString("zh-CN").replaceAll("/", "."),
  "一起去旅行吧 ☁︎",
  "生活可爱，值得记录",
  "✎ 小小心情",
  "「 慢慢来，比较快 」",
];

export const TEXT_TEMPLATE_GROUPS = [
  {
    id: "stars", name: "星月心情", templates: [
      "✧ 把日子过成喜欢的样子 ✧",
      "☾ 晚风与温柔，都是礼物",
      "♡ 心动的小事，慢慢收藏 ♡",
      "⋆ ˚｡⋆ 今日份的小确幸 ⋆｡˚ ⋆",
      "☆ 平凡的一天，也闪闪发光 ☆",
      "✦ 心里有光，日子就亮 ✦",
    ],
  },
  {
    id: "flowers", name: "花草日常", templates: [
      "✿ 好心情，正在发芽 ✿",
      "❀ 与花草一起，慢慢生长 ❀",
      "✾ 收集一朵小小的快乐 ✾",
      "❁ 把温柔写进日常 ❁",
      "· ✿ · 生活，自有花期 · ✿ ·",
      "✿\n让今天，开一朵花\n· · ·",
    ],
  },
  {
    id: "travel", name: "旅行片段", templates: [
      "↗ 去有风的地方",
      "☁ 把沿途的风景，装进口袋 ☁",
      "◇ 山海之间，自由自在 ◇",
      "→ 下一站，快乐！",
      "⌂ 和你走过的路，都算归途",
      "· · · on the road · · ·",
    ],
  },
  {
    id: "memories", name: "纪念标签", templates: [
      "「 这一刻，值得珍藏 」",
      "〔 我们的小小纪念 〕",
      "〈 今日心情：晴 〉",
      "# 与你有关的美好 #",
      "♡\n把喜欢，留在这一页\n♡",
      "— 未完待续，来日可期 —",
    ],
  },
  {
    id: "dividers", name: "装饰分隔", templates: [
      "— · ✿ · —",
      "♡ · · · ♡ · · · ♡",
      "✧ ─── ✧ ─── ✧",
      "· · · ☾ · · ·",
      "〈 · · · 〉",
      "⋆ ˚｡⋆ ♡ ⋆｡˚ ⋆",
    ],
  },
];
