// src/PatentFiling/SendCorrectionModal.jsx
// Auditor modal to send a filing for correction with mandatory description & clipboard image support

import React, { useState } from 'react';
import { X, AlertCircle, UploadCloud, Trash2, RotateCcw, Image as ImageIcon } from 'lucide-react';

export default function SendCorrectionModal({
  isOpen,
  onClose,
  onSubmit,
  filing
}) {
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !filing) return null;

  // Handle image paste from clipboard
  const handlePaste = (e) => {
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          processFile(file);
        }
      }
    }
  };

  const processFile = (file) => {
    if (file.size > 5 * 1024 * 1024) {
      setError(`File "${file.name}" exceeds 5MB size limit.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      setAttachments(prev => [
        ...prev,
        {
          name: file.name || `Pasted_Issue_${Date.now()}.png`,
          size: file.size,
          type: file.type || 'image/png',
          preview: uploadEvent.target.result,
          url: uploadEvent.target.result
        }
      ]);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => processFile(f));
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanDesc = description.trim();
    if (!cleanDesc) {
      setError('Correction description is strictly required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onSubmit({
        description: cleanDesc,
        attachments
      });

      if (res && res.error) {
        setError(res.error);
      } else {
        setDescription('');
        setAttachments([]);
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to submit correction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        onPaste={handlePaste}
        className="relative w-full max-w-lg bg-[#070e28] border border-amber-500/30 rounded-3xl p-6 md:p-8 shadow-2xl text-slate-100 flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <RotateCcw size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Send for Correction</h2>
              <p className="text-xs text-amber-300 font-mono">
                {filing.code} — Round {(filing.correction_count || 0) + 1}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1.5">
              Specific Deficiencies & Required Corrections <span className="text-red-400">*</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Detail all issues found during audit (e.g., Claim 1 ambiguity, missing reference numerals in Figure 2, specification formatting)..."
              rows={5}
              className="w-full glass-input text-xs leading-relaxed"
              required
            />
          </div>

          {/* Image Attachments & Paste Target */}
          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1.5 flex items-center justify-between">
              <span>Correction Screenshots / References (Optional)</span>
              <span className="text-[10px] text-amber-300 font-normal">Supports Ctrl+V Paste</span>
            </label>

            {/* Dropzone */}
            <label className="border-2 border-dashed border-white/15 hover:border-amber-400/50 rounded-2xl p-4 flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer transition bg-white/5 hover:bg-white/10">
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileInput}
                className="hidden"
              />
              <UploadCloud size={24} className="text-amber-400 mb-0.5" />
              <span className="text-xs font-semibold text-slate-200">
                Click to browse or paste screenshot directly here
              </span>
              <span className="text-[10px] text-slate-400">PNG, JPG, WEBP up to 5MB each</span>
            </label>

            {/* Attachment Previews */}
            {attachments.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {attachments.map((att, idx) => (
                  <div key={idx} className="relative group rounded-xl overflow-hidden border border-white/15 h-20 bg-black/40">
                    <img src={att.preview} alt="Attached" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="absolute top-1 right-1 p-1 rounded-md bg-black/70 text-red-400 hover:text-white transition"
                    >
                      <Trash2 size={12} />
                    </button>
                    <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[9px] text-slate-200 px-1 py-0.5 truncate">
                      {att.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl flex items-center gap-1.5 shadow-lg transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Sending...' : 'Send for Correction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
