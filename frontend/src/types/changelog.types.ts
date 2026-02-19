export interface ChangelogEntry {
  id: string;
  title: string;
  description: string;
  date: string;
  type: 'feature' | 'bugfix' | 'improvement';
}

export interface ChangelogData {
  notifications: ChangelogEntry[];
}
