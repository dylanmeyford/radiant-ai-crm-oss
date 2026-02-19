import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  FileIcon, 
  ExternalLinkIcon, 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  FolderIcon, 
  ArrowUpDown, 
  LinkIcon, 
  CheckCircle2, 
  CircleIcon, 
  ArrowRightIcon, 
  Clock, 
  GitBranchIcon,
  Loader2,
  DownloadIcon
} from 'lucide-react';
import { Document as PDFDocument, Page as PDFPage } from 'react-pdf';
import { pdfjs } from 'react-pdf';
import { renderAsync as renderDocx } from 'docx-preview';
import * as XLSX from 'xlsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { PathwayProgressData } from '@/hooks/usePathways';
import { requestNoAuth } from '@/hooks/requestNoAuth';
import radiantLogo from '@/assets/radiant_logo.svg';
import { Document, Link, SalesRoom, TrackingData } from '@/types/digitalSalesRoom';

// Set worker source to CDN
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PublicDataRoomPage: React.FC = () => {
  const { uniqueId } = useParams<{ uniqueId: string }>();
  const navigate = useNavigate();
  
  // Authentication state
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [accessRequested, setAccessRequested] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Sales room data
  const [salesRoom, setSalesRoom] = useState<SalesRoom | null>(null);
  const [documentAccessIds, setDocumentAccessIds] = useState<Record<string, string>>({});
  const [downloadingDocuments, setDownloadingDocuments] = useState<Record<string, boolean>>({});
  
  // Document viewer state
  const [viewingDocument, setViewingDocument] = useState(false);
  const [currentDocument, setCurrentDocument] = useState<Document | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageViewTimes, setPageViewTimes] = useState<Record<number, { startTime: Date, duration: number }>>({});
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentArrayBuffer, setDocumentArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(0.8);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [viewingStartTime, setViewingStartTime] = useState<Record<string, Date>>({});
  const currentPageRef = useRef<number>(1);
  
  // Pathway progress state
  const [pathwayProgress, setPathwayProgress] = useState<PathwayProgressData | null>(null);
  const [showPathway, setShowPathway] = useState(true);
  const [pathwayLoading, setPathwayLoading] = useState(false);

  // Check for existing session on mount
  useEffect(() => {
    const verifyExistingSession = async () => {
      if (uniqueId) {
        const visitorSession = localStorage.getItem(`visitor_session_${uniqueId}`);
        if (visitorSession) {
          try {
            const session = JSON.parse(visitorSession);
            setEmail(session.email);
            
            // Try to get the sales room to validate session
            const roomData = await getSalesRoomForVisitor();
            if (roomData) {
              setSalesRoom(roomData);
              setAuthenticated(true);
              await fetchPathwayProgress(roomData.id);
            } else {
              // Session is invalid - clear localStorage
              localStorage.removeItem(`visitor_session_${uniqueId}`);
              setAuthenticated(false);
            }
          } catch (error) {
            console.error('Error parsing visitor session:', error);
            localStorage.removeItem(`visitor_session_${uniqueId}`);
            setAuthenticated(false);
          }
        }
      }
    };
    
    verifyExistingSession();
  }, [uniqueId]);

  // Track page viewing time
  useEffect(() => {
    if (!viewingDocument || !currentDocument) return;
    
    // Record start time for current page
    setPageViewTimes(prev => ({
      ...prev,
      [currentPage]: { startTime: new Date(), duration: prev[currentPage]?.duration || 0 }
    }));
    currentPageRef.current = currentPage;
    
    // Update duration when changing pages or closing viewer
    const updatePageDuration = () => {
      const pageNum = currentPageRef.current;
      setPageViewTimes(prev => {
        if (!prev[pageNum]?.startTime) return prev;
        
        const duration = prev[pageNum].duration + 
          (new Date().getTime() - prev[pageNum].startTime.getTime());
        
        return {
          ...prev,
          [pageNum]: { ...prev[pageNum], duration }
        };
      });
    };
    
    return () => {
      updatePageDuration();
    };
  }, [currentPage, viewingDocument, currentDocument]);

  // Keep track of page presence for tracking
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Send tracking data for all open documents
      Object.entries(viewingStartTime).forEach(([documentId, startTime]) => {
        const accessId = documentAccessIds[documentId];
        if (accessId) {
          const trackingData: TrackingData = {
            durationMs: new Date().getTime() - startTime.getTime()
          };
          
          // Add page views data if available
          if (currentDocument && currentDocument._id === documentId && Object.keys(pageViewTimes).length > 0) {
            trackingData.pageViews = Object.entries(pageViewTimes).map(([page, data]) => ({
              page: Number(page),
              durationMs: data.duration
            }));
          }
          
          trackDocumentInteraction(accessId, trackingData);
        }
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
    };
  }, [viewingStartTime, documentAccessIds, currentDocument, pageViewTimes]);

  const requestAccess = async (uniqueId: string, email: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: apiError } = await requestNoAuth(
        `api/digital-sales-rooms/public/${uniqueId}/request-access`,
        'POST',
        { email }
      );
      
      if (apiError) {
        setError(apiError);
        return { success: false, message: apiError };
      }
      
      return { 
        success: true, 
        code: data?.code // For development mode
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to request access';
      setError(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const verifyAccess = async (uniqueId: string, email: string, code: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: apiError } = await requestNoAuth(
        `api/digital-sales-rooms/public/${uniqueId}/verify`,
        'POST',
        { email, code }
      );
      
      if (apiError) {
        setError(apiError);
        return { success: false, message: apiError };
      }
      
      return { 
        success: true, 
        salesRoom: data?.salesRoom 
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to verify access';
      setError(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const getSalesRoomForVisitor = async () => {
    if (!uniqueId) return null;
    
    try {
      const { data, error: apiError } = await requestNoAuth(
        `api/digital-sales-rooms/public/${uniqueId}`,
        'GET',
        null
      );
      
      if (apiError) {
        console.error('Error fetching sales room:', apiError);
        return null;
      }
      
      return data?.data || data;
    } catch (err) {
      console.error('Error fetching sales room:', err);
      return null;
    }
  };

  const fetchPathwayProgress = async (salesRoomId: string) => {
    setPathwayLoading(true);
    
    try {
      const { data, error: apiError } = await requestNoAuth(
        `api/digital-sales-rooms/public/${salesRoomId}/pathway-progress`,
        'GET',
        null
      );
      
      if (!apiError && data) {
        const progressData = data?.data || data;
        setPathwayProgress({
          ...progressData,
          steps: progressData.steps?.map((step: any) => ({
            ...step,
            updatedAt: step.updatedAt ? new Date(step.updatedAt) : null
          })) || []
        });
      }
    } catch (error) {
      console.error("Failed to fetch pathway progress:", error);
    } finally {
      setPathwayLoading(false);
    }
  };

  const trackDocumentInteraction = async (documentAccessId: string, trackingData: TrackingData) => {
    try {
      await requestNoAuth(
        `api/digital-sales-rooms/public/track/${documentAccessId}`,
        'POST',
        trackingData
      );
    } catch (error) {
      console.error('Error tracking document interaction:', error);
    }
  };

  const trackLinkInteraction = async (linkId: string, trackingData: TrackingData) => {
    try {
      await requestNoAuth(
        `api/digital-sales-rooms/public/track/link/${linkId}`,
        'POST',
        trackingData
      );
    } catch (error) {
      console.error('Error tracking link interaction:', error);
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim() || !uniqueId) {
      setError('Please enter your email address');
      return;
    }
    
    const response = await requestAccess(uniqueId, email);
    
    if (response.success) {
      setAccessRequested(true);
      setError(null);
      
      // If in development mode, auto-fill the code
      if (response.code) {
        setCode(response.code);
      }
    }
  };

  const handleVerifyAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    
    if (!code.trim() || !uniqueId) {
      setError('Please enter the verification code');
      setIsVerifying(false);
      return;
    }
    
    const response = await verifyAccess(uniqueId, email, code);
    
    if (response.success) {
      setAuthenticated(true);
      setError(null);
      
      // Save session to localStorage
      localStorage.setItem(`visitor_session_${uniqueId}`, JSON.stringify({
        email,
        timestamp: new Date().toISOString()
      }));
      
      // Fetch complete sales room data
      const fullSalesRoom = await getSalesRoomForVisitor();
      if (fullSalesRoom) {
        setSalesRoom(fullSalesRoom);
        await fetchPathwayProgress(fullSalesRoom.id);
      }
    }
    
    setIsVerifying(false);
  };

  const handleSignOut = () => {
    if (uniqueId) {
      localStorage.removeItem(`visitor_session_${uniqueId}`);
    }
    setAuthenticated(false);
    setSalesRoom(null);
    setEmail('');
    setCode('');
    setAccessRequested(false);
    setPathwayProgress(null);
  };

  const handleViewDocument = async (document: Document) => {
    if (!salesRoom) return;
    
    try {
      setLoadingDocument(true);
      setCurrentDocument(document);
      setViewingDocument(true);
      
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/digital-sales-rooms/public/${salesRoom.id}/documents/${document._id}`, {
        method: 'GET',
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Failed to fetch document');
      
      const documentAccessId = response.headers.get('X-Document-Access-Id');
      
      if (!documentAccessId) {
        console.error('Document access ID not provided in response');
        setLoadingDocument(false);
        setViewingDocument(false);
        setCurrentDocument(null);
        return;
      }
      
      setDocumentAccessIds(prev => ({
        ...prev,
        [document._id]: documentAccessId
      }));
      
      setViewingStartTime(prev => ({
        ...prev,
        [document._id]: new Date()
      }));
      
      setPageViewTimes({});
      setCurrentPage(1);
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setDocumentUrl(url);
      try {
        const arrayBuffer = await blob.arrayBuffer();
        setDocumentArrayBuffer(arrayBuffer);
      } catch (e) {
        setDocumentArrayBuffer(null);
      }
      
      setLoadingDocument(false);
    } catch (error) {
      console.error('Error viewing document:', error);
      setError('Failed to load document');
      setLoadingDocument(false);
      setViewingDocument(false);
      setCurrentDocument(null);
    }
  };

  const handleDownloadDocument = async (document: Document) => {
    if (!salesRoom) return;
    
    // Set downloading state
    setDownloadingDocuments(prev => ({ ...prev, [document._id]: true }));
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/digital-sales-rooms/public/${salesRoom.id}/documents/${document._id}`, {
        method: 'GET',
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Failed to fetch document');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = document.name;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      if (documentAccessIds[document._id]) {
        trackDocumentInteraction(documentAccessIds[document._id], {
          durationMs: 0,
          pageViews: []
        });
      }
    } catch (error) {
      console.error('Error downloading document:', error);
      setError('Failed to download document');
    } finally {
      // Clear downloading state
      setDownloadingDocuments(prev => ({ ...prev, [document._id]: false }));
    }
  };

  const handleLinkClick = async (link: Link) => {
    const clickStartTime = new Date();
    
    window.open(link.url, '_blank');
    
    const referrer = window.location.href;
    
    await trackLinkInteraction(link._id, {
      durationMs: 0,
      referrer
    });
    
    const checkReturnInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        clearInterval(checkReturnInterval);
        
        const durationMs = new Date().getTime() - clickStartTime.getTime();
        
        if (durationMs > 100) {
          trackLinkInteraction(link._id, {
            durationMs,
            referrer
          });
        }
      }
    }, 1000);
    
    setTimeout(() => {
      clearInterval(checkReturnInterval);
    }, 30 * 60 * 1000);
  };

  const closeViewer = () => {
    if (currentDocument && documentAccessIds[currentDocument._id]) {
      const pageNum = currentPage;
      const currentPageData = pageViewTimes[pageNum];
      
      const updatedPageViewTimes = {...pageViewTimes};
      if (currentPageData?.startTime) {
        updatedPageViewTimes[pageNum] = {
          ...currentPageData,
          duration: currentPageData.duration + 
            (new Date().getTime() - currentPageData.startTime.getTime())
        };
      }
      
      const trackingData: TrackingData = {
        durationMs: new Date().getTime() - (viewingStartTime[currentDocument._id]?.getTime() || 0)
      };
      
      if (Object.keys(updatedPageViewTimes).length > 0) {
        trackingData.pageViews = Object.entries(updatedPageViewTimes).map(([page, data]) => ({
          page: Number(page),
          durationMs: data.duration
        }));
      }

      trackDocumentInteraction(documentAccessIds[currentDocument._id], trackingData);
    }
    
    setViewingDocument(false);
    setCurrentDocument(null);
    if (documentUrl) {
      try { URL.revokeObjectURL(documentUrl); } catch (_) {}
    }
    setDocumentUrl('');
    setDocumentArrayBuffer(null);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Document viewer component
  const DocumentViewer = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const docxContainerRef = useRef<HTMLDivElement>(null);
    const [isDocxRendering, setIsDocxRendering] = useState(false);
    const [xlsxSheetName, setXlsxSheetName] = useState<string | null>(null);
    const [xlsxSheetNames, setXlsxSheetNames] = useState<string[]>([]);
    const [xlsxRows, setXlsxRows] = useState<any[][]>([]);
    
    useEffect(() => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
        
        const handleResize = () => {
          if (containerRef.current) {
            setContainerWidth(containerRef.current.clientWidth);
          }
        };
        
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
      }
    }, []);
    
    function onDocumentLoadSuccess({ numPages: pages }: { numPages: number }) {
      setNumPages(pages);
    }
    
    if (!currentDocument) return null;
    
    const fileTypeRaw = currentDocument.fileType || '';
    const fileName = currentDocument.name || '';
    const fileType = fileTypeRaw.toLowerCase();
    const extension = (fileName.split('.').pop() || '').toLowerCase();
    const isPdf = fileType.includes('pdf') || extension === 'pdf';
    const isImage = fileType.startsWith('image/') || ['jpg','jpeg','png','gif','webp'].includes(extension);
    const isDocx = fileType.includes('wordprocessingml.document') || extension === 'docx';
    const isXlsx = fileType.includes('spreadsheetml.sheet') || extension === 'xlsx' || extension === 'csv';

    // Render DOCX when applicable
    useEffect(() => {
      if (!isDocx) return;
      if (!docxContainerRef.current) return;
      if (!documentArrayBuffer) return;
      setIsDocxRendering(true);
      // Clear previous content
      docxContainerRef.current.innerHTML = '';
      renderDocx(documentArrayBuffer, docxContainerRef.current)
        .catch(() => {})
        .finally(() => setIsDocxRendering(false));
      // No cleanup needed beyond clearing container on next render
    }, [isDocx, documentArrayBuffer]);

    // Parse XLSX/CSV when applicable
    useEffect(() => {
      if (!isXlsx) return;
      if (!documentArrayBuffer) return;
      try {
        const data = new Uint8Array(documentArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const names = workbook.SheetNames || [];
        setXlsxSheetNames(names);
        const first = names[0];
        const active = xlsxSheetName && names.includes(xlsxSheetName) ? xlsxSheetName : first || null;
        setXlsxSheetName(active);
        if (active) {
          const ws = workbook.Sheets[active];
          const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
          setXlsxRows(rows);
        } else {
          setXlsxRows([]);
        }
      } catch (e) {
        setXlsxRows([]);
      }
    }, [isXlsx, documentArrayBuffer]);

    // Re-parse rows when user changes active XLSX sheet
    useEffect(() => {
      if (!isXlsx) return;
      if (!documentArrayBuffer) return;
      if (!xlsxSheetName) return;
      try {
        const data = new Uint8Array(documentArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        if (!workbook.SheetNames.includes(xlsxSheetName)) return;
        const ws = workbook.Sheets[xlsxSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
        setXlsxRows(rows);
      } catch (e) {
        // ignore
      }
    }, [xlsxSheetName]);
    
    return (
      <div className="flex flex-col h-full">
        {isPdf ? (
          <div className="flex-1 w-full h-full overflow-hidden">
            <div 
              ref={containerRef} 
              className="w-full h-full flex justify-center overflow-auto bg-zinc-50 dark:bg-zinc-800"
            >
              <PDFDocument
                file={documentUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={<div className="text-center p-4">Loading PDF...</div>}
                error={<div className="text-center p-4 text-red-500">Error loading PDF</div>}
                options={{
                  cMapUrl: 'https://unpkg.com/pdfjs-dist@3.4.120/cmaps/',
                  cMapPacked: true,
                }}
              >
                <PDFPage 
                  pageNumber={currentPage}
                  width={containerWidth * scale}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={<div className="text-center p-4">Loading page...</div>}
                  className="pdf-page"
                />
              </PDFDocument>
            </div>
          </div>
        ) : isImage ? (
          <div className="flex-1 overflow-auto flex justify-center">
            <img 
              src={documentUrl} 
              alt={currentDocument.name} 
              className="max-w-full max-h-[80vh] object-contain"
            />
          </div>
        ) : isDocx ? (
          <div className="flex-1 w-full h-full overflow-hidden">
            <div className="w-full h-full overflow-auto bg-white dark:bg-zinc-900">
              {isDocxRendering && (
                <div className="p-4 text-sm text-muted-foreground">Rendering document...</div>
              )}
              <div className="w-full flex justify-center">
                <div ref={docxContainerRef} className="docx-preview p-6 max-w-5xl w-full" />
              </div>
            </div>
          </div>
        ) : isXlsx ? (
          <div className="flex-1 w-full h-full overflow-hidden">
            <div className="w-full h-full overflow-auto bg-white dark:bg-zinc-900 p-4">
              {/* Header row with sheet selector */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Spreadsheet preview</span>
                {xlsxSheetNames.length > 1 && (
                  <Select value={xlsxSheetName || undefined} onValueChange={(v) => setXlsxSheetName(v)}>
                    <SelectTrigger className="h-8 w-[200px]">
                      <SelectValue placeholder="Select sheet" />
                    </SelectTrigger>
                    <SelectContent>
                      {xlsxSheetNames.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="overflow-auto rounded-md border">
                <table className="min-w-full text-xs">
                  <tbody>
                    {xlsxRows.length === 0 ? (
                      <tr>
                        <td className="p-3 text-muted-foreground">Unable to preview this spreadsheet</td>
                      </tr>
                    ) : (
                      xlsxRows.slice(0, 1000).map((row, rIdx) => (
                        <tr key={rIdx} className={rIdx === 0 ? 'bg-muted/40 sticky top-0 z-10' : rIdx % 2 === 0 ? 'bg-white dark:bg-zinc-900' : 'bg-zinc-50 dark:bg-zinc-950'}>
                          {row.map((cell: any, cIdx: number) => (
                            <td key={cIdx} className={`border-b border-r p-2 ${rIdx === 0 ? 'font-medium' : ''}`}>
                              {cell === undefined || cell === null ? '' : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {xlsxRows.length > 1000 && (
                <div className="mt-2 text-[10px] text-muted-foreground">Showing first 1000 rows</div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-4">
            <FileIcon className="h-12 w-12 sm:h-16 sm:w-16 mb-4 text-muted-foreground" />
            <p className="text-center text-sm sm:text-base">
              This file type ({fileType}) cannot be previewed directly.
            </p>
            <Button 
              className="mt-4"
              onClick={() => handleDownloadDocument(currentDocument)}
              disabled={downloadingDocuments[currentDocument._id]}
            >
              {downloadingDocuments[currentDocument._id] ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <DownloadIcon className="mr-2 h-4 w-4" />
                  Download to View
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderSidebarPathwayProgress = () => {
    if (!pathwayProgress || !pathwayProgress.steps || pathwayProgress.steps.length === 0) {
      return null;
    }

    const currentStepIndex = pathwayProgress.steps.findIndex(
      step => pathwayProgress.progress.currentStep?.stepId === step.stepId
    );

    return (
      <Card className="sticky top-4 border overflow-hidden shadow-sm">
        <CardHeader className="bg-muted/30 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center">
              <GitBranchIcon className="mr-2 h-4 w-4 text-primary" />
              {pathwayProgress.pathway.name}
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowPathway(!showPathway)}
              className="h-7 px-2 -mr-2"
            >
              {showPathway ? 'Hide' : 'Show'}
            </Button>
          </div>
          <CardDescription className="text-xs mt-1 flex-col flex">
            {pathwayProgress.progress.completedSteps} of {pathwayProgress.progress.totalSteps} steps completed
            <span className="text-xs text-muted-foreground">
              (Steps will complete automatically as you progress)
            </span>
          </CardDescription>
          
          <div className="mt-2">
            <Progress 
              value={pathwayProgress.progress.percentComplete} 
              className="h-2 bg-muted" 
            />
            <div className="flex justify-between mt-0.5">
              <span className="text-xs font-medium">{pathwayProgress.progress.percentComplete}%</span>
            </div>
          </div>

          {!showPathway && currentStepIndex >= 0 && (
            <div className="mt-3 flex items-center p-2 bg-blue-50/50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
              <div className="mr-2 bg-blue-100 dark:bg-blue-900/50 p-1 rounded-full">
                {pathwayProgress.progress.currentStep?.status === 'in_progress' ? (
                  <Clock className="h-4 w-4 text-blue-500" />
                ) : (
                  <CircleIcon className="h-4 w-4 text-blue-500" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400">Next Step: {pathwayProgress.progress.currentStep?.name}</p>
              </div>
            </div>
          )}
        </CardHeader>

        {showPathway && (
          <CardContent className="pt-3 px-3 max-h-[500px] overflow-y-auto">
            <div className="space-y-4">
              {pathwayProgress.steps.map((step, index) => {
                const isCurrentStep = pathwayProgress.progress.currentStep?.stepId === step.stepId;
                const isCompleted = step.status === 'completed';
                const isInProgress = step.status === 'in_progress';
                const isSkipped = step.status === 'skipped';
                
                return (
                  <div key={step.stepId} className={cn(
                    "relative flex gap-3",
                    index !== pathwayProgress.steps.length - 1 && "pb-4",
                    isCurrentStep && "pl-1 -ml-1 pr-1 -mr-1 py-2 rounded-md bg-blue-50/50 dark:bg-blue-950/20"
                  )}>
                    {index !== pathwayProgress.steps.length - 1 && (
                      <div className={cn(
                        "absolute top-6 left-3 w-0.5 h-full -ml-0.5",
                        isCompleted ? "bg-green-500/50" : 
                        isCurrentStep ? "bg-blue-400/50" :
                        "bg-muted-foreground/30"
                      )} />
                    )}
                    
                    <div className={cn(
                      "z-10 flex items-center justify-center w-6 h-6 rounded-full shrink-0 transition-all duration-300",
                      isCompleted ? "bg-green-100 dark:bg-green-900 ring-1 ring-green-500" :
                      isCurrentStep ? "bg-blue-100 dark:bg-blue-900 ring-1 ring-blue-400 shadow-sm" :
                      isInProgress ? "bg-amber-100 dark:bg-amber-900" :
                      isSkipped ? "bg-muted" :
                      "bg-muted"
                    )}>
                      {isCompleted ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      ) : isInProgress ? (
                        <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      ) : isSkipped ? (
                        <ArrowRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : isCurrentStep ? (
                        <CircleIcon className="h-3.5 w-3.5 text-blue-500" />
                      ) : (
                        <CircleIcon className="h-3.5 w-3.5 text-muted-foreground/50" />
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <h3 className={cn(
                          "text-sm font-medium",
                          isCompleted && "text-green-600 dark:text-green-400",
                          isCurrentStep && "text-blue-600 dark:text-blue-400 font-semibold",
                          !isCompleted && !isCurrentStep && !isInProgress && "text-muted-foreground"
                        )}>
                          {step.name}
                          {isCurrentStep && (
                            <span className="ml-2 text-[10px] bg-blue-100 dark:bg-blue-900/50 px-1.5 py-0.5 rounded-full text-blue-600 dark:text-blue-400 whitespace-nowrap">
                              Next Step
                            </span>
                          )}
                        </h3>
                        <Badge 
                          variant={
                            isCompleted ? "default" : 
                            isInProgress ? "secondary" : 
                            isCurrentStep ? "outline" :
                            isSkipped ? "outline" : 
                            "outline"
                          }
                          className={cn(
                            "ml-1 text-[10px] px-1 py-0",
                            isCompleted && "bg-green-500",
                            isCurrentStep && "border-blue-200 text-blue-600 dark:border-blue-800 dark:text-blue-400"
                          )}
                        >
                          {step.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      
                      {step.description && (
                        <p className={cn(
                          "mt-0.5 text-xs line-clamp-2",
                          isCurrentStep ? "text-blue-600/80 dark:text-blue-400/80" : "text-muted-foreground"
                        )}>
                          {step.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        )}
      </Card>
    );
  };

  const renderPathwayProgressSkeleton = () => {
    return (
      <Card className="sticky top-4 border overflow-hidden shadow-sm">
        <CardHeader className="bg-muted/30 pb-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-7 w-14" />
          </div>
          <Skeleton className="h-4 w-36 mt-1" />
          
          <div className="mt-2">
            <Skeleton className="h-2 w-full" />
            <div className="flex justify-between mt-0.5">
              <Skeleton className="h-4 w-8" />
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-3 px-3 max-h-[500px] overflow-y-auto">
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((_, index) => (
              <div key={index} className="relative flex gap-3 pb-4">
                {index !== 4 && (
                  <div className="absolute top-6 left-3 w-0.5 h-full -ml-0.5 bg-muted-foreground/30" />
                )}
                
                <Skeleton className="z-10 w-6 h-6 rounded-full shrink-0" />
                
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="mt-1.5 h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (!uniqueId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">Invalid Sales Room</h2>
            <p className="text-sm text-muted-foreground">This sales room does not exist.</p>
          </div>
          <Button onClick={() => navigate('/')}>Return Home</Button>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">Secure Data Room</h2>
            <p className="text-sm text-muted-foreground">
              Please verify your email to access the data and materials.
            </p>
          </div>
          
          {!accessRequested ? (
            <form onSubmit={handleRequestAccess}>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                    className="h-10"
                  />
                </div>
                <Button type="submit" disabled={loading} className="h-10">
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Requesting...
                    </>
                  ) : (
                    'Request Access'
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyAccess}>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="code">Verification Code</Label>
                  <Input
                    id="code"
                    type="text"
                    placeholder="Enter the code sent to your email"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    disabled={isVerifying}
                    required
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground">
                    Please check your email for a verification code.
                  </p>
                </div>
                <Button type="submit" disabled={isVerifying} className="h-10">
                  {isVerifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify Code'
                  )}
                </Button>
              </div>
            </form>
          )}
          
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </div>
      </div>
    );
  }

  if (!salesRoom) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading sales room...</p>
        </div>
      </div>
    );
  }

  // If viewing a document, show the document viewer in full screen
  if (viewingDocument && currentDocument) {
    return (
      <div className="min-h-screen bg-background flex flex-col h-screen">
        <div className="px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 border-b bg-white dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-1"
              onClick={closeViewer}
            >
              <ChevronLeftIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </Button>
          </div>

          {/* PDF controls in header */}
          {currentDocument.fileType.toLowerCase().includes('pdf') && !loadingDocument && (
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => { if (currentPage > 1) setCurrentPage(currentPage - 1); }} 
                disabled={currentPage <= 1}
                className="h-8 w-8 p-0"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>
              <span className="text-xs sm:text-sm whitespace-nowrap">
                Page <span className="font-medium">{currentPage}</span> of <span className="font-medium">{numPages || '--'}</span>
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => { if (numPages && currentPage < numPages) setCurrentPage(currentPage + 1); }} 
                disabled={numPages === null || currentPage >= numPages}
                className="h-8 w-8 p-0"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
              <div className="border-l h-5 mx-1 sm:mx-2" />
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 w-8 p-0"
                onClick={() => { if (scale > 0.4) setScale(scale - 0.2); }}
                disabled={scale <= 0.4}
              >
                -
              </Button>
              <span className="text-xs sm:text-sm font-medium w-12 sm:w-16 text-center whitespace-nowrap">
                {Math.round(scale * 100)}%
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 w-8 p-0"
                onClick={() => setScale(scale + 0.2)}
              >
                +
              </Button>
            </div>
          )}

          <div className="flex-1 min-w-0 text-center">
            <h2 className="text-sm sm:text-base font-medium truncate text-gray-900 dark:text-gray-100">{currentDocument.name}</h2>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => handleDownloadDocument(currentDocument)}
                    disabled={downloadingDocuments[currentDocument._id]}
                  >
                    {downloadingDocuments[currentDocument._id] ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <DownloadIcon className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Download
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => window.open(documentUrl, '_blank')}
                    disabled={!documentUrl}
                  >
                    <ExternalLinkIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Open in new tab
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* PDF controls moved to top header */}
        
        <div className="flex-1 w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
          {loadingDocument ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading document...</p>
              </div>
            </div>
          ) : (
            <DocumentViewer />
          )}
        </div>
      </div>
    );
  }

  // Main sales room view
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-6 px-4 sm:py-10">
        <div className="mb-6 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold">{salesRoom.name} - Secure Data Room</h1>
          {salesRoom.description && (
            <p className="mt-2 text-sm sm:text-base text-muted-foreground">{salesRoom.description}</p>
          )}
        </div>
        
        <div className="flex flex-col lg:flex-row gap-6 max-w-[1600px] mx-auto">
          {/* Main content area - Documents table */}
          <div className="lg:flex-1 order-2 lg:order-1">
            <div className="bg-white dark:bg-zinc-800 rounded-md shadow overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px] sm:w-[400px]">
                        <div className="flex items-center space-x-1">
                          <span>Name</span>
                          <ArrowUpDown className="h-4 w-4" />
                        </div>
                      </TableHead>
                      <TableHead className="hidden sm:table-cell">Type</TableHead>
                      <TableHead className="hidden sm:table-cell">Size</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array(5).fill(0).map((_, index) => (
                        <TableRow key={`skeleton-${index}`}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-5 w-5 rounded-md" />
                              <Skeleton className="h-4 w-[180px] sm:w-[250px]" />
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Skeleton className="h-4 w-12" />
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Skeleton className="h-4 w-16" />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Skeleton className="h-8 w-16 sm:w-24" />
                              <Skeleton className="h-8 w-16 sm:w-24" />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : salesRoom.documents && salesRoom.documents.length > 0 || 
                       salesRoom.links && salesRoom.links.length > 0 ? (
                      <>
                        {/* Render documents */}
                        {salesRoom.documents && salesRoom.documents.map((document: Document) => (
                          <TableRow 
                            key={`doc-${document._id}`}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleViewDocument(document)}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <FileIcon className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500 flex-shrink-0" />
                                <span className="truncate">{document.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">{document.fileType.toUpperCase()}</TableCell>
                            <TableCell className="hidden sm:table-cell">{formatFileSize(document.fileSize)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1 sm:gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 sm:px-3"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewDocument(document);
                                  }}
                                >
                                  <ExternalLinkIcon className="h-4 w-4 sm:mr-1" />
                                  <span className="hidden sm:inline">View</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 sm:px-3"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadDocument(document);
                                  }}
                                  disabled={downloadingDocuments[document._id]}
                                >
                                  {downloadingDocuments[document._id] ? (
                                    <Loader2 className="h-4 w-4 animate-spin sm:mr-1" />
                                  ) : (
                                    <DownloadIcon className="h-4 w-4 sm:mr-1" />
                                  )}
                                  <span className="hidden sm:inline">
                                    {downloadingDocuments[document._id] ? 'Downloading...' : 'Download'}
                                  </span>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        
                        {/* Render links */}
                        {salesRoom.links && salesRoom.links.map((link: Link) => (
                          <TableRow 
                            key={`link-${link._id}`}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleLinkClick(link)}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <LinkIcon className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 flex-shrink-0" />
                                <span className="truncate">{link.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">Link</TableCell>
                            <TableCell className="hidden sm:table-cell">-</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1 sm:gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 sm:px-3"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleLinkClick(link);
                                  }}
                                >
                                  <ExternalLinkIcon className="h-4 w-4 sm:mr-1" />
                                  <span className="hidden sm:inline">Open</span>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-10">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <FolderIcon className="h-10 w-10 mb-2" />
                            <p>No documents or links available</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            
            <div className="mt-6 sm:mt-10 text-center text-sm text-muted-foreground lg:hidden">
              <p>Accessed as {email}</p>
              <Button 
                variant="outline" 
                size="sm"
                className="mt-2"
                onClick={handleSignOut}
              >
                Sign Out
              </Button>
            </div>
          </div>
          
          {/* Sidebar - Pathway Progress */}
          <div className="lg:w-80 xl:w-96 order-1 lg:order-2">
            {pathwayLoading ? renderPathwayProgressSkeleton() : renderSidebarPathwayProgress()}
          </div>
        </div>
      </div>
      
      <div className="mt-6 hidden lg:block text-center text-sm text-muted-foreground">
        <p>Accessed as {email}</p>
        <Button 
          variant="outline" 
          size="sm"
          className="mt-2"
          onClick={handleSignOut}
        >
          Sign Out
        </Button>
      </div>
      
      {/* Powered by Radiant footer */}
      <div className="py-4 text-center border-t mt-6">
        <a 
          href="https://meetradiant.com" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>Powered by</span>
          <img src={radiantLogo} alt="Radiant Logo" className="h-5 w-5" />
          <span className="font-medium">Radiant</span>
        </a>
      </div>
    </div>
  );
};

export default PublicDataRoomPage;
