import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Layers, 
  Plus, 
  Trash2, 
  Zap, 
  ArrowUp, 
  ArrowDown, 
  Save, 
  X, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  Tag,
  BookmarkPlus,
  Wrench,
  ChevronDown,
  Search,
  Check
} from 'lucide-react';
import { SkuV2, updateSkuV2 } from '../../api/mfgApiV2';
import { showToast } from '../ui/Toast';

export interface ProcessStepItem {
  id: string;
  stepName: string;
  machine: string;
  notes?: string;
}

interface ManufacturingStepsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sku: SkuV2 | null;
  companyId: string;
  onSaveSuccess?: (updatedSku: SkuV2) => void;
}

export interface SuggestionOption {
  name: string;
  category?: string;
}

export const SUGGESTED_OPERATIONS: SuggestionOption[] = [
  { name: 'Reel Slitting', category: 'Paper Prep' },
  { name: 'Paper Ruling', category: 'Ruling & Printing' },
  { name: 'Sheet Cutting', category: 'Cutting' },
  { name: 'Section Folding', category: 'Folding' },
  { name: 'Wire Stitching', category: 'Binding & Stitching' },
  { name: 'Center Pinning', category: 'Binding & Stitching' },
  { name: 'Perfect Binding', category: 'Binding & Stitching' },
  { name: 'Hardcover Case Binding', category: 'Binding & Stitching' },
  { name: 'Section Sewing', category: 'Binding & Stitching' },
  { name: 'Cover Lamination', category: 'Finishing' },
  { name: 'Gold Foil Stamping', category: 'Finishing' },
  { name: 'Spot UV Coating', category: 'Finishing' },
  { name: 'Embossing / Debossing', category: 'Finishing' },
  { name: 'Corner Rounding', category: 'Finishing' },
  { name: 'Index Tab Cutting', category: 'Finishing' },
  { name: 'Three Knife Trimming', category: 'Trimming' },
  { name: 'Shrink Packaging', category: 'Packaging' },
  { name: 'Box Packing & Labelling', category: 'Packaging' },
  { name: 'Manual Inspection', category: 'Quality Control' }
];

/** Clean, Modern Searchable Autocomplete Dropdown Component */
export const CleanProcessDropdownInput: React.FC<{
  value: string;
  onChange: (val: string) => void;
  onSelectOption?: (option: SuggestionOption) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, onSelectOption, placeholder, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = SUGGESTED_OPERATIONS.filter(op => 
    !value || op.name.toLowerCase().includes(value.toLowerCase()) || (op.category && op.category.toLowerCase().includes(value.toLowerCase()))
  );

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className={`${className} pr-7`}
          autoComplete="off"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsOpen(prev => !prev)}
          className="absolute right-2 text-gray-400 hover:text-gray-600 cursor-pointer p-0.5"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180 text-blue-600' : ''}`} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200/90 rounded-2xl shadow-xl z-[150] max-h-56 overflow-y-auto p-1.5 animate-fadeIn space-y-0.5">
          {filteredOptions.length === 0 ? (
            <div className="p-3 text-center text-xs text-gray-500">
              <span className="font-semibold text-gray-700 block">Custom Process: "{value}"</span>
              <span className="text-[10.5px] text-gray-400">Press Add to use this custom operation name.</span>
            </div>
          ) : (
            <>
              <div className="px-2 py-1 text-[9.5px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 flex items-center justify-between">
                <span>Suggested Operations & Routing</span>
                <span className="text-[9px] text-blue-600 font-normal">Click to select</span>
              </div>
              {filteredOptions.map((item, idx) => {
                const name = typeof item === 'string' ? item : item.name;
                const category = typeof item === 'object' ? item.category : '';
                const isSelected = value.toLowerCase().trim() === name.toLowerCase().trim();

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (typeof item === 'string') {
                        onChange(item);
                      } else {
                        onChange(item.name);
                        if (onSelectOption) onSelectOption(item);
                      }
                      setIsOpen(false);
                    }}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-gray-700 hover:bg-slate-50 hover:text-blue-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate font-semibold">{name}</span>
                      {category && (
                        <span className="text-[10px] text-gray-400 truncate font-normal">({category})</span>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-blue-600 shrink-0 ml-1.5" />
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const ManufacturingStepsModal: React.FC<ManufacturingStepsModalProps> = ({
  isOpen,
  onClose,
  sku,
  companyId,
  onSaveSuccess
}) => {
  const [steps, setSteps] = useState<ProcessStepItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Quick custom input state
  const [customStepName, setCustomStepName] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  
  // Custom user presets stored in localStorage
  const [customPresets, setCustomPresets] = useState<{ name: string }[]>(() => {
    try {
      const saved = localStorage.getItem(`mfg_custom_presets_${companyId || 'default'}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Initialize steps whenever modal opens or SKU changes
  useEffect(() => {
    if (!isOpen || !sku) return;

    const rawSteps = (sku as any).processSteps || 
                     (sku as any).manufacturingSteps || 
                     (sku as any).routing || 
                     (sku as any).steps || 
                     [];

    if (Array.isArray(rawSteps) && rawSteps.length > 0) {
      const parsed: ProcessStepItem[] = rawSteps.map((st: any, idx: number) => {
        if (typeof st === 'string') {
          return {
            id: `step_${idx}_${Date.now()}`,
            stepName: st.trim(),
            machine: '',
            notes: ''
          };
        }
        return {
          id: st.id || st._id || `step_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          stepName: String(st.stepName || st.name || st.title || st.step || `Step ${idx + 1}`).trim(),
          machine: String(st.machine || st.machineName || st.workCenter || '').trim(),
          notes: String(st.notes || st.instructions || '').trim()
        };
      });
      setSteps(parsed);
    } else {
      setSteps([]);
    }
    setErrorMsg(null);
    setCustomStepName('');
    setCustomNotes('');
  }, [isOpen, sku]);

  if (!isOpen || !sku) return null;

  const handleAddStep = (defaultName: any = '', defaultMachine: any = '', notes: any = '') => {
    const nameStr = typeof defaultName === 'string' ? defaultName : '';
    const machineStr = typeof defaultMachine === 'string' ? defaultMachine : '';
    const notesStr = typeof notes === 'string' ? notes : '';
    setSteps(prev => [
      ...prev,
      {
        id: `step_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        stepName: nameStr,
        machine: machineStr,
        notes: notesStr
      }
    ]);
  };

  const handleAddCustomInputStep = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customStepName.trim()) {
      showToast('Please enter a process step name', 'error');
      return;
    }
    handleAddStep(customStepName.trim(), '', customNotes.trim());
    setCustomStepName('');
    setCustomNotes('');
    showToast('Custom process step added to sequence', 'success');
  };

  const handleSaveAsCustomPreset = () => {
    if (!customStepName.trim()) {
      showToast('Enter a process name to save as preset', 'error');
      return;
    }
    const newPreset = {
      name: customStepName.trim()
    };
    const updated = [...customPresets.filter(p => p.name.toLowerCase() !== newPreset.name.toLowerCase()), newPreset];
    setCustomPresets(updated);
    try {
      localStorage.setItem(`mfg_custom_presets_${companyId || 'default'}`, JSON.stringify(updated));
      showToast(`Saved "${newPreset.name}" to your Custom Presets library`, 'success');
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteCustomPreset = (nameToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customPresets.filter(p => p.name !== nameToDelete);
    setCustomPresets(updated);
    try {
      localStorage.setItem(`mfg_custom_presets_${companyId || 'default'}`, JSON.stringify(updated));
      showToast(`Removed from custom presets`, 'info');
    } catch (e) {
      console.error(e);
    }
  };

  const handleLoadStandardSteps = () => {
    const standard: ProcessStepItem[] = [
      { id: `step_${Date.now()}_1`, stepName: 'Reel Slitting', machine: 'Slitter Rewinder 01', notes: '' },
      { id: `step_${Date.now()}_2`, stepName: 'Paper Ruling', machine: 'Automatic Ruling Line', notes: '' },
      { id: `step_${Date.now()}_3`, stepName: 'Section Folding', machine: 'Folding Machine (MBO)', notes: '' },
      { id: `step_${Date.now()}_4`, stepName: 'Wire Stitching', machine: 'Stitching Machine', notes: '' },
      { id: `step_${Date.now()}_5`, stepName: 'Cover Lamination', machine: 'Thermal Laminator', notes: '' },
      { id: `step_${Date.now()}_6`, stepName: 'Three Knife Trimming', machine: 'Three Knife Trimmer', notes: '' },
      { id: `step_${Date.now()}_7`, stepName: 'Shrink Packaging', machine: 'Automatic Shrink Tunnel', notes: '' }
    ];
    setSteps(standard);
    showToast('Standard book production routing loaded', 'info');
  };

  const updateStep = (id: string, field: 'stepName' | 'machine' | 'notes', value: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const removeStep = (id: string) => {
    setSteps(prev => prev.filter(s => s.id !== id));
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    setSteps(prev => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const handleSave = async () => {
    if (!sku?._id) {
      setErrorMsg('Invalid SKU identifier');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMsg(null);

      // Clean steps before saving
      const cleanedSteps = steps
        .map((s, idx) => ({
          stepNumber: idx + 1,
          stepName: (s.stepName || '').trim(),
          machine: (s.machine || '').trim(),
          notes: (s.notes || '').trim()
        }))
        .filter(s => s.stepName.length > 0);

      const compId = companyId || (typeof (sku as any).company === 'object' ? (sku as any).company?._id : (sku as any).company);

      const updatePayload: any = {
        processSteps: cleanedSteps,
        company: compId
      };

      const updated = await updateSkuV2(sku._id, updatePayload);
      showToast('Manufacturing process routing steps saved successfully!', 'success');

      const resolvedSku = {
        ...(typeof updated === 'object' && updated._id ? updated : sku),
        processSteps: cleanedSteps
      };

      if (onSaveSuccess) {
        onSaveSuccess(resolvedSku);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to update process steps:', err);
      setErrorMsg(err?.response?.data?.message || err.message || 'Failed to save process steps');
    } finally {
      setIsSaving(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-fadeIn">
      <div 
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col h-[85vh] max-h-[750px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-blue-50/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs shadow-blue-500/20">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-gray-900">Manufacturing Process Routing</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  {sku.skuCode}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">
                {sku.name} • <span className="font-semibold text-gray-700">{sku.category || 'Finished Goods'}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-3.5 flex-1 min-h-0">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Custom Process Creator Form Box */}
          <div className="bg-gradient-to-br from-blue-50/50 via-white to-indigo-50/40 border border-blue-200/80 rounded-2xl p-3 sm:p-3.5 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-lg bg-blue-600 text-white">
                  <Wrench className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-gray-900">Define Any Custom Process Operation</span>
              </div>
              <span className="text-[9.5px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60">
                Custom Operation
              </span>
            </div>

            <form onSubmit={handleAddCustomInputStep} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-10">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Process Operation Name *
                </label>
                <CleanProcessDropdownInput
                  value={customStepName}
                  onChange={(val) => setCustomStepName(val)}
                  placeholder="e.g. Reel Slitting, Paper Ruling, Section Folding, Wire Stitching, Cover Lamination"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl font-semibold text-gray-800 shadow-2xs"
                />
              </div>

              <div className="sm:col-span-2 flex items-end gap-1 pt-1 sm:pt-0">
                <button
                  type="submit"
                  className="flex-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 shadow-xs shadow-blue-500/20 cursor-pointer transition-all"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
                {customStepName.trim() && (
                  <button
                    type="button"
                    onClick={handleSaveAsCustomPreset}
                    className="p-1.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl cursor-pointer transition-all shadow-2xs"
                    title="Save to My Presets library for future reuse"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </form>

            {/* User's Saved Custom Presets */}
            {customPresets.length > 0 && (
              <div className="pt-2 border-t border-blue-100/60 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold text-indigo-600 flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  <span>My Saved Custom Presets:</span>
                </span>
                {customPresets.map((cp) => (
                  <div
                    key={cp.name}
                    onClick={() => handleAddStep(cp.name, cp.machine)}
                    className="group inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-[10.5px] font-semibold cursor-pointer transition-all shadow-2xs"
                  >
                    <span>+ {cp.name}</span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteCustomPreset(cp.name, e)}
                      className="p-0.5 text-indigo-400 hover:text-rose-600 rounded cursor-pointer"
                      title="Delete preset"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Standard Presets Bar */}
          <div className="p-3 bg-gray-50/80 border border-gray-200/70 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                <Sparkles className="w-3 h-3 text-blue-600" />
                <span>Industry Standard Presets:</span>
              </div>
              <button
                type="button"
                onClick={handleLoadStandardSteps}
                className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-lg text-[10.5px] flex items-center gap-1.5 border border-amber-200/80 transition-all cursor-pointer shadow-2xs"
                title="Load full 7-step standard book production sequence"
              >
                <Zap className="w-3 h-3 text-amber-600" />
                <span>Load 7 Standard Steps</span>
              </button>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {SUGGESTED_OPERATIONS.slice(0, 9).map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handleAddStep(preset.name, preset.machine)}
                  className="px-2 py-0.5 bg-white hover:bg-blue-50 text-gray-700 hover:text-blue-700 border border-gray-200 hover:border-blue-300 rounded-lg text-[10.5px] font-medium transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <Plus className="w-2.5 h-2.5 text-blue-500" />
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Steps Pipeline List */}
          {steps.length === 0 ? (
            <div
              onClick={() => handleAddStep()}
              className="p-6 border-2 border-dashed border-gray-200 hover:border-blue-300 bg-gray-50/50 hover:bg-blue-50/30 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
            >
              <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 group-hover:text-blue-600 group-hover:border-blue-300 transition-colors shadow-2xs mb-2">
                <Plus className="w-4 h-4" />
              </div>
              <h4 className="text-xs font-bold text-gray-700 group-hover:text-blue-700">No process steps added yet</h4>
              <p className="text-[11px] text-gray-400 mt-0.5 max-w-sm">
                Use the custom form above or click here to add your custom steps.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  ACTIVE ROUTING PIPELINE ({steps.length} {steps.length === 1 ? 'OPERATION' : 'OPERATIONS'})
                </span>
                <button
                  type="button"
                  onClick={() => handleAddStep()}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Blank Row</span>
                </button>
              </div>

              <div className="grid grid-cols-12 gap-2 px-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-9">PROCESS OPERATION NAME *</div>
                <div className="col-span-2 text-right">ACTION</div>
              </div>

              {steps.map((step, sIdx) => (
                <div
                  key={step.id}
                  className="grid grid-cols-12 gap-2 items-center bg-gray-50/70 hover:bg-white p-2 rounded-xl border border-gray-200/80 transition-all shadow-2xs hover:shadow-xs"
                >
                  {/* Step Number */}
                  <div className="col-span-1 flex items-center justify-center">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 shadow-2xs">
                      {sIdx + 1}
                    </span>
                  </div>

                  {/* Step Name with Clean Custom Dropdown */}
                  <div className="col-span-9">
                    <CleanProcessDropdownInput
                      value={step.stepName || ''}
                      onChange={(val) => updateStep(step.id, 'stepName', val)}
                      placeholder="Custom Process Step Name (e.g. Reel Slitting, Ruling, Folding, Stitching)"
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Actions (Reorder & Delete) */}
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <button
                      type="button"
                      disabled={sIdx === 0}
                      onClick={() => moveStep(sIdx, 'up')}
                      className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed hover:bg-gray-200/80 rounded-lg transition-colors cursor-pointer"
                      title="Move Up in sequence"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={sIdx === steps.length - 1}
                      onClick={() => moveStep(sIdx, 'down')}
                      className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed hover:bg-gray-200/80 rounded-lg transition-colors cursor-pointer"
                      title="Move Down in sequence"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStep(step.id)}
                      className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer ml-0.5"
                      title="Delete Step"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/90 flex items-center justify-between shrink-0">
          <div className="text-xs font-semibold text-gray-500">
            {steps.length} {steps.length === 1 ? 'Step' : 'Steps'} in Pipeline
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition-all cursor-pointer shadow-2xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs shadow-blue-500/20 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Process Routing'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
