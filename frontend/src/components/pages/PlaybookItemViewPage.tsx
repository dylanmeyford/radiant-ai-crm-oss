import { useParams, useNavigate } from "react-router-dom";
import { usePlaybookOperations } from "@/hooks/usePlaybookOperations";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TipTapEditor, { isHTML, plainTextToHTML } from "@/components/ui/TipTapEditor";
import {
  Save,
  Paperclip,
  Upload,
  Download,
  Trash2,
  Edit,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { ContentType, contentTypeLabels, contentTypeColors } from "@/types/playbook";
import { useState, useEffect, useCallback, useRef } from "react";
import { usePageActions } from "@/context/PageActionsContext";
import { PlaybookItemSidebar } from "@/components/playbook/PlaybookItemSidebar";
import { useIsMobile } from "@/hooks/use-mobile";

export default function PlaybookItemViewPage() {
  const { itemId } = useParams<{ itemId?: string }>();
  const [content, setContent] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [type, setType] = useState<ContentType | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [useCase, setUseCase] = useState<string>("");
  const [newTag, setNewTag] = useState<string>("");
  const [newKeyword, setNewKeyword] = useState<string>("");
  const [files, setFiles] = useState<any[]>([]);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [filesToDelete, setFilesToDelete] = useState<string[]>([]);
  const [isEditing] = useState<boolean>(true); // Start in edit mode
  const [updatingFileId, setUpdatingFileId] = useState<string | null>(null);
  const [successfullyUpdatedFiles, setSuccessfullyUpdatedFiles] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingUpdateFileId, setPendingUpdateFileId] = useState<string | null>(null);
  const { setActions, clearActions } = usePageActions();
  const isMobile = useIsMobile();
  const { 
    updatePlaybookItem, 
    isUpdating, 
    uploadFileToPlaybook, 
    deletePlaybookFile, 
    downloadPlaybookFile,
    updatePlaybookFile,
    getPlaybookItemQuery,
    createPlaybookItem
  } = usePlaybookOperations();

  const navigate = useNavigate();
  const isCreateMode = !itemId || itemId === 'new';

  const playbookItemQuery = getPlaybookItemQuery(isCreateMode ? null : itemId ?? null);
  const playbookItem = playbookItemQuery.data;
  const isLoading = playbookItemQuery.isLoading;
  const error = playbookItemQuery.error;
  const refetch = playbookItemQuery.refetch;

  // Initialize all fields when playbook item loads
  useEffect(() => {
    if (playbookItem) {
      // Initialize content
      if (playbookItem.content) {
        const htmlContent = isHTML(playbookItem.content) 
          ? playbookItem.content 
          : plainTextToHTML(playbookItem.content);
        setContent(htmlContent);
      }
      
      // Initialize other fields
      setTitle(playbookItem.title || '');
      setType(playbookItem.type || null);
      setTags(playbookItem.tags || []);
      setKeywords(playbookItem.keywords || []);
      setUseCase(playbookItem.useCase || '');
      setFiles(playbookItem.files || []);
      
      // Reset staged changes when new data loads
      setStagedFiles([]);
      setFilesToDelete([]);
    }
  }, [playbookItem]);

  // Add initialization for create mode
  useEffect(() => {
    if (isCreateMode) {
      setTitle('');
      setContent('');
      setType(null);
      setTags([]);
      setKeywords([]);
      setUseCase('');
      setFiles([]);
      setStagedFiles([]);
      setFilesToDelete([]);
    }
  }, [isCreateMode]);


  const handleContentChange = (newContent: string) => {
    setContent(newContent);
  };

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const addKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim())) {
      setKeywords([...keywords, newKeyword.trim()]);
      setNewKeyword('');
    }
  };

  const removeKeyword = (keywordToRemove: string) => {
    setKeywords(keywords.filter(keyword => keyword !== keywordToRemove));
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Stage the file for upload on save
    setStagedFiles(prev => [...prev, file]);
    
    // Clear the input
    event.target.value = '';
  };

  const handleFileRemove = (fileId: string) => {
    // Mark existing file for deletion on save
    setFilesToDelete(prev => [...prev, fileId]);
  };

  const handleStagedFileRemove = (index: number) => {
    // Remove staged file immediately (hasn't been uploaded yet)
    setStagedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleCancelFileRemoval = (fileId: string) => {
    // Cancel the deletion of an existing file
    setFilesToDelete(prev => prev.filter(id => id !== fileId));
  };

  const handleFileDownload = async (fileId: string, fileName: string) => {
    if (!itemId) return;
    
    await downloadPlaybookFile(itemId, fileId, fileName);
  };

  const handleFileUpdateClick = (fileId: string) => {
    setPendingUpdateFileId(fileId);
    // Trigger the hidden file input
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileUpdate = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !pendingUpdateFileId || !itemId) return;

    const fileId = pendingUpdateFileId;
    setUpdatingFileId(fileId);
    
    // Clear success state for this file if it was previously shown
    setSuccessfullyUpdatedFiles(prev => {
      const newSet = new Set(prev);
      newSet.delete(fileId);
      return newSet;
    });
    
    try {
      const result = await updatePlaybookFile(itemId, fileId, file);
      if (result.success) {
        // Show success feedback
        setSuccessfullyUpdatedFiles(prev => new Set(prev).add(fileId));
        
        // Hide success feedback after 3 seconds
        setTimeout(() => {
          setSuccessfullyUpdatedFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(fileId);
            return newSet;
          });
        }, 3000);
        
        // Refetch to get updated data
        refetch();
      } else {
        console.error('Failed to update file:', result.error);
      }
    } catch (error) {
      console.error('File update error:', error);
    } finally {
      setUpdatingFileId(null);
      setPendingUpdateFileId(null);
      // Clear the input
      event.target.value = '';
    }
  };

  const handleSave = useCallback(async () => {
    if (!type) return;
    
    try {
      let result;
      if (isCreateMode) {
        result = await createPlaybookItem({
          type,
          title,
          content,
          tags,
          keywords,
          useCase
        });
        
        if (result.success && result.data?._id) {
          // Upload staged files
          for (const file of stagedFiles) {
            await uploadFileToPlaybook(result.data._id, file);
          }
          
          // Clear staged files
          setStagedFiles([]);
          
          // Navigate to the new item
          navigate(`/ai/playbook/${result.data._id}`);
        }
      } else if (itemId) {
        result = await updatePlaybookItem(itemId, {
          type,
          title,
          content,
          tags,
          keywords,
          useCase
        });
        
        if (!result.success) {
          console.error('Failed to save content:', result.error);
          return;
        }

        // Handle file operations
        const fileOperations = [];

        // Delete marked files
        for (const fileId of filesToDelete) {
          fileOperations.push(deletePlaybookFile(itemId, fileId));
        }

        // Upload staged files
        for (const file of stagedFiles) {
          fileOperations.push(uploadFileToPlaybook(itemId, file));
        }

        // Wait for all file operations
        if (fileOperations.length > 0) {
          const fileResults = await Promise.all(fileOperations);
          const failedOperations = fileResults.filter(r => !r.success);
          
          if (failedOperations.length > 0) {
            console.error('Some file operations failed:', failedOperations);
          }
        }

        // Clear staged changes
        setStagedFiles([]);
        setFilesToDelete([]);
        
        // Refetch
        refetch();
      }
    } catch (error) {
      console.error('Save operation failed:', error);
    }
  }, [isCreateMode, type, title, content, tags, keywords, useCase, stagedFiles, filesToDelete, itemId, createPlaybookItem, updatePlaybookItem, uploadFileToPlaybook, deletePlaybookFile, refetch, navigate]);

  // Use a ref to keep the latest handleSave function
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  // Set up page actions
  useEffect(() => {
    const stableHandleSave = () => handleSaveRef.current();
    
    setActions([
      {
        id: 'save',
        label: isCreateMode ? 'Create' : 'Save',
        icon: Save,
        onClick: stableHandleSave,
        disabled: isUpdating,
        loading: isUpdating,
        variant: 'default'
      }
    ]);

    // Cleanup actions when component unmounts
    return () => {
      clearActions();
    };
  }, [setActions, clearActions, isUpdating, isCreateMode]);



  if (!isCreateMode && error) {
    return (
      <div className={`h-full overflow-hidden ${isMobile ? 'flex flex-col' : 'flex'}`}>
        <PlaybookItemSidebar 
          playbookItem={null} 
          isLoading={false}
          tags={tags}
          keywords={keywords}
          useCase={useCase}
          newTag={newTag}
          newKeyword={newKeyword}
          onTagsChange={setTags}
          onKeywordsChange={setKeywords}
          onUseCaseChange={setUseCase}
          onNewTagChange={setNewTag}
          onNewKeywordChange={setNewKeyword}
          onAddTag={addTag}
          onRemoveTag={removeTag}
          onAddKeyword={addKeyword}
          onRemoveKeyword={removeKeyword}
        />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="text-center">
            <h1 className="text-sm font-medium text-gray-900 mb-2">
              Error Loading Playbook Item
            </h1>
            <p className="text-red-600 text-xs mb-4">
              {error.message || "Failed to load playbook item"}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full overflow-hidden ${isMobile ? 'flex flex-col' : 'flex'}`}>
      <PlaybookItemSidebar 
        playbookItem={playbookItem} 
        isLoading={isLoading}
        tags={tags}
        keywords={keywords}
        useCase={useCase}
        newTag={newTag}
        newKeyword={newKeyword}
        onTagsChange={setTags}
        onKeywordsChange={setKeywords}
        onUseCaseChange={setUseCase}
        onNewTagChange={setNewTag}
        onNewKeywordChange={setNewKeyword}
        onAddTag={addTag}
        onRemoveTag={removeTag}
        onAddKeyword={addKeyword}
        onRemoveKeyword={removeKeyword}
      />
      <div className="flex-1 flex flex-col overflow-hidden p-4">
        {/* Header */}
        <div className="mb-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-96" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-4 mb-2">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-2xl text-gray-900 border border-gray-200 hover:border-gray-300 focus:border-gray-400 p-3 rounded-lg bg-white focus:ring-2 focus:ring-gray-100 flex-1"
                  placeholder="Enter title..."
                />
                <Select value={type || ""} onValueChange={(value) => setType(value as ContentType)}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select content type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(contentTypeLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${contentTypeColors[key as ContentType].split(' ')[0]}`}></div>
                          {label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Content Editor */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 flex-1">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : (
              <TipTapEditor
                content={content}
                onChange={handleContentChange}
                editable={isEditing}
                placeholder="Enter playbook content..."
              />
            )}
          </div>

          {/* Attachments */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Paperclip className="h-4 w-4 text-gray-600" />
              <h3 className="text-sm font-medium text-gray-900">Attachments</h3>
            </div>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Existing Files */}
                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((file: any) => {
                      const isMarkedForDeletion = filesToDelete.includes(file._id);
                      const isUpdating = updatingFileId === file._id;
                      const isSuccess = successfullyUpdatedFiles.has(file._id);
                      
                      return (
                        <div 
                          key={file._id} 
                          className={`flex items-center justify-between p-2 border rounded-md transition-all ${
                            isMarkedForDeletion 
                              ? 'border-red-200 bg-red-50 opacity-60' 
                              : isUpdating
                              ? 'border-blue-200 bg-blue-50 ring-2 ring-blue-100'
                              : isSuccess
                              ? 'border-green-200 bg-green-50 ring-2 ring-green-100'
                              : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Paperclip className="h-4 w-4 text-gray-500" />
                            <span className={`text-sm truncate ${
                              isMarkedForDeletion ? 'text-red-600 line-through' : 'text-gray-700'
                            }`}>
                              {file.name || file.originalName}
                            </span>
                            {file.size && (
                              <span className="text-xs text-gray-500">
                                ({Math.round(file.size / 1024)}KB)
                              </span>
                            )}
                            {isMarkedForDeletion && (
                              <span className="text-xs text-red-600 font-medium">Will be deleted</span>
                            )}
                            {isUpdating && (
                              <span className="text-xs text-blue-600 font-medium">Updating...</span>
                            )}
                            {isSuccess && (
                              <span className="text-xs text-green-600 font-medium">Updated!</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {!isMarkedForDeletion && (
                              <>
                                <Button
                                  onClick={() => handleFileDownload(file._id, file.name || file.originalName)}
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  type="button"
                                  title="Download file"
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                                <Button
                                  onClick={() => handleFileUpdateClick(file._id)}
                                  size="sm"
                                  variant="ghost"
                                  className={`h-8 w-8 p-0 transition-colors ${
                                    isSuccess 
                                      ? 'text-green-500 hover:text-green-700' 
                                      : 'text-blue-500 hover:text-blue-700'
                                  }`}
                                  type="button"
                                  title={isUpdating ? "Updating..." : isSuccess ? "File updated!" : "Update file"}
                                  disabled={isUpdating}
                                >
                                  {isUpdating ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : isSuccess ? (
                                    <CheckCircle className="h-3 w-3" />
                                  ) : (
                                    <Edit className="h-3 w-3" />
                                  )}
                                </Button>
                              </>
                            )}
                            {isMarkedForDeletion ? (
                              <Button
                                onClick={() => handleCancelFileRemoval(file._id)}
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-blue-500 hover:text-blue-700"
                                type="button"
                                title="Cancel deletion"
                              >
                                <span className="text-xs">↶</span>
                              </Button>
                            ) : (
                              <Button
                                onClick={() => handleFileRemove(file._id)}
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                type="button"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* Staged Files (waiting to be uploaded) */}
                {stagedFiles.length > 0 && (
                  <div className="space-y-2">
                    {stagedFiles.map((file: File, index: number) => (
                      <div 
                        key={`staged-${index}`} 
                        className="flex items-center justify-between p-2 border border-blue-200 rounded-md bg-blue-50"
                      >
                        <div className="flex items-center gap-2">
                          <Upload className="h-4 w-4 text-blue-500" />
                          <span className="text-sm text-blue-700 truncate">{file.name}</span>
                          <span className="text-xs text-blue-500">
                            ({Math.round(file.size / 1024)}KB)
                          </span>
                          <span className="text-xs text-blue-600 font-medium">Will be uploaded</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            onClick={() => handleStagedFileRemove(index)}
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                            type="button"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Upload New File */}
                <div className="border-2 border-dashed border-gray-300 rounded-md p-4 text-center">
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={isUpdating}
                  />
                  <label
                    htmlFor="file-upload"
                    className={`cursor-pointer flex flex-col items-center gap-2 ${
                      isUpdating ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <Upload className="h-6 w-6 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      Click to select a file
                    </span>
                    <span className="text-xs text-gray-500">
                      Files will be uploaded when you save
                    </span>
                  </label>
                </div>

                {/* Hidden input for file updates */}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpdate}
                  disabled={updatingFileId !== null}
                />
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
