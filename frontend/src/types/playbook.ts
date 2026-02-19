export enum ContentType {
  BATTLE_CARD = 'battle_card',
  FAQ = 'faq',
  PRODUCT_INFO = 'product_info',
  SALES_PROCESS = 'sales_process',
  COLLATERAL = 'collateral',
  CASE_STUDY = 'case_study',
  BUSINESS_INFORMATION = 'business_information',
  PRODUCT_OVERVIEW = 'product_overview',
  TEMPLATES = 'templates',
}

// Content type display labels
export const contentTypeLabels: Record<ContentType, string> = {
  [ContentType.BATTLE_CARD]: "Battle Card",
  [ContentType.FAQ]: "FAQ",
  [ContentType.PRODUCT_INFO]: "Product Info",
  [ContentType.SALES_PROCESS]: "Sales Process",
  [ContentType.COLLATERAL]: "Collateral",
  [ContentType.CASE_STUDY]: "Case Study",
  [ContentType.BUSINESS_INFORMATION]: "Business Info",
  [ContentType.PRODUCT_OVERVIEW]: "Product Overview",
  [ContentType.TEMPLATES]: "Templates",
};

// Content type color schemes
export const contentTypeColors: Record<ContentType, string> = {
  [ContentType.BATTLE_CARD]: "bg-red-100 text-red-800 border-red-200",
  [ContentType.FAQ]: "bg-blue-100 text-blue-800 border-blue-200",
  [ContentType.PRODUCT_INFO]: "bg-green-100 text-green-800 border-green-200",
  [ContentType.SALES_PROCESS]: "bg-purple-100 text-purple-800 border-purple-200",
  [ContentType.COLLATERAL]: "bg-orange-100 text-orange-800 border-orange-200",
  [ContentType.CASE_STUDY]: "bg-teal-100 text-teal-800 border-teal-200",
  [ContentType.BUSINESS_INFORMATION]: "bg-indigo-100 text-indigo-800 border-indigo-200",
  [ContentType.PRODUCT_OVERVIEW]: "bg-pink-100 text-pink-800 border-pink-200",
  [ContentType.TEMPLATES]: "bg-amber-100 text-amber-800 border-amber-200",
};

export interface FileVersion {
  versionNumber: number;
  timestamp: string;
  uploadedBy?: string;
}

export interface PlaybookFile {
  id: string;
  name: string;
  description?: string;
  fileType: string;
  fileSize: number;
  url: string;
  uploadedBy: {
    firstName: string;
    lastName: string;
    email: string;
  };
  uploadedAt: string;
  currentVersion: FileVersion;
  versions?: FileVersion[];
  playbookContext?: {
    id: string;
    title: string;
    type: ContentType;
    tags: string[];
    keywords: string[];
    createdBy: {
      firstName: string;
      lastName: string;
    };
  };
}

export interface PlaybookItem {
  _id: string;
  type: ContentType;
  title: string;
  content: string;
  contentSummary?: string;
  tags: string[];
  keywords: string[];
  useCase?: string;
  lastUsed?: Date;
  usageCount?: number;
  organization: string;
  createdBy: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
  files?: PlaybookFile[];
  // fileCount is calculated from files?.length, not stored separately
}

export type PlaybookItemType = ContentType;

export interface PlaybookFileSearchParams {
  keywords?: string;
  type?: string;
  tags?: string;
  playbookType?: string;
}

export interface PlaybookFileSearchResult {
  files: PlaybookFile[];
  totalFiles: number;
  totalPlaybooks: number;
  filters: PlaybookFileSearchParams;
} 