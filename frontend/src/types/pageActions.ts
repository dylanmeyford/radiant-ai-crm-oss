import { LucideIcon } from "lucide-react";

export interface PageAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  disabled?: boolean;
  loading?: boolean;
}

export interface PageActionGroup {
  id: string;
  label?: string;
  actions: PageAction[];
}
