'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { X, ZoomIn, ZoomOut, RotateCw, FileText, Save, Clock, Plus, Minus, Contrast, Move, Maximize2, Download, ExternalLink, Loader2, ChevronLeft, ChevronRight, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Job } from '@/types';
import { toProxyUrl } from '@/lib/file-url';
import { computeAutoBlack, levelsToDataUrl } from '@/lib/image-enhance';

// PDF.js type - will be loaded dynamically
type PDFDocumentProxy = any;
type PDFPageProxy = any;

interface PdfViewerModalProps {
  job: Job | null;
  onClose: () => void;
  onSaveAnnotation?: (jobId: string, annotation: string) => void;
}

export function PdfViewerModal({ job, onClose, onSaveAnnotation }: PdfViewerModalProps) {
  const [rotation, setRotation] = useState(0);
  // Extra darkening offset on top of the auto-detected level (0 = auto).
  // The +/- buttons nudge this when a scan needs more/less than auto.
  const [extraBlack, setExtraBlack] = useState(0);
  const [newAnnotation, setNewAnnotation] = useState('');
  const [showAnnotationForm, setShowAnnotationForm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // PDF to images state
  const [pdfImages, setPdfImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false);
  // Raw rendered pixels per page + their auto-detected black points, kept so
  // contrast can be re-applied live without re-fetching the PDF.
  const rawPagesRef = useRef<ImageData[]>([]);
  const autoBlacksRef = useRef<number[]>([]);

  // Dynamically load PDF.js only on client side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Dynamic import of pdfjs-dist
      import('pdfjs-dist').then((pdfjsLib) => {
        // Set worker source
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        setPdfJsLoaded(true);
      }).catch((err) => {
        console.error('Failed to load PDF.js:', err);
        setPdfError('Could not load the PDF viewer');
      });
    }
  }, []);

  // Get notes from job history
  const getNotes = () => {
    if (!job?.history) return [];
    
    return job.history
      .filter((h) => h.notes && h.notes.startsWith('NOTA:'))
      .map((h) => ({
        id: h.id,
        text: h.notes?.replace('NOTA: ', '') || '',
        timestamp: h.timestamp,
      }));
  };
  
  const notes = getNotes();

  // Check file types from fileName (clean) — fileUrl may carry a
  // ?alt=media&token= query string (Firebase Storage) that breaks endsWith.
  const typeSource = (job?.fileName || job?.fileUrl?.split('?')[0] || '').toLowerCase();
  const isPdf = typeSource.endsWith('.pdf');
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(typeSource);

  const adjustContrast = (delta: number) =>
    setExtraBlack((e) => Math.min(120, Math.max(-80, e + delta)));

  // Re-apply levels from the stored raw pixels whenever the offset changes
  // (instant, no PDF re-fetch). Each page uses its own auto level + offset.
  useEffect(() => {
    if (!rawPagesRef.current.length) return;
    setPdfImages(
      rawPagesRef.current.map((raw, i) =>
        levelsToDataUrl(
          raw,
          Math.min(230, Math.max(0, (autoBlacksRef.current[i] ?? 0) + extraBlack)),
        ),
      ),
    );
  }, [extraBlack]);

  // Convert PDF to images using PDF.js
  const convertPdfToImages = useCallback(async () => {
    if (!job?.fileUrl || !isPdf || !pdfJsLoaded) return;
    
    setIsLoadingPdf(true);
    setPdfError(null);
    setPdfImages([]);
    setCurrentPage(0);
    
    try {
      // Dynamic import
      const pdfjsLib = await import('pdfjs-dist');
      
      const loadingTask = pdfjsLib.getDocument(toProxyUrl(job.fileUrl));
      const pdfDocument = await loadingTask.promise;
      const images: string[] = [];
      const rawPages: ImageData[] = [];
      const autoBlacks: number[] = [];

      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        // Scale 2 keeps drawings crisp (zoom is available) while keeping the
        // canvas small enough that the contrast pass doesn't freeze the UI.
        const scale = 2;
        const viewport = page.getViewport({ scale, rotation: 0 });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) continue;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Paint a solid white background first. PDFs usually have no opaque
        // background, so without this the "paper" stays transparent and the
        // drawing looks washed-out/faint over the dark UI.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: context,
          viewport: viewport,
          background: '#ffffff',
        }).promise;

        // Keep raw pixels + the auto-detected black point so the +/- buttons
        // can re-apply levels live, then emit the page at the auto level.
        const raw = context.getImageData(0, 0, canvas.width, canvas.height);
        const autoBlack = computeAutoBlack(raw);
        rawPages.push(raw);
        autoBlacks.push(autoBlack);
        images.push(levelsToDataUrl(raw, autoBlack + extraBlack));
      }
      rawPagesRef.current = rawPages;
      autoBlacksRef.current = autoBlacks;
      
      setPdfImages(images);
    } catch (error) {
      console.error('Error converting PDF:', error);
      setPdfError('Could not convert the PDF');
    } finally {
      setIsLoadingPdf(false);
    }
  }, [job?.fileUrl, isPdf, pdfJsLoaded]);

  // PDFs are now shown via a native <iframe>; no canvas conversion needed.
  // (convertPdfToImages is retained but intentionally not invoked.)
  void convertPdfToImages;

  if (!job || !job.fileUrl) return null;

  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handleAddAnnotation = () => {
    if (!newAnnotation.trim()) return;
    
    onSaveAnnotation?.(job.id, `NOTA: ${newAnnotation}`);
    setNewAnnotation('');
    setShowAnnotationForm(false);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = job.fileUrl!;
    link.download = job.fileName || 'document';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const nextPage = () => {
    if (currentPage < pdfImages.length - 1) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(prev => prev - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 backdrop-blur-sm">
      <div className="bg-card w-full h-full flex flex-col">
        {/* Header */}
        <div className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-lg">
              {isImage ? (
                <Maximize2 size={18} className="text-primary-foreground" />
              ) : (
                <FileText size={18} className="text-primary-foreground" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-card-foreground">{job.title}</h3>
              <p className="text-[10px] text-muted-foreground">{job.fileName || 'Documento'}</p>
            </div>
            {isImage && (
              <div className="ml-4 bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-bold uppercase">
                Imagen
              </div>
            )}
            {isPdf && (
              <div className="ml-4 bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-[10px] font-bold uppercase">
                PDF - {pdfImages.length > 0 ? `${currentPage + 1}/${pdfImages.length} pages` : 'Loading...'}
              </div>
            )}
          </div>
          
          {/* Controls */}
          <div className="flex items-center gap-2">
            {isPdf && pdfImages.length > 1 && (
              <div className="flex items-center gap-1 mr-2">
                <Button variant="outline" size="sm" onClick={prevPage} disabled={currentPage === 0} className="h-8 w-8 p-0">
                  <ChevronLeft size={16} />
                </Button>
                <span className="text-xs text-muted-foreground px-2">
                  {currentPage + 1} / {pdfImages.length}
                </span>
                <Button variant="outline" size="sm" onClick={nextPage} disabled={currentPage === pdfImages.length - 1} className="h-8 w-8 p-0">
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleRotate} className="gap-1">
              <RotateCw size={16} />
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1">
              <Download size={16} />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => window.open(job.fileUrl, '_blank')}
              className="gap-1"
            >
              <ExternalLink size={16} />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowAnnotationForm(!showAnnotationForm)}
              className={`gap-1 ml-2 ${showAnnotationForm ? 'bg-primary text-primary-foreground' : ''}`}
            >
              <Plus size={16} />
              Note
            </Button>
            <button
              onClick={onClose}
              className="hover:bg-muted p-2 rounded-lg transition-colors text-muted-foreground hover:text-card-foreground ml-4"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Document viewer */}
          <div 
            ref={containerRef}
            className="flex-1 overflow-hidden bg-muted/30 flex items-center justify-center"
          >
            {isImage ? (
              /* Image with zoom and pan */
              <TransformWrapper
                initialScale={1}
                minScale={0.5}
                maxScale={5}
                centerOnInit={true}
                limitToBounds={false}
              >
                {({ zoomIn, zoomOut, resetTransform, scale }) => (
                  <>
                    {/* Zoom controls overlay */}
                    <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                      <div className="bg-card/90 backdrop-blur-sm border border-border rounded-xl p-2 flex flex-col gap-2 shadow-lg">
                        <Button variant="outline" size="sm" onClick={() => zoomIn()} className="w-10 h-10 p-0">
                          <ZoomIn size={18} />
                        </Button>
                        <div className="text-center text-[10px] font-bold text-muted-foreground">
                          {Math.round(scale * 100)}%
                        </div>
                        <Button variant="outline" size="sm" onClick={() => zoomOut()} className="w-10 h-10 p-0">
                          <ZoomOut size={18} />
                        </Button>
                        <div className="w-full h-px bg-border my-1" />
                        <Button variant="outline" size="sm" onClick={() => resetTransform()} className="w-10 h-10 p-0">
                          <Maximize2 size={18} />
                        </Button>
                      </div>
                      <div className="bg-card/90 backdrop-blur-sm border border-border rounded-xl px-3 py-2 shadow-lg">
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Move size={12} />
                          Drag to move
                        </p>
                      </div>
                    </div>

                    <TransformComponent
                      wrapperStyle={{ width: '100%', height: '100%' }}
                      contentStyle={{ 
                        transform: `rotate(${rotation}deg)`,
                        transition: 'transform 0.3s ease'
                      }}
                    >
                      <img
                        src={toProxyUrl(job.fileUrl)}
                        alt={job.fileName || 'Imagen'}
                        className="max-w-full max-h-[90vh] object-contain shadow-2xl rounded-lg"
                        style={{ transform: `rotate(${rotation}deg)`, filter: `contrast(${(1 + extraBlack / 100).toFixed(2)})` }}
                      />
                    </TransformComponent>
                  </>
                )}
              </TransformWrapper>
            ) : isPdf ? (
              /* PDF viewer - native browser renderer (true to the original) */
              <iframe
                src={`${toProxyUrl(job.fileUrl)}#toolbar=1&navpanes=0&view=FitH`}
                title={job.fileName || 'PDF'}
                className="w-full h-full bg-white"
                style={{ border: 'none' }}
              />
            ) : (
              /* Other files */
              <div className="flex flex-col items-center justify-center p-8 bg-card rounded-xl border border-border">
                <FileText size={64} className="text-primary mb-4" />
                <p className="text-lg font-bold text-card-foreground mb-2">File cannot be displayed</p>
                <div className="flex gap-3 mt-4">
                  <Button onClick={handleDownload} className="gap-2">
                    <Download size={16} />
                    Download
                  </Button>
                  <Button variant="outline" onClick={() => window.open(job.fileUrl!, '_blank')} className="gap-2">
                    <ExternalLink size={16} />
                    Open
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar with notes and history */}
          <div className="w-80 border-l border-border bg-card flex flex-col">
            {/* Add note form */}
            {showAnnotationForm && (
              <div className="p-4 border-b border-border bg-muted/50">
                <h4 className="text-sm font-bold text-card-foreground mb-2 flex items-center gap-2">
                  <Plus size={14} className="text-primary" />
                  Add Note
                </h4>
                <Textarea
                  value={newAnnotation}
                  onChange={(e) => setNewAnnotation(e.target.value)}
                  placeholder="Escribe tu nota..."
                  className="h-24 resize-none bg-background"
                />
                <Button 
                  onClick={handleAddAnnotation}
                  className="w-full mt-2 gap-1"
                  size="sm"
                >
                  <Save size={14} />
                  Save Note
                </Button>
              </div>
            )}

            {/* Notes list */}
            {notes.length > 0 && (
              <div className="p-4 border-b border-border">
                <h4 className="text-sm font-bold text-card-foreground mb-3 flex items-center gap-2">
                  <FileText size={14} className="text-yellow-500" />
                  Notes
                </h4>
                <div className="space-y-2">
                  {notes.map((note) => (
                    <div key={note.id} className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                      <p className="text-xs text-card-foreground">{note.text}</p>
                      <p className="text-[9px] text-muted-foreground mt-2">
                        {new Date(note.timestamp).toLocaleString('es-ES')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* History timeline */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-primary" />
                  <h4 className="text-sm font-bold text-card-foreground">Movement History</h4>
                </div>
              </div>
              
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                  {job.history && job.history.length > 0 ? (
                    [...job.history].reverse().map((entry, index) => (
                      <div 
                        key={entry.id || index}
                        className="relative pl-6 border-l-2 border-primary/30"
                      >
                        <div className="absolute left-[-7px] top-0 w-3 h-3 rounded-full bg-primary border-2 border-card" />
                        <div className="pb-4">
                          <p className="text-xs text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleDateString('es-ES', {
                              weekday: 'short',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleTimeString('es-ES', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                          {entry.notes && (
                            <p className="text-xs text-card-foreground mt-1 bg-muted/50 p-2 rounded-lg">
                              {entry.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No history
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
