import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useBoard } from '../store/useStore';
import { store } from '../store/boardStore';

interface Props {
  value: string;
  onChange: (color: string) => void;
  size?: 'sm' | 'md';
}

export function ColorPicker({ value, onChange, size = 'sm' }: Props) {
  const { state } = useBoard();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const sizeClass = size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';

  const updatePos = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, updatePos]);

  const handleSaveColor = () => {
    store.addSavedColor(value);
  };

  const handleRemoveColor = (color: string, e: React.MouseEvent) => {
    e.stopPropagation();
    store.removeSavedColor(color);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={`${sizeClass} rounded-lg border-2 border-slate-200 hover:border-primary cursor-pointer transition shrink-0`}
        style={{ backgroundColor: value }}
        title="Click to pick color"
      />

      {open && createPortal(
        <div
          ref={popupRef}
          className="fixed z-[9999] bg-white rounded-xl shadow-xl border border-slate-200 p-3 w-56"
          style={{ top: pos.top, left: pos.left }}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        >
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Saved Palette</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {state.savedColors.map(color => (
              <div key={color} className="relative group/swatch">
                <button
                  onClick={() => { onChange(color); }}
                  className={`w-7 h-7 rounded-lg border-2 transition ${
                    value === color ? 'border-primary scale-110 shadow-sm' : 'border-transparent hover:border-slate-300'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
                <button
                  onClick={(e) => handleRemoveColor(color, e)}
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white rounded-full text-[8px] leading-none flex items-center justify-center opacity-0 group-hover/swatch:opacity-100 transition-opacity"
                  title="Remove from palette"
                >
                  &times;
                </button>
              </div>
            ))}
            {state.savedColors.length === 0 && (
              <p className="text-[10px] text-slate-400 italic">No saved colors yet</p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-2.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Custom Color</p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={value}
                onChange={e => onChange(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border-none"
              />
              <span className="text-xs text-slate-500 font-mono flex-1">{value}</span>
              <button
                onClick={handleSaveColor}
                className="text-[10px] bg-primary/10 text-primary px-2 py-1 rounded-md font-medium hover:bg-primary/20 transition"
                title="Save to palette"
              >
                Save
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
