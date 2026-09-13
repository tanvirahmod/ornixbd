import { useRef, useState } from 'react';
import { Upload, X, Loader2, ImagePlus } from 'lucide-react';
import { uploadToImageKit, ikImage } from '../lib/imagekit';

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  folder?: 'products' | 'categories' | 'hero';
  label?: string;
  /** Visual variant: compact row (product image lists) or large block (hero/category) */
  variant?: 'row' | 'block';
}

export default function ImageUploader({
  value,
  onChange,
  folder = 'products',
  label,
  variant = 'row',
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPG, PNG, WebP...).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image is too large. Maximum 10 MB.');
      return;
    }
    setError('');
    setUploading(true);
    try {
      const { url } = await uploadToImageKit(file, folder);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const clear = () => {
    onChange('');
    setError('');
  };

  const uploadButton = (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={uploading}
      className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-2xl transition-all text-sm font-semibold disabled:opacity-60 ${
        dragOver ? 'border-brand-400 bg-brand-50 text-brand-600' : 'border-stone-300 text-stone-500 hover:border-brand-400 hover:text-brand-600'
      } ${variant === 'row' ? 'flex-1 px-4 py-2.5' : 'w-full py-8'}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
    >
      {uploading ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
      ) : variant === 'row' ? (
        <><Upload className="w-4 h-4" /> Upload image</>
      ) : (
        <><ImagePlus className="w-6 h-6" /> Click or drop an image here</>
      )}
    </button>
  );

  return (
    <div>
      {label && <label className="block text-sm font-medium text-stone-700 mb-1.5">{label}</label>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {variant === 'row' ? (
        <div className="flex items-center gap-2">
          {value ? (
            <div className="relative w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden border border-stone-200 bg-stone-50">
              <img src={ikImage(value, 200)} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={clear}
                disabled={uploading}
                className="absolute top-0.5 right-0.5 bg-black/60 hover:bg-red-500 text-white rounded-full p-0.5 transition-colors"
                aria-label="Remove image"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : null}
          {uploadButton}
        </div>
      ) : (
        <div className="space-y-2">
          {value ? (
            <div className="relative rounded-2xl overflow-hidden border border-stone-200 bg-stone-50 aspect-video">
              <img src={ikImage(value, 800)} alt="" className="w-full h-full object-cover" />
              <div className="absolute top-2 right-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                  className="bg-black/60 hover:bg-black/80 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={clear}
                  disabled={uploading}
                  className="bg-black/60 hover:bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : null}
          {(!value || uploading) && uploadButton}
        </div>
      )}

      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
}
