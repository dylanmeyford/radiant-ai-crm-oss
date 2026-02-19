import React from 'react';
import { 
  Target,
  Hash,
  Tag,
  X,
  Plus,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlaybookItem } from '@/types/playbook';

interface PlaybookItemSidebarProps {
  playbookItem: PlaybookItem | null;
  isLoading?: boolean;
  tags: string[];
  keywords: string[];
  useCase: string;
  newTag: string;
  newKeyword: string;
  onTagsChange: (tags: string[]) => void;
  onKeywordsChange: (keywords: string[]) => void;
  onUseCaseChange: (useCase: string) => void;
  onNewTagChange: (newTag: string) => void;
  onNewKeywordChange: (newKeyword: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onAddKeyword: () => void;
  onRemoveKeyword: (keyword: string) => void;
}

export const PlaybookItemSidebar: React.FC<PlaybookItemSidebarProps> = ({ 
  playbookItem,
  isLoading = false,
  tags,
  keywords,
  useCase,
  newTag,
  newKeyword,
  onUseCaseChange,
  onNewTagChange,
  onNewKeywordChange,
  onAddTag,
  onRemoveTag,
  onAddKeyword,
  onRemoveKeyword,
}) => {
  const isMobile = useIsMobile();

  if (isLoading) {
    return (
      <div className={`bg-white flex flex-col ${
        isMobile 
          ? 'w-full border-b border-gray-200' 
          : 'w-80 border-r border-gray-200'
      }`}>
        <div className="p-4 border-b border-gray-200">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="p-4 space-y-4">
          {/* Use Case Skeleton */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>
          
          <Separator className="my-4" />
          
          {/* Tags Skeleton */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-16" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-16 rounded-full" />
              ))}
            </div>
            <Skeleton className="h-8 w-full" />
          </div>
          
          <Separator className="my-4" />
          
          {/* Keywords Skeleton */}
          <div className="space-y-3">
            <Skeleton className="h-4 w-20" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-20 rounded-full" />
              ))}
            </div>
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white flex flex-col ${
      isMobile 
        ? 'w-full border-b border-gray-200' 
        : 'w-80 border-r border-gray-200'
    }`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-sm font-medium text-gray-900 truncate">
          {playbookItem?.title ?? 'New Playbook Item'}
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Playbook Item Details
        </p>
      </div>

      {/* Content */}
      <div className={`space-y-4 overflow-y-auto flex-1 ${isMobile ? 'p-3' : 'p-4'}`}>
        {/* Use Case Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-gray-600" />
            <h3 className="text-sm font-medium text-gray-900">Use Case</h3>
          </div>
          <Input
            value={useCase}
            onChange={(e) => onUseCaseChange(e.target.value)}
            placeholder="Enter use case..."
            className="w-full"
          />
        </div>

        <Separator className="my-4" />

        {/* Tags Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-gray-600" />
            <h3 className="text-sm font-medium text-gray-900">Tags</h3>
          </div>
          
          {/* Existing Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag: string, index: number) => (
                <Badge key={index} variant="outline" className="text-xs flex items-center gap-1">
                  {tag}
                  <button
                    onClick={() => onRemoveTag(tag)}
                    className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
                    type="button"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          
          {/* Add Tag Input */}
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => onNewTagChange(e.target.value)}
              placeholder="Add a tag..."
              className="text-sm flex-1"
              onKeyPress={(e) => e.key === 'Enter' && onAddTag()}
            />
            <Button
              onClick={onAddTag}
              size="sm"
              variant="outline"
              className="px-2"
              type="button"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Keywords Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-gray-600" />
            <h3 className="text-sm font-medium text-gray-900">Keywords</h3>
          </div>
          
          {/* Existing Keywords */}
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {keywords.map((keyword: string, index: number) => (
                <Badge key={index} variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1">
                  {keyword}
                  <button
                    onClick={() => onRemoveKeyword(keyword)}
                    className="ml-1 hover:bg-blue-200 rounded-full p-0.5"
                    type="button"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          
          {/* Add Keyword Input */}
          <div className="flex gap-2">
            <Input
              value={newKeyword}
              onChange={(e) => onNewKeywordChange(e.target.value)}
              placeholder="Add a keyword..."
              className="text-sm flex-1"
              onKeyPress={(e) => e.key === 'Enter' && onAddKeyword()}
            />
            <Button
              onClick={onAddKeyword}
              size="sm"
              variant="outline"
              className="px-2"
              type="button"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
