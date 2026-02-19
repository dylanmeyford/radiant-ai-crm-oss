import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePlaybookOperations } from "@/hooks/usePlaybookOperations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, FileText, Calendar, User, Tag, Filter, Plus } from "lucide-react";
import { PlaybookItem, ContentType, contentTypeLabels, contentTypeColors } from "@/types/playbook";
import { usePageActions } from "@/context/PageActionsContext";

export default function AIPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ContentType | "all">("all");
  
  const {
    playbookItems,
    isLoadingPlaybookItems,
    playbookItemsError,
    refetchPlaybookItems,
  } = usePlaybookOperations();

  const { setActions, clearActions } = usePageActions();

  useEffect(() => {
    setActions([
      {
        id: 'add-new',
        label: 'Add New',
        icon: Plus,
        onClick: () => navigate('/ai/playbook/new'),
        variant: 'default'
      }
    ]);

    return () => clearActions();
  }, [setActions, clearActions, navigate]);

  // Filter and search playbook items
  const filteredItems = useMemo(() => {
    let filtered = playbookItems;

    // Filter by type
    if (typeFilter !== "all") {
      filtered = filtered.filter((item: PlaybookItem) => item.type === typeFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((item: PlaybookItem) =>
        item.title.toLowerCase().includes(query) ||
        item.content.toLowerCase().includes(query) ||
        item.tags.some((tag: string) => tag.toLowerCase().includes(query)) ||
        item.keywords.some((keyword: string) => keyword.toLowerCase().includes(query)) ||
        item.useCase?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [playbookItems, searchQuery, typeFilter]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleRowClick = (itemId: string) => {
    navigate(`/ai/playbook/${itemId}`);
  };

  if (playbookItemsError) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-red-800">Error Loading Playbooks</h3>
          <p className="text-sm text-red-600 mt-1">
            {playbookItemsError.message || "Failed to load playbook items"}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchPlaybookItems()}
            className="mt-2"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-5 w-5 text-gray-600" />
          <h1 className="text-xl font-semibold text-gray-900">AI Sales Playbooks</h1>
        </div>
        <p className="text-sm text-gray-600">
          Manage and explore your sales playbook content library
        </p>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search playbooks, tags, keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-600" />
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as ContentType | "all")}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(contentTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results Summary */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            {isLoadingPlaybookItems ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              `${filteredItems.length} of ${playbookItems.length} playbooks`
            )}
          </p>
          {(searchQuery || typeFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setTypeFilter("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 flex-1 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto h-full">
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[350px] whitespace-nowrap">Title</TableHead>
                <TableHead className="w-[140px] whitespace-nowrap">Type</TableHead>
                <TableHead className="w-[220px] whitespace-nowrap">Tags</TableHead>
                <TableHead className="w-[180px] whitespace-nowrap">Created By</TableHead>
                <TableHead className="w-[140px] whitespace-nowrap">Created</TableHead>
                <TableHead className="w-[80px] whitespace-nowrap text-center">Files</TableHead>
                <TableHead className="w-[80px] whitespace-nowrap text-center">Usage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingPlaybookItems ? (
                // Loading skeletons
                Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-64" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Skeleton className="h-5 w-12 rounded-full" />
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-6 w-6 rounded-full" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-8" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-8" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-12 w-12 text-gray-300" />
                      <h3 className="text-sm font-medium text-gray-900">
                        {searchQuery || typeFilter !== "all" ? "No matching playbooks" : "No playbooks found"}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {searchQuery || typeFilter !== "all" 
                          ? "Try adjusting your search or filters"
                          : "Create your first playbook to get started"
                        }
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item: PlaybookItem) => (
                  <TableRow 
                    key={item._id} 
                    className="hover:bg-gray-50 cursor-pointer transition-colors h-24 align-top"
                    onClick={() => handleRowClick(item._id)}
                  >
                    <TableCell className="max-w-0 align-top py-4">
                      <div className="space-y-1">
                        <h3 className="text-sm font-medium text-gray-900 truncate">
                          {item.title}
                        </h3>
                        {(item.contentSummary || item.useCase) && (
                          <p className="text-xs text-gray-500 line-clamp-2">
                            {item.contentSummary || item.useCase}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge
                        variant="secondary"
                        className={`text-xs ${contentTypeColors[item.type]}`}
                      >
                        {contentTypeLabels[item.type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {item.tags.slice(0, 2).map((tag, index) => (
                          <Badge
                            key={index}
                            variant="outline"
                            className="text-xs whitespace-nowrap"
                          >
                            <Tag className="h-2.5 w-2.5 mr-1" />
                            {tag}
                          </Badge>
                        ))}
                        {item.tags.length > 2 && (
                          <Badge variant="outline" className="text-xs whitespace-nowrap">
                            +{item.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-600 truncate">
                          {item.createdBy.firstName} {item.createdBy.lastName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <Calendar className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{formatDate(item.createdAt)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      <span className="text-sm text-gray-600">
                        {item.files?.length || 0}
                      </span>
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      <span className="text-sm text-gray-600">
                        {item.usageCount || 0}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
