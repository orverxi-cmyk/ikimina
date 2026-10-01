'use client';

import { useRef, useState, useTransition } from 'react';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { initializeFirebase } from '@/firebase';
import { updateMemberProfileAction } from '@/lib/finance-client';
import { Camera, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface AvatarUploadProps {
  uid: string;
  currentPhotoURL?: string | null;
  displayName?: string | null;
  /** Diameter in px (default 80) */
  size?: number;
  /** Called with the new download URL after a successful upload */
  onUploadSuccess?: (url: string) => void;
}

export function AvatarUpload({
  uid,
  currentPhotoURL,
  displayName,
  size = 80,
  onUploadSuccess,
}: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'saving' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const initials = displayName
    ? displayName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const photoSrc = preview ?? currentPhotoURL ?? null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type and size (max 5 MB)
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select an image file.');
      setStatus('error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Image must be smaller than 5 MB.');
      setStatus('error');
      return;
    }

    // Local preview
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setErrorMsg(null);
    setStatus('uploading');
    setProgress(0);

    const { app } = initializeFirebase();
    const storage = getStorage(app);
    const storageRef = ref(storage, `avatars/${uid}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file, { contentType: file.type });

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        setProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
      },
      (error) => {
        setErrorMsg(error.message || 'Upload failed.');
        setStatus('error');
        setProgress(null);
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
          setStatus('saving');
          setProgress(null);
          startTransition(async () => {
            try {
              await updateMemberProfileAction(uid, { photoURL: downloadURL });
              setStatus('done');
              onUploadSuccess?.(downloadURL);
              // Reset to idle after a moment
              setTimeout(() => setStatus('idle'), 2500);
            } catch (err: any) {
              setErrorMsg(err.message || 'Failed to save avatar.');
              setStatus('error');
            }
          });
        });
      }
    );
  }

  const ringColor =
    status === 'done' ? 'ring-green-500' :
    status === 'error' ? 'ring-red-500' :
    status === 'uploading' || status === 'saving' ? 'ring-primary' :
    'ring-border';

  return (
    <div className="relative inline-block group" style={{ width: size, height: size }}>
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={status === 'uploading' || status === 'saving'}
      />

      {/* Avatar circle */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status === 'uploading' || status === 'saving'}
        className={`relative w-full h-full rounded-full overflow-hidden ring-2 ${ringColor} transition-all duration-300 focus:outline-none focus:ring-primary focus:ring-offset-2 focus:ring-offset-background`}
        aria-label="Change profile photo"
        title="Click to change profile photo"
        style={{ width: size, height: size }}
      >
        {photoSrc ? (
          <img
            src={photoSrc}
            alt={displayName ?? 'Avatar'}
            className="w-full h-full object-cover"
            style={{ width: size, height: size }}
          />
        ) : (
          <span
            className="flex items-center justify-center w-full h-full bg-gradient-to-br from-primary/80 to-primary text-primary-foreground font-bold select-none"
            style={{ fontSize: Math.max(14, size * 0.35) }}
          >
            {initials}
          </span>
        )}

        {/* Hover overlay */}
        <span className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none rounded-full">
          <Camera className="text-white" style={{ width: size * 0.3, height: size * 0.3 }} />
        </span>
      </button>

      {/* Progress ring overlay */}
      {status === 'uploading' && progress !== null && (
        <svg
          className="absolute inset-0 pointer-events-none -rotate-90"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={(size / 2) - 2}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="2.5"
            strokeDasharray={`${2 * Math.PI * ((size / 2) - 2)}`}
            strokeDashoffset={`${2 * Math.PI * ((size / 2) - 2) * (1 - progress / 100)}`}
            strokeLinecap="round"
            className="transition-all duration-150"
          />
        </svg>
      )}

      {/* Status badge */}
      {(status === 'saving' || status === 'done' || status === 'error') && (
        <span className="absolute -bottom-1 -right-1 rounded-full bg-background border border-border p-0.5 flex items-center justify-center shadow-sm">
          {status === 'saving' && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />}
          {status === 'done' && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
          {status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
        </span>
      )}

      {/* Error tooltip */}
      {status === 'error' && errorMsg && (
        <div
          className="absolute left-1/2 -translate-x-1/2 mt-1 w-max max-w-[200px] rounded-md bg-destructive text-destructive-foreground text-[11px] font-medium px-2 py-1 shadow-lg z-10 text-center"
          style={{ top: size + 8 }}
        >
          {errorMsg}
        </div>
      )}
    </div>
  );
}
