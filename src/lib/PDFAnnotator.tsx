import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { Annotation, AnnotationsJSON } from '../types';
import { normalizedToPixels } from './coordinates';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface PDFAnnotatorProps {
  pdfFile: File | null;
  annotations: AnnotationsJSON;
  onAnnotationsChange: (annotations: AnnotationsJSON) => void;
  onSelectionChange: (ids: string[]) => void;
  zoom: number;
  mode: 'edit' | 'review';
  fieldValues: Record<string, string>;
  onFieldClick: (id: string) => void;
  editingFieldId: string | null;
}

export function PDFAnnotator({
  pdfFile,
  annotations,
  onAnnotationsChange,
  onSelectionChange,
  zoom,
  mode,
  fieldValues,
  onFieldClick,
  editingFieldId,
}: PDFAnnotatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageDimensions, setPageDimensions] = useState<Record<number, { width: number; height: number }>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTool, setActiveTool] = useState<'select' | 'pan' | 'textbox' | 'checkbox' | 'radio'>('select');
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    annotationId: string | null;
    startX: number;
    startY: number;
    initialPositions: Map<string, [number, number, number, number]>;
  }>({
    isDragging: false,
    annotationId: null,
    startX: 0,
    startY: 0,
    initialPositions: new Map(),
  });

  useEffect(() => {
    if (!pdfFile) return;

    const loadPdf = async () => {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setPdfDocument(pdf);
      setNumPages(pdf.numPages);

      // Get dimensions for all pages
      const dims: Record<number, { width: number; height: number }> = {};
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        dims[i] = { width: viewport.width, height: viewport.height };
      }
      setPageDimensions(dims);
    };

    loadPdf();
  }, [pdfFile]);

  const handleAnnotationMouseDown = useCallback((e: React.MouseEvent, annotation: Annotation) => {
    e.stopPropagation();

    if (mode === 'review') {
      onFieldClick(annotation.id);
      return;
    }

    // Edit mode: handle selection and drag
    const isAlreadySelected = selectedIds.includes(annotation.id);

    if (e.shiftKey) {
      const newSelection = isAlreadySelected
        ? selectedIds.filter(id => id !== annotation.id)
        : [...selectedIds, annotation.id];
      setSelectedIds(newSelection);
      onSelectionChange(newSelection);
    } else if (!isAlreadySelected) {
      setSelectedIds([annotation.id]);
      onSelectionChange([annotation.id]);
    }

    // Start drag
    const allAnnotations = Object.values(annotations.pages).flat();
    const selectedAnnotations = allAnnotations.filter(a => 
      (e.shiftKey ? selectedIds : [annotation.id]).includes(a.id)
    );

    // Store initial normalized positions
    const initialPositions = new Map<string, [number, number, number, number]>();
    selectedAnnotations.forEach(ann => {
      initialPositions.set(ann.id, ann.normalizedBox);
    });

    setDragState({
      isDragging: true,
      annotationId: annotation.id,
      startX: e.clientX,
      startY: e.clientY,
      initialPositions,
    });
  }, [mode, selectedIds, annotations, onFieldClick, onSelectionChange]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState.isDragging || !dragState.annotationId) return;

    // Get the page dimensions for the annotation being dragged
    const allAnnotations = Object.values(annotations.pages).flat();
    const annotation = allAnnotations.find(a => a.id === dragState.annotationId);
    if (!annotation) return;

    const pageDim = pageDimensions[annotation.pageIndex];
    if (!pageDim) return;

    // Convert mouse delta from screen pixels to normalized coordinates (0-1000)
    // The page is rendered at dimensions.width * 1.5 pixels, so we need to account for that
    const scaledWidth = pageDim.width * 1.5;
    const scaledHeight = pageDim.height * 1.5;
    
    const deltaX = ((e.clientX - dragState.startX) / zoom / scaledWidth) * 1000;
    const deltaY = ((e.clientY - dragState.startY) / zoom / scaledHeight) * 1000;

    const newAnnotations = { ...annotations };
    
    dragState.initialPositions.forEach((initialBox, id) => {
      const allAnnotations = Object.values(newAnnotations.pages).flat();
      const ann = allAnnotations.find(a => a.id === id);
      if (!ann) return;

      const [ymin, xmin, ymax, xmax] = initialBox;
      const width = xmax - xmin;
      const height = ymax - ymin;

      const newXmin = xmin + deltaX;
      const newYmin = ymin + deltaY;

      ann.normalizedBox = [
        newYmin,
        newXmin,
        newYmin + height,
        newXmin + width,
      ];
    });

    onAnnotationsChange(newAnnotations);
  }, [dragState, zoom, annotations, onAnnotationsChange, pageDimensions]);

  const handleMouseUp = useCallback(() => {
    setDragState({
      isDragging: false,
      annotationId: null,
      startX: 0,
      startY: 0,
      initialPositions: new Map(),
    });
  }, []);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).tagName === 'DIV') {
      setSelectedIds([]);
      onSelectionChange([]);
    }
  }, [onSelectionChange]);

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    
    const newAnnotations = { ...annotations };
    Object.keys(newAnnotations.pages).forEach(pageKey => {
      newAnnotations.pages[pageKey] = newAnnotations.pages[pageKey].filter(
        ann => !selectedIds.includes(ann.id)
      );
    });
    
    onAnnotationsChange(newAnnotations);
    setSelectedIds([]);
    onSelectionChange([]);
  };

  return (
    <div className="flex h-full">
      {/* Toolbar */}
      {mode === 'edit' && (
        <div className="w-12 bg-gray-900 border-r border-gray-800 flex flex-col items-center py-3 gap-2">
          <button
            onClick={() => setActiveTool('select')}
            className={`w-9 h-9 rounded flex items-center justify-center transition-colors ${
              activeTool === 'select' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'
            }`}
            title="Select (V)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
            </svg>
          </button>

          <button
            onClick={() => setActiveTool('pan')}
            className={`w-9 h-9 rounded flex items-center justify-center transition-colors ${
              activeTool === 'pan' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-gray-800'
            }`}
            title="Pan (H)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M18 11V6a2 2 0 00-2-2v0a2 2 0 00-2 2v0M14 10V4a2 2 0 00-2-2v0a2 2 0 00-2 2v2M10 10.5V6a2 2 0 00-2-2v0a2 2 0 00-2 2v8" />
              <path d="M18 8a2 2 0 012 2v4.5a6.5 6.5 0 01-13 0V13a2 2 0 014 0v.5" />
            </svg>
          </button>

          <div className="w-6 h-px bg-gray-700 my-1" />

          <button
            onClick={() => setActiveTool('textbox')}
            className={`w-9 h-9 rounded flex items-center justify-center text-xs font-bold transition-colors ${
              activeTool === 'textbox' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'
            }`}
            title="Text Field"
          >
            T
          </button>

          <button
            onClick={() => setActiveTool('checkbox')}
            className={`w-9 h-9 rounded flex items-center justify-center transition-colors ${
              activeTool === 'checkbox' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:bg-gray-800'
            }`}
            title="Checkbox"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </button>

          <button
            onClick={() => setActiveTool('radio')}
            className={`w-9 h-9 rounded flex items-center justify-center transition-colors ${
              activeTool === 'radio' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:bg-gray-800'
            }`}
            title="Radio Button"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="4" fill="currentColor" />
            </svg>
          </button>

          <div className="flex-1" />

          {selectedIds.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="w-9 h-9 rounded flex items-center justify-center text-red-400 hover:bg-red-900/40 transition-colors"
              title={`Delete ${selectedIds.length} field(s)`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* PDF Viewer */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-gray-800 relative flex items-start justify-center"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleContainerClick}
      >
        <div
          className="inline-block"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
          }}
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
            <div key={pageNum} className="relative mb-4">
              <PDFPage
                pdfDocument={pdfDocument}
                pageNumber={pageNum}
                dimensions={pageDimensions[pageNum]}
                annotations={annotations.pages[pageNum.toString()] || []}
                onAnnotationMouseDown={handleAnnotationMouseDown}
                selectedIds={selectedIds}
                mode={mode}
                fieldValues={fieldValues}
                editingFieldId={editingFieldId}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface PDFPageProps {
  pdfDocument: pdfjsLib.PDFDocumentProxy | null;
  pageNumber: number;
  dimensions?: { width: number; height: number };
  annotations: Annotation[];
  onAnnotationMouseDown: (e: React.MouseEvent, annotation: Annotation) => void;
  selectedIds: string[];
  mode: 'edit' | 'review';
  fieldValues: Record<string, string>;
  editingFieldId: string | null;
}

function PDFPage({
  pdfDocument,
  pageNumber,
  dimensions,
  annotations,
  onAnnotationMouseDown,
  selectedIds,
  mode,
  fieldValues,
  editingFieldId,
}: PDFPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current || !dimensions) return;

    const renderPage = async () => {
      const page = await pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = canvasRef.current!;
      const context = canvas.getContext('2d')!;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport,
      } as any).promise;
    };

    renderPage();
  }, [pdfDocument, pageNumber, dimensions]);

  if (!dimensions) return null;

  return (
    <div className="relative bg-white shadow-lg" style={{ width: dimensions.width * 1.5, height: dimensions.height * 1.5 }}>
      <canvas ref={canvasRef} className="absolute inset-0" />
      <svg
        className="absolute inset-0"
        width={dimensions.width * 1.5}
        height={dimensions.height * 1.5}
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
      >
        {annotations.map(annotation => {
          // Use normalized coordinates directly (0-1000) since viewBox is 0-1000
          const [ymin, xmin, ymax, xmax] = annotation.normalizedBox;
          const isSelected = selectedIds.includes(annotation.id);
          const isEditing = editingFieldId === annotation.id;
          const value = fieldValues[annotation.id];

          let strokeColor = '#3b82f6'; // blue
          let fillColor = 'rgba(59, 130, 246, 0.1)';

          if (mode === 'review') {
            if (isEditing) {
              strokeColor = '#ef4444'; // red
              fillColor = 'rgba(239, 68, 68, 0.1)';
            } else if (value) {
              strokeColor = '#10b981'; // green
              fillColor = 'rgba(16, 185, 129, 0.1)';
            }
          } else if (isSelected) {
            strokeColor = '#ef4444';
            fillColor = 'rgba(239, 68, 68, 0.1)';
          }

          return (
            <g key={annotation.id}>
              <rect
                x={xmin}
                y={ymin}
                width={xmax - xmin}
                height={ymax - ymin}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={isSelected || isEditing ? 2 : 1}
                className="cursor-pointer"
                onMouseDown={(e) => onAnnotationMouseDown(e, annotation)}
              />
              {annotation.label && (isSelected || isEditing) && (
                <text
                  x={xmin}
                  y={ymin - 5}
                  fontSize="10"
                  fill={strokeColor}
                  className="pointer-events-none"
                >
                  {annotation.label}
                </text>
              )}
              {mode === 'review' && value && !isEditing && (
                <text
                  x={xmin + 5}
                  y={ymin + (ymax - ymin) / 2 + 4}
                  fontSize="12"
                  fill="#1f2937"
                  className="pointer-events-none"
                >
                  {value.length > 20 ? value.substring(0, 20) + '...' : value}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
