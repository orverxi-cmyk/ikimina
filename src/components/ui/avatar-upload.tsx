'use client';

import { useRef, useState, useTransition } from 'react';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getAuth, updateProfile } from 'firebase/auth';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { updateMemberProfileAction } from '@/lib/finance-client';
import { Camera, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();
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
  const isBusy = status === 'uploading' || status === 'saving';
  const badgeSize = Math.max(16, Math.round(size * 0.38));

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      const msg = 'Please select a valid image file.';
      setErrorMsg(msg);
      setStatus('error');
      toast({
        variant: "destructive",
        title: "Invalid file",
        description: msg,
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      const msg = 'Image must be smaller than 5 MB.';
      setErrorMsg(msg);
      setStatus('error');
      toast({
        variant: "destructive",
        title: "File too large",
        description: msg,
      });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setErrorMsg(null);
    setStatus('uploading');
    setProgress(0);

    toast({
      title: "Saving avatar...",
      description: "Uploading and updating your profile picture.",
    });

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
        const msg = error.message || 'Upload failed.';
        setErrorMsg(msg);
        setStatus('error');
        setProgress(null);
        toast({
          variant: "destructive",
          title: "Upload Failed",
          description: msg,
        });
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
          setStatus('saving');
          setProgress(null);
          startTransition(async () => {
            try {
              // 1. Update Firebase Auth client profile for instant local and session persistence
              const auth = getAuth(app);
              if (auth.currentUser && auth.currentUser.uid === uid) {
                try {
                  await updateProfile(auth.currentUser, { photoURL: downloadURL });
                } catch (authErr) {
                  console.warn('Could not update Firebase Auth user profile:', authErr);
                }
              }

              // 2. Persist directly to Firestore profile document
              let firestoreUpdated = false;
              try {
                const firestore = getFirestore(app);
                await updateDoc(doc(firestore, 'users', uid), { photoURL: downloadURL });
                firestoreUpdated = true;
              } catch (fsErr) {
                console.warn('Direct Firestore profile write failed, will attempt Cloud Function:', fsErr);
              }

              // 3. Update via Cloud Function
              try {
                await updateMemberProfileAction(uid, { photoURL: downloadURL });
              } catch (cfErr: any) {
                if (!firestoreUpdated) {
                  throw cfErr;
                }
              }

              setPreview(downloadURL);
              setStatus('done');
              onUploadSuccess?.(downloadURL);
              
              toast({
                title: "Avatar saved!",
                description: "Your new profile picture has been saved successfully.",
              });

              setTimeout(() => setStatus('idle'), 2500);
            } catch (err: any) {
              const msg = err.message || 'Failed to save avatar.';
              setErrorMsg(msg);
              setStatus('error');
              toast({
                variant: "destructive",
                title: "Save Failed",
                description: msg,
              });
            }
          });
        });
      }
    );
  }

  const ringColor =
    status === 'done' ? 'ring-emerald-500 ring-offset-2' :
    status === 'error' ? 'ring-destructive' :
    isBusy ? 'ring-primary animate-pulse' :
    'ring-border hover:ring-primary/60';

  return (
    <div className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={isBusy}
      />

      {/* Avatar circle */}
      <button
        type="button"
        onClick={() => {
          setErrorMsg(null);
          if (status === 'error') setStatus('idle');
          inputRef.current?.click();
        }}
        disabled={isBusy}
        className={`relative w-full h-full rounded-full overflow-hidden ring-2 ${ringColor} transition-all duration-200 focus:outline-none focus:ring-primary focus:ring-offset-1 focus:ring-offset-background cursor-pointer`}
        aria-label="Change profile photo"
        title="Click to change your profile photo"
        style={{ width: size, height: size }}
      >
        {photoSrc ? (
          <img
            src={photoSrc}
            alt={displayName ?? 'Avatar'}
            className="w-full h-full object-cover"
          />
        ) : (
          <span
            className="flex items-center justify-center w-full h-full bg-gradient-to-br from-primary/80 to-primary text-primary-foreground font-bold select-none"
            style={{ fontSize: Math.max(12, size * 0.35) }}
          >
            {initials}
          </span>
        )}

        {/* Dark overlay on hover (only when idle) */}
        {!isBusy && status !== 'done' && (
          <span className="absolute inset-0 bg-black/0 hover:bg-black/40 flex items-center justify-center transition-colors duration-200 rounded-full">
            <Camera className="text-white opacity-0 group-hover:opacity-100 transition-opacity" style={{ width: size * 0.3, height: size * 0.3 }} />
          </span>
        )}

        {/* Active Feedback Overlay (during upload & saving) */}
        {isBusy && (
          <span className="absolute inset-0 bg-black/65 backdrop-blur-[2px] flex flex-col items-center justify-center text-white z-10 transition-all rounded-full p-1">
            <Loader2 className="animate-spin text-white mb-0.5" style={{ width: Math.max(16, size * 0.3), height: Math.max(16, size * 0.3) }} />
            {size >= 60 && (
              <span className="text-[10px] font-bold text-white tracking-tight leading-tight">
                {status === 'saving' ? 'Saving...' : progress !== null ? `${progress}%` : 'Uploading...'}
              </span>
            )}
          </span>
        )}

        {/* Done / Success Overlay */}
        {status === 'done' && (
          <span className="absolute inset-0 bg-emerald-600/90 backdrop-blur-[2px] flex flex-col items-center justify-center text-white z-10 transition-all rounded-full p-1 animate-in fade-in zoom-in-95 duration-200">
            <CheckCircle className="text-white mb-0.5" style={{ width: Math.max(16, size * 0.32), height: Math.max(16, size * 0.32) }} />
            {size >= 60 && (
              <span className="text-[10px] font-extrabold text-white tracking-tight leading-tight">
                Saved!
              </span>
            )}
          </span>
        )}
      </button>

      {/* Always-visible edit badge (camera icon at bottom-right) */}
      {!isBusy && status !== 'done' && status !== 'error' && (
        <button
          type="button"
          onClick={() => {
            setErrorMsg(null);
            inputRef.current?.click();
          }}
          className="absolute -bottom-1 -right-1 rounded-full bg-primary text-primary-foreground border-2 border-background flex items-center justify-center shadow-md hover:bg-primary/80 transition-colors duration-150 focus:outline-none"
          style={{ width: badgeSize, height: badgeSize }}
          aria-label="Change profile photo"
          title="Change profile photo"
          tabIndex={-1}
        >
          <Camera style={{ width: badgeSize * 0.55, height: badgeSize * 0.55 }} />
        </button>
      )}

      {/* Progress ring overlay during upload */}
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

      {/* Status badges */}
      {status === 'saving' && (
        <span className="absolute -bottom-1 -right-1 rounded-full bg-background border border-border p-0.5 flex items-center justify-center shadow-sm" style={{ width: badgeSize, height: badgeSize }}>
          <Loader2 className="text-primary animate-spin" style={{ width: badgeSize * 0.65, height: badgeSize * 0.65 }} />
        </span>
      )}
      {status === 'done' && (
        <span className="absolute -bottom-1 -right-1 rounded-full bg-background border border-green-500 p-0.5 flex items-center justify-center shadow-sm" style={{ width: badgeSize, height: badgeSize }}>
          <CheckCircle className="text-green-500" style={{ width: badgeSize * 0.65, height: badgeSize * 0.65 }} />
        </span>
      )}
      {status === 'error' && (
        <span
          className="absolute -bottom-1 -right-1 rounded-full bg-destructive border border-background p-0.5 flex items-center justify-center shadow-sm cursor-pointer"
          style={{ width: badgeSize, height: badgeSize }}
          title={errorMsg ?? 'Upload failed'}
          onClick={() => { setStatus('idle'); setErrorMsg(null); }}
        >
          <AlertCircle className="text-destructive-foreground" style={{ width: badgeSize * 0.65, height: badgeSize * 0.65 }} />
        </span>
      )}

      {/* Error tooltip */}
      {status === 'error' && errorMsg && (
        <div
          className="absolute left-1/2 -translate-x-1/2 w-max max-w-[180px] rounded-md bg-destructive text-destructive-foreground text-[10px] font-medium px-2 py-1 shadow-lg z-20 text-center pointer-events-none"
          style={{ top: size + 10 }}
        >
          {errorMsg}
        </div>
      )}
    </div>
  );
}
