export interface StatsDay {
  date: string;
  pageviews: number;
  visitors: number;
  activeUsers: number;
  exports: number;
  newUsers: number;
  newWorks: number;
}
export interface AdminStats {
  timezone: string;
  startedAt: number;
  generatedAt: number;
  summary: {
    pageviews: number; visitors: number; totalUsers: number; newUsers: number;
    activeUsers: number; totalWorks: number; totalExports: number;
  };
  days: StatsDay[];
}
