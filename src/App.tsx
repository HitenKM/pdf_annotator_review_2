import React, { useState, useRef, useEffect } from 'react';
import { PDFAnnotator } from './lib/PDFAnnotator';
import type { AnnotationsJSON, Annotation } from './types';
import { exportToInputFormat } from './types';

export default function App() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationsJSON>({ pages: {} });
  const [showJsonPanel, setShowJsonPanel] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteJsonText, setPasteJsonText] = useState('');
  const [mode, setMode] = useState<'edit' | 'review'>('edit');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPdfFile(file);
    }
  };

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);
          setAnnotations(parsed);
          setJsonError(null);
        } catch (err) {
          setJsonError('Invalid JSON file');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleJsonPaste = (text: string) => {
    try {
      const parsed = JSON.parse(text);
      setAnnotations(parsed);
      setJsonError(null);
    } catch (err) {
      setJsonError('Invalid JSON');
    }
  };

  const handleLoadPastedJson = () => {
    try {
      const parsed = JSON.parse(pasteJsonText);
      
      if (mode === 'review') {
        // In review mode, parse as data JSON
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          // Convert label-based keys to annotation IDs
          const newFieldValues: Record<string, string> = {};
          const allAnnotations = Object.values(annotations.pages).flat();
          
          for (const [key, value] of Object.entries(parsed)) {
            const annotation = allAnnotations.find(a => a.label === key || a.id === key);
            if (annotation && typeof value === 'string') {
              newFieldValues[annotation.id] = value;
            }
          }
          
          setFieldValues(newFieldValues);
          setJsonError(null);
          setShowPasteModal(false);
          setPasteJsonText('');
        } else {
          setJsonError('Data JSON must be an object with field names as keys');
        }
      } else {
        // In edit mode, parse as annotation JSON
        setAnnotations(parsed);
        setJsonError(null);
        setShowPasteModal(false);
        setPasteJsonText('');
      }
    } catch (err) {
      setJsonError('Invalid JSON format');
    }
  };

  const handleFieldClick = (annotationId: string) => {
    if (mode === 'review') {
      setEditingFieldId(annotationId);
    }
  };

  const handleFieldValueChange = (value: string) => {
    if (editingFieldId) {
      if (value.trim() === '') {
        const newValues = { ...fieldValues };
        delete newValues[editingFieldId];
        setFieldValues(newValues);
      } else {
        setFieldValues({ ...fieldValues, [editingFieldId]: value });
      }
    }
  };

  const handleClearEditingField = () => {
    if (editingFieldId) {
      const newValues = { ...fieldValues };
      delete newValues[editingFieldId];
      setFieldValues(newValues);
      setEditingFieldId(null);
    }
  };

  const handleExport = () => {
    let exportData: any;
    let filename: string;

    if (mode === 'review') {
      // Export data JSON
      exportData = {};
      const allAnnotations = Object.values(annotations.pages).flat();
      for (const annotation of allAnnotations) {
        const value = fieldValues[annotation.id];
        if (value !== undefined) {
          const key = annotation.label || annotation.id;
          exportData[key] = value;
        }
      }
      filename = 'data.json';
    } else {
      // Export annotation JSON
      exportData = exportToInputFormat(annotations);
      filename = 'annotations.json';
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleZoomReset = () => setZoom(1);
  const handleFitToWidth = () => setZoom(1);

  const getDataJsonForDisplay = () => {
    const data: Record<string, string> = {};
    const allAnnotations = Object.values(annotations.pages).flat();
    for (const annotation of allAnnotations) {
      const value = fieldValues[annotation.id];
      if (value !== undefined) {
        const key = annotation.label || annotation.id;
        data[key] = value;
      }
    }
    return data;
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        handleZoomReset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const selectedAnnotations: Annotation[] = (() => {
    if (selectedIds.length === 0) return [];
    const p = annotations?.pages;
    if (!p || typeof p !== 'object') return [];
    const result: Annotation[] = [];
    for (const pageAnnotations of Object.values(p)) {
      if (!Array.isArray(pageAnnotations)) continue;
      for (const a of pageAnnotations) {
        if (selectedIds.includes(a.id)) {
          result.push(a);
        }
      }
    }
    return result;
  })();

  const commonType = (() => {
    if (selectedAnnotations.length === 0) return null;
    const types = new Set(selectedAnnotations.map(a => a.type));
    if (types.size === 1) return selectedAnnotations[0].type;
    return null;
  })();

  const allRadios = selectedAnnotations.length > 0 && selectedAnnotations.every(a => a.type === 'radio');

  const commonRadioGroup = (() => {
    if (!allRadios) return null;
    const groups = new Set(selectedAnnotations.map(a => a.radioGroup));
    if (groups.size === 1) {
      const val = selectedAnnotations[0].radioGroup;
      return val || null;
    }
    return null;
  })();

  const updateSelectedLabels = (label: string) => {
    if (selectedAnnotations.length === 0) return;
    const p = annotations?.pages ?? {};
    const newPages: Record<string, Annotation[]> = {};
    for (const [pageKey, pageAnnotations] of Object.entries(p)) {
      if (!Array.isArray(pageAnnotations)) {
        newPages[pageKey] = [];
        continue;
      }
      newPages[pageKey] = pageAnnotations.map(a =>
        selectedIds.includes(a.id)
          ? { ...a, label: label || undefined }
          : a
      );
    }
    setAnnotations({ pages: newPages });
  };

  const updateSelectedType = (type: Annotation['type']) => {
    if (selectedAnnotations.length === 0) return;
    const p = annotations?.pages ?? {};
    const newPages: Record<string, Annotation[]> = {};
    for (const [pageKey, pageAnnotations] of Object.entries(p)) {
      if (!Array.isArray(pageAnnotations)) {
        newPages[pageKey] = [];
        continue;
      }
      newPages[pageKey] = pageAnnotations.map(a =>
        selectedIds.includes(a.id)
          ? { ...a, type, radioGroup: type !== 'radio' ? undefined : a.radioGroup }
          : a
      );
    }
    setAnnotations({ pages: newPages });
  };

  const setRadioGroup = (groupName: string) => {
    if (!allRadios) return;
    const p = annotations?.pages ?? {};
    const newPages: Record<string, Annotation[]> = {};
    for (const [pageKey, pageAnnotations] of Object.entries(p)) {
      if (!Array.isArray(pageAnnotations)) {
        newPages[pageKey] = [];
        continue;
      }
      newPages[pageKey] = pageAnnotations.map(a =>
        selectedIds.includes(a.id)
          ? { ...a, radioGroup: groupName || undefined }
          : a
      );
    }
    setAnnotations({ pages: newPages });
  };

  const pagesObj = annotations?.pages ?? {};
  const totalAnnotations = Object.values(pagesObj).reduce(
    (sum, page) => sum + (Array.isArray(page) ? page.length : 0),
    0
  );
  const totalPages = Object.keys(pagesObj).length;

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden">
      {/* Header */}
      <header className="h-11 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-xs font-semibold text-gray-200">PDF Annotator</h1>
        </div>

        <div className="h-4 w-px bg-gray-700" />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-2.5 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors flex items-center gap-1.5 text-gray-300"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span className="max-w-[120px] truncate">{pdfFile ? pdfFile.name : 'Upload PDF'}</span>
        </button>
        <input ref={fileInputRef} type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" />

        <button
          onClick={() => setShowPasteModal(true)}
          className="px-2.5 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors flex items-center gap-1.5 text-gray-300"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Paste {mode === 'review' ? 'Data' : 'JSON'}
        </button>

        <button
          onClick={() => setShowJsonPanel(!showJsonPanel)}
          className={`px-2.5 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${showJsonPanel ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          {mode === 'review' ? 'Data' : 'JSON'}
        </button>

        {jsonError && (
          <span className="text-xs text-red-400">{jsonError}</span>
        )}

        <div className="flex-1" />

        {/* Mode Switch */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode('edit')}
            className={`px-3 py-1 text-xs rounded-l transition-colors ${mode === 'edit' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            Edit
          </button>
          <button
            onClick={() => setMode('review')}
            className={`px-3 py-1 text-xs rounded-r transition-colors ${mode === 'review' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            Review
          </button>
        </div>

        <div className="h-4 w-px bg-gray-700" />

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{totalPages} page{totalPages !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>{totalAnnotations} field{totalAnnotations !== 1 ? 's' : ''}</span>
          {mode === 'edit' && selectedIds.length > 0 && (
            <>
              <span>·</span>
              <span className="text-blue-400">{selectedIds.length} selected</span>
            </>
          )}
          {mode === 'review' && Object.keys(fieldValues).length > 0 && (
            <>
              <span>·</span>
              <span className="text-emerald-400">{Object.keys(fieldValues).length} filled</span>
            </>
          )}
        </div>

        <div className="h-4 w-px bg-gray-700" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            className="w-6 h-6 flex items-center justify-center text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Zoom Out"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M20 12H4" />
            </svg>
          </button>
          
          <select
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500 min-w-[60px]"
          >
            <option value={0.5}>50%</option>
            <option value={0.75}>75%</option>
            <option value={1}>100%</option>
            <option value={1.25}>125%</option>
            <option value={1.5}>150%</option>
            <option value={2}>200%</option>
            <option value={2.5}>250%</option>
            <option value={3}>300%</option>
          </select>
          
          <button
            onClick={handleZoomIn}
            disabled={zoom >= 3}
            className="w-6 h-6 flex items-center justify-center text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Zoom In"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M12 4v16m8-8H4" />
            </svg>
          </button>
          
          <button
            onClick={handleZoomReset}
            className="w-6 h-6 flex items-center justify-center text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
            title="Reset Zoom"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          
          <button
            onClick={handleFitToWidth}
            className="w-6 h-6 flex items-center justify-center text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
            title="Fit to Width"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>

        <div className="h-4 w-px bg-gray-700" />

        <button
          onClick={handleExport}
          className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors flex items-center gap-1.5 font-medium"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          <PDFAnnotator
            pdfFile={pdfFile}
            annotations={annotations}
            onAnnotationsChange={setAnnotations}
            onSelectionChange={setSelectedIds}
            zoom={zoom}
            mode={mode}
            fieldValues={fieldValues}
            onFieldClick={handleFieldClick}
            editingFieldId={editingFieldId}
          />

          {/* Properties Panel (floating at bottom) */}
          {mode === 'edit' && selectedAnnotations.length > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl shadow-black/50 px-4 py-2.5 flex items-center gap-3 z-10 max-w-[90vw]">
              <div className="text-[10px] text-blue-400 font-medium whitespace-nowrap">
                {selectedAnnotations.length} selected
              </div>

              <div className="h-5 w-px bg-gray-700" />

              {selectedAnnotations.length === 1 && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Label</span>
                    <input
                      type="text"
                      value={selectedAnnotations[0].label || ''}
                      onChange={(e) => updateSelectedLabels(e.target.value)}
                      placeholder="Field label..."
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 w-32 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all"
                    />
                  </div>
                  <div className="h-5 w-px bg-gray-700" />
                </>
              )}

              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">Type</span>
                <select
                  value={commonType || ''}
                  onChange={(e) => updateSelectedType(e.target.value as Annotation['type'])}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-blue-500 transition-all"
                >
                  <option value="" disabled>Mixed</option>
                  <option value="textbox">Textbox</option>
                  <option value="checkbox">Checkbox</option>
                  <option value="radio">Radio</option>
                </select>
              </div>

              {allRadios && selectedAnnotations.length > 1 && (
                <>
                  <div className="h-5 w-px bg-gray-700" />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-amber-500 font-medium">Radio Group</span>
                    <input
                      type="text"
                      value={commonRadioGroup || ''}
                      onChange={(e) => setRadioGroup(e.target.value)}
                      placeholder="Group name..."
                      className="bg-gray-800 border border-amber-700/50 rounded px-2 py-1 text-xs text-gray-100 w-28 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all"
                    />
                    {commonRadioGroup && (
                      <button
                        onClick={() => setRadioGroup('')}
                        className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                        title="Ungroup"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </>
              )}

              {selectedAnnotations.length === 1 && (
                <>
                  <div className="h-5 w-px bg-gray-700" />
                  <div className="text-[10px] text-gray-500 font-mono tracking-tight whitespace-nowrap">
                    [{selectedAnnotations[0].normalizedBox.join(', ')}]
                  </div>
                </>
              )}
            </div>
          )}

          {/* Review Mode: Field Editing Panel */}
          {mode === 'review' && editingFieldId && (() => {
            const allAnnotations = Object.values(annotations.pages).flat();
            const annotation = allAnnotations.find(a => a.id === editingFieldId);
            if (!annotation) return null;
            
            return (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl shadow-black/50 px-4 py-3 flex items-center gap-3 z-10">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                    {annotation.label || 'Field'}
                  </span>
                  <input
                    type="text"
                    value={fieldValues[editingFieldId] || ''}
                    onChange={(e) => handleFieldValueChange(e.target.value)}
                    placeholder="Enter value..."
                    autoFocus
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 w-48 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all"
                  />
                </div>
                <button
                  onClick={handleClearEditingField}
                  className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                  title="Clear"
                >
                  Clear
                </button>
                <button
                  onClick={() => setEditingFieldId(null)}
                  className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            );
          })()}
        </div>

        {/* JSON Panel */}
        {showJsonPanel && (
          <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0">
            <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider font-medium text-gray-400">
                {mode === 'review' ? 'Data JSON' : 'Annotations JSON'}
              </span>
              <button
                onClick={() => setShowJsonPanel(false)}
                className="text-gray-600 hover:text-gray-300 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <textarea
              value={
                mode === 'review'
                  ? JSON.stringify(getDataJsonForDisplay(), null, 2)
                  : JSON.stringify(annotations, null, 2)
              }
              onChange={(e) => {
                if (mode === 'review') {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                      const newFieldValues: Record<string, string> = {};
                      const allAnnotations = Object.values(annotations.pages).flat();
                      for (const [key, value] of Object.entries(parsed)) {
                        const annotation = allAnnotations.find(a => a.label === key || a.id === key);
                        if (annotation && typeof value === 'string') {
                          newFieldValues[annotation.id] = value;
                        }
                      }
                      setFieldValues(newFieldValues);
                    }
                  } catch {
                    // Ignore invalid JSON while typing
                  }
                } else {
                  handleJsonPaste(e.target.value);
                }
              }}
              className="flex-1 bg-gray-950 text-gray-300 text-[11px] font-mono p-3 resize-none focus:outline-none leading-relaxed"
              spellCheck={false}
            />
          </div>
        )}
      </div>

      {/* Paste JSON Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[600px] max-h-[80vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-200">
                {mode === 'review' ? 'Paste Data JSON' : 'Paste JSON Annotations'}
              </h2>
              <button
                onClick={() => {
                  setShowPasteModal(false);
                  setPasteJsonText('');
                  setJsonError(null);
                }}
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 p-4 overflow-auto">
              <textarea
                value={pasteJsonText}
                onChange={(e) => setPasteJsonText(e.target.value)}
                placeholder={
                  mode === 'review'
                    ? 'Paste your data JSON here...\n\nExample:\n{\n  "Field Name": "Value",\n  "Another Field": "Another Value"\n}'
                    : 'Paste your JSON here...\n\nExample:\n{\n  "pages": {\n    "1": [\n      {\n        "id": "field1",\n        "type": "textbox",\n        "normalizedBox": [100, 200, 150, 300],\n        "label": "Field Name",\n        "pageIndex": 1\n      }\n    ]\n  }\n}'
                }
                className="w-full h-64 bg-gray-950 text-gray-300 text-xs font-mono p-3 rounded border border-gray-700 focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
                spellCheck={false}
                autoFocus
              />
              {jsonError && (
                <div className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {jsonError}
                </div>
              )}
              <div className="mt-3 text-[10px] text-gray-500">
                {mode === 'review' ? (
                  <>
                    <p className="font-medium text-gray-400 mb-1">Data JSON format:</p>
                    <ul className="space-y-0.5 list-disc list-inside">
                      <li>Object with field names as keys</li>
                      <li>Values are the field values to display</li>
                      <li>Keys match field labels from annotations</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-gray-400 mb-1">Annotation JSON format:</p>
                    <ul className="space-y-0.5 list-disc list-inside">
                      <li>Object with "pages" property</li>
                      <li>Each page contains array of field objects</li>
                      <li>Required: id, type, normalizedBox, pageIndex</li>
                      <li>Optional: label, radioGroup</li>
                    </ul>
                  </>
                )}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowPasteModal(false);
                  setPasteJsonText('');
                  setJsonError(null);
                }}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLoadPastedJson}
                disabled={!pasteJsonText.trim()}
                className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded transition-colors font-medium"
              >
                Load JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
