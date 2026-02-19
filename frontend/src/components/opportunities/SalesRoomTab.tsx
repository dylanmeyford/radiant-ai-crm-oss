import React, { useState } from 'react';
import { useDigitalSalesRoom, useSalesRoomByOpportunity } from '@/hooks/useSalesRoom';
import { usePlaybookOperations } from '@/hooks/usePlaybookOperations';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { 
  PlusIcon, 
  DownloadIcon, 
  UploadIcon, 
  TrashIcon, 
  LinkIcon, 
  Loader2Icon, 
  ExternalLinkIcon,
  FileIcon,
  SearchIcon
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Document } from '@/types/digitalSalesRoom';
import { PlaybookItemType, contentTypeLabels } from '@/types/playbook';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SalesRoomTabProps {
  opportunityId: string;
}

// Add Link Dialog Component
function AddLinkDialog({ 
  isOpen, 
  onClose, 
  onAddLink, 
  isLoading 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onAddLink: (linkData: { name: string; url: string; description?: string }) => Promise<void>;
  isLoading: boolean;
}) {
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkDescription, setLinkDescription] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkName || !linkUrl) return;
    
    try {
      await onAddLink({
        name: linkName,
        url: linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`,
        description: linkDescription
      });
      
      // Reset form
      setLinkName('');
      setLinkUrl('');
      setLinkDescription('');
      onClose();
    } catch (error) {
      console.error('Failed to add link:', error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Link</DialogTitle>
          <DialogDescription>
            Add a link to share with your clients in the data room.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="link-name">Name</Label>
              <Input
                id="link-name"
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                placeholder="E.g., Product Documentation"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="link-url">URL</Label>
              <Input
                id="link-url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="link-description">Description (Optional)</Label>
              <Textarea
                id="link-description"
                value={linkDescription}
                onChange={(e) => setLinkDescription(e.target.value)}
                placeholder="Brief description of this link"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !linkName || !linkUrl}>
              {isLoading ? (
                <>
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Link'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Playbook File Selector Dialog Component
function PlaybookFileSelector({ 
  isOpen, 
  onClose, 
  onSelectFile, 
  isLoading = false 
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectFile: (fileId: string) => Promise<void>;
  isLoading?: boolean;
}) {
  const [searchKeywords, setSearchKeywords] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedTags, setSelectedTags] = useState('');
  const { searchPlaybookFilesQuery } = usePlaybookOperations();

  // Build search params
  const searchParams = {
    keywords: searchKeywords.trim() || undefined,
    playbookType: selectedType !== 'all' ? selectedType : undefined,
    tags: selectedTags.trim() || undefined,
  };

  // Use the query hook
  const filesQuery = searchPlaybookFilesQuery(searchParams);
  const files = filesQuery.data?.files || filesQuery.data || [];
  const searchLoading = filesQuery.isLoading;

  const handleSelectFile = async (fileId: string) => {
    await onSelectFile(fileId);
    onClose();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const playbookTypes: { value: PlaybookItemType; label: string }[] = Object.entries(contentTypeLabels).map(([value, label]) => ({
    value: value as PlaybookItemType,
    label
  }));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add Playbook Files</DialogTitle>
          <DialogDescription>
            Select files from your sales playbook to add to this data room.
          </DialogDescription>
        </DialogHeader>
        
        {/* Search and Filter Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search by keywords..."
              value={searchKeywords}
              onChange={(e) => setSearchKeywords(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {playbookTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Input
            placeholder="Filter by tags..."
            value={selectedTags}
            onChange={(e) => setSelectedTags(e.target.value)}
          />
        </div>

        {/* Files List */}
        <div className="flex-1 overflow-y-auto max-h-96">
          {searchLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2Icon className="h-6 w-6 animate-spin mr-2" />
              Loading files...
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-10">
              <FileIcon className="mx-auto h-12 w-12 text-gray-500 mb-4" />
              <p className="text-gray-500">
                {searchKeywords || (selectedType && selectedType !== 'all') || selectedTags 
                  ? 'No files found matching your search criteria.' 
                  : 'No playbook files available.'
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {files.map((file: any) => (
                <div key={file._id} className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-gray-900 truncate">{file.name}</h3>
                        <div className="flex items-center gap-2 text-xs mt-1">
                          <Badge variant="outline" className="text-xs">
                            {file.fileType.toUpperCase()}
                          </Badge>
                          <span className="text-gray-500">{formatFileSize(file.fileSize)}</span>
                          <span className="text-gray-500">•</span>
                          <span className="text-gray-500">{formatDistanceToNow(new Date(file.uploadedAt), { addSuffix: true })}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {file.playbookContext.type.replace('_', ' ').toUpperCase()}
                          </Badge>
                          {file.playbookContext.tags.slice(0, 3).map((tag: string, index: number) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {file.playbookContext.tags.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{file.playbookContext.tags.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleSelectFile(file._id)}
                        disabled={isLoading}
                        className="ml-2 flex-shrink-0"
                      >
                        {isLoading ? (
                          <Loader2Icon className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <PlusIcon className="h-4 w-4 mr-1" />
                            Add
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SalesRoomTab({ opportunityId }: SalesRoomTabProps) {
  const [isAddLinkDialogOpen, setIsAddLinkDialogOpen] = useState(false);
  const [isPlaybookFileSelectorOpen, setIsPlaybookFileSelectorOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [isAddingPlaybookFile, setIsAddingPlaybookFile] = useState(false);
  
  // Use TanStack Query to fetch sales room data
  const salesRoomQuery = useSalesRoomByOpportunity(opportunityId);
  const currentSalesRoom = salesRoomQuery.data;
  const isLoadingSalesRoom = salesRoomQuery.isLoading;
  
  const { 
    createSalesRoom, 
    uploadDocument, 
    deleteDocument, 
    deleteLink, 
    addLink, 
    addPlaybookFileToSalesRoom,
    isCreating
  } = useDigitalSalesRoom();

  const isBusy = isUploading || isAddingLink || isAddingPlaybookFile || isCreating;

  // Log the current sales room data for debugging
  console.log('currentSalesRoom', currentSalesRoom);

  const handleCreateSalesRoom = async (data: { name: string; description: string }) => {
    try {
      const result = await createSalesRoom(data.name, data.description, opportunityId);
      if (result.success && result.data) {
        // TanStack Query will automatically update the cache via the mutation's optimistic updates
        // No need to manually set state
      }
    } catch (error) {
      console.error('Failed to create sales room:', error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !currentSalesRoom) return;
    
    const file = e.target.files[0];
    setIsUploading(true);
    
    try {
      // Pass the opportunityId to ensure proper cache updates
      const result = await uploadDocument(currentSalesRoom._id, file, undefined, undefined, opportunityId);
      
      if (result.success) {
        // TanStack Query will automatically update the cache via the mutation's optimistic updates
        // No need to manually refetch
      }
    } catch (err) {
      console.error('Failed to upload document:', err);
    } finally {
      setIsUploading(false);
      // Reset the file input
      e.target.value = '';
    }
  };

  const handleAddLink = async (linkData: { name: string; url: string; description?: string }) => {
    if (!currentSalesRoom) return;
    
    setIsAddingLink(true);
    
    try {
      // Pass the opportunityId to ensure proper cache updates
      const result = await addLink(currentSalesRoom._id, linkData, opportunityId);
      
      if (result.success) {
        // TanStack Query will automatically update the cache via the mutation's optimistic updates
        // No need to manually refetch
      }
    } catch (err) {
      console.error('Failed to add link:', err);
    } finally {
      setIsAddingLink(false);
    }
  };

  const handleAddPlaybookFile = async (documentId: string) => {
    if (!currentSalesRoom) return;
    
    setIsAddingPlaybookFile(true);
    
    try {
      const result = await addPlaybookFileToSalesRoom(currentSalesRoom._id, documentId);
      
      if (result.success) {
        // TanStack Query will automatically update the cache via the mutation's optimistic updates
        // No need to manually refetch
      }
    } catch (err) {
      console.error('Failed to add playbook file:', err);
    } finally {
      setIsAddingPlaybookFile(false);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!currentSalesRoom) return;
    
    try {
      // Pass the opportunityId to ensure proper cache updates
      const result = await deleteDocument(currentSalesRoom._id, documentId, opportunityId);
      if (result.success) {
        // TanStack Query will automatically update the cache via the mutation's optimistic updates
        // No need to manually refetch
      }
    } catch (error) {
      console.error('Failed to delete document:', error);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!currentSalesRoom) return;
    
    try {
      // Pass the opportunityId to ensure proper cache updates
      const result = await deleteLink(currentSalesRoom._id, linkId, opportunityId);
      if (result.success) {
        // TanStack Query will automatically update the cache via the mutation's optimistic updates
        // No need to manually refetch
      }
    } catch (error) {
      console.error('Failed to delete link:', error);
    }
  };

  const copyShareLink = (uniqueId: string) => {
    const baseUrl = window.location.origin;
    const shareUrl = `${baseUrl}/data-room/${uniqueId}`;
    
    navigator.clipboard.writeText(shareUrl).then(() => {
      // Could add toast notification here
      console.log('Link copied to clipboard');
    }).catch(() => {
      console.error('Failed to copy link');
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderDocuments = () => {
    if (!currentSalesRoom) return null;

    // Check if there are documents or links
    const hasDocuments = currentSalesRoom.documents && currentSalesRoom.documents.length > 0;
    const hasLinks = currentSalesRoom.links && currentSalesRoom.links.length > 0;
    
    if (!hasDocuments && !hasLinks) {
      return (
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-24">Type</TableHead>
                <TableHead className="w-20">Size</TableHead>
                <TableHead className="w-32">Added</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  <div className="flex flex-col items-center">
                    <FileIcon className="h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-gray-600 text-sm font-medium">No documents or links added yet</p>
                    <p className="text-gray-500 text-xs mt-1">Use the "Add Content" button to get started</p>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      );
    }

    // Combine documents and links into one array for rendering
    const allItems: Document[] = [];
    
    // Add documents to the combined array
    if (hasDocuments) {
      currentSalesRoom.documents.forEach((doc: any) => {
        if (typeof doc !== 'string') {
          // Set type to 'file' if not specified
          allItems.push({
            ...doc,
            type: doc.type || 'file'
          });
        }
      });
    }
    
    // Add links to the combined array
    if (hasLinks && currentSalesRoom.links) {
      currentSalesRoom.links.forEach((link: any) => {
        if (typeof link !== 'string') {
          allItems.push({
            ...link,
            type: 'link'
          });
        }
      });
    }

    return (
      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-24">Type</TableHead>
              <TableHead className="w-20">Size</TableHead>
              <TableHead className="w-32">Added</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allItems.map((item: Document) => {
              const isLink = item.type === 'link';
              const isOptimistic = item._id.startsWith('temp-');
              
              return (
                <TableRow key={item._id} className={`hover:bg-gray-50 ${isOptimistic ? 'bg-blue-50/30' : ''}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {isLink ? <LinkIcon className="h-4 w-4 text-gray-600" /> : <FileIcon className="h-4 w-4 text-gray-600" />}
                      {isOptimistic && (
                        <Loader2Icon className="h-3 w-3 text-blue-500 animate-spin" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className={`text-sm font-medium ${isOptimistic ? 'text-blue-900' : 'text-gray-900'}`}>
                        {item.name}
                      </span>
                      {item.description && (
                        <span className="text-xs text-gray-500 mt-1 line-clamp-1">{item.description}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={isLink ? "secondary" : "outline"} className="text-xs">
                      {isLink ? 'LINK' : item.fileType.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {isLink ? '-' : formatFileSize(item.fileSize)}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {isOptimistic 
                      ? (isLink ? 'Adding...' : 'Uploading...') 
                      : formatDistanceToNow(new Date(item.uploadedAt), { addSuffix: true })
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-1">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => window.open(item.url, '_blank')}
                        className="h-7 w-7 p-0"
                        title={isLink ? 'Open link' : 'Download file'}
                        disabled={isOptimistic}
                      >
                        {isLink ? <ExternalLinkIcon className="h-3 w-3" /> : <DownloadIcon className="h-3 w-3" />}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => isLink 
                          ? handleDeleteLink(item._id) 
                          : handleDeleteDocument(item._id)
                        }
                        className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                        title="Delete"
                        disabled={isOptimistic}
                      >
                        <TrashIcon className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  if (isLoadingSalesRoom) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-24">Type</TableHead>
                <TableHead className="w-20">Size</TableHead>
                <TableHead className="w-32">Added</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-4 rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-3 w-12" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-3 w-16" />
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-1">
                      <Skeleton className="h-7 w-7 rounded" />
                      <Skeleton className="h-7 w-7 rounded" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (!currentSalesRoom) {
    return (
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <FileIcon className="h-4 w-4 text-gray-600" />
              <h3 className="text-sm font-medium text-gray-900">Create Data Room</h3>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Create a secure data room to share materials with your clients and track their engagement.
            </p>
          </div>
          <div className="p-4">
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const name = formData.get('name') as string;
              const description = formData.get('description') as string;
              
              if (name.trim()) {
                handleCreateSalesRoom({
                  name: name.trim(),
                  description: description.trim()
                });
              }
            }}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="room-name" className="text-sm font-medium text-gray-900">
                    Name
                  </Label>
                  <Input
                    id="room-name"
                    name="name"
                    placeholder="E.g., Acme Corp - Q4 Proposal"
                    required
                    disabled={isCreating}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="room-description" className="text-sm font-medium text-gray-900">
                    Description (Optional)
                  </Label>
                  <Textarea
                    id="room-description"
                    name="description"
                    placeholder="Brief description of this data room"
                    rows={3}
                    disabled={isCreating}
                  />
                </div>
                <Button type="submit" disabled={isCreating} className="w-full">
                  {isCreating ? (
                    <>
                      <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                      Creating Data Room...
                    </>
                  ) : (
                    <>
                      <PlusIcon className="mr-2 h-4 w-4" />
                      Create Data Room
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-gray-900">{currentSalesRoom.name}</h3>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => copyShareLink(currentSalesRoom.uniqueId)}
            className="h-7 w-7 p-0"
            aria-label="Copy share link"
          >
            <LinkIcon className="h-4 w-4" />
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={isBusy}>
              {isBusy ? (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlusIcon className="mr-2 h-4 w-4" />
              )}
              Add Content
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => document.getElementById('file-upload')?.click()} disabled={isUploading}>
              <UploadIcon className="mr-2 h-4 w-4" />
              <span>Upload Document</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setIsAddLinkDialogOpen(true)} disabled={isAddingLink}>
              <LinkIcon className="mr-2 h-4 w-4" />
              <span>Add Link</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setIsPlaybookFileSelectorOpen(true)} disabled={isAddingPlaybookFile}>
              <PlusIcon className="mr-2 h-4 w-4" />
              <span>Add Existing File</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      {currentSalesRoom.description && (
        <p className="text-gray-600 text-xs">{currentSalesRoom.description}</p>
      )}

      {renderDocuments()}

      <AddLinkDialog
        isOpen={isAddLinkDialogOpen}
        onClose={() => setIsAddLinkDialogOpen(false)}
        onAddLink={handleAddLink}
        isLoading={isAddingLink}
      />

      <PlaybookFileSelector
        isOpen={isPlaybookFileSelectorOpen}
        onClose={() => setIsPlaybookFileSelectorOpen(false)}
        onSelectFile={handleAddPlaybookFile}
        isLoading={isAddingPlaybookFile}
      />
      
      <input
        id="file-upload"
        type="file"
        className="hidden"
        onChange={handleFileUpload}
      />
    </div>
  );
}
