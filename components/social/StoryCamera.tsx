'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Images,
  Loader2,
  RefreshCw,
  Square,
  SwitchCamera,
} from 'lucide-react';

const MAX_RECORDING_SECONDS = 60;
const RECORDING_TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/webm;codecs=vp8,opus',
  'video/mp4',
  'video/webm',
];

type FacingMode = 'environment' | 'user';
type Phase =
  | 'starting'
  | 'live'
  | 'microphone'
  | 'recording'
  | 'processing'
  | 'review'
  | 'error';

function deviceError(error: unknown, device: 'camera' | 'microphone'): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return device === 'camera'
      ? 'Camera access was denied. Allow it in your browser or app settings, then try again, or choose from your gallery.'
      : 'Microphone access was denied. Allow it in your browser or app settings to record video, or switch to Photo.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return `No ${device} was found. You can still choose a photo or video from your gallery.`;
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return `The ${device} is busy or unavailable. Close other apps using it and try again.`;
  }
  return `Could not start the ${device}. Please try again or choose from your gallery.`;
}

interface StoryCameraProps {
  onClose: () => void;
  onChooseFromGallery: () => void;
  onCapture: (file: File) => Promise<boolean>;
}

export function StoryCamera({
  onClose,
  onChooseFromGallery,
  onCapture,
}: StoryCameraProps) {
  const preview = useRef<HTMLVideoElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const camera = useRef<MediaStream | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingLimit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [facing, setFacing] = useState<FacingMode>('environment');
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [elapsed, setElapsed] = useState(0);
  const [capture, setCapture] = useState<{ file: File; url: string } | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearTimers = useCallback(() => {
    if (timer.current !== null) clearInterval(timer.current);
    if (recordingLimit.current !== null) clearTimeout(recordingLimit.current);
    timer.current = null;
    recordingLimit.current = null;
  }, []);

  const releaseDevices = useCallback(() => {
    // Permission prompts and recorder callbacks may finish after this view closes.
    generation.current++;
    clearTimers();
    const activeRecorder = recorder.current;
    recorder.current = null;
    if (activeRecorder) {
      activeRecorder.ondataavailable = null;
      activeRecorder.onstop = null;
      activeRecorder.onerror = null;
      if (activeRecorder.state !== 'inactive') activeRecorder.stop();
    }
    camera.current?.getTracks().forEach((track) => track.stop());
    microphone.current?.getTracks().forEach((track) => track.stop());
    camera.current = null;
    microphone.current = null;
    if (preview.current) preview.current.srcObject = null;
  }, [clearTimers]);

  const startCamera = useCallback(
    async (direction: FacingMode) => {
      releaseDevices();
      const current = generation.current;
      setPhase('starting');
      setError(null);
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setPhase('error');
        setError(
          window.isSecureContext
            ? 'This device does not support a live camera. Choose a photo or video from your gallery instead.'
            : 'The live camera needs a secure HTTPS connection. You can still choose from your gallery.'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: direction },
            width: { ideal: 720 },
            height: { ideal: 1280 },
            aspectRatio: { ideal: 9 / 16 },
            frameRate: { ideal: 30, max: 30 },
          },
        });
        if (current !== generation.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        camera.current = stream;
        const video = preview.current;
        if (!video) throw new Error('Camera preview is unavailable');
        video.srcObject = stream;
        await video.play();
        if (current !== generation.current) return;

        const track = stream.getVideoTracks()[0];
        const actualFacing = track?.getSettings().facingMode;
        setFacing(
          actualFacing === 'user' || actualFacing === 'environment'
            ? actualFacing
            : direction
        );
        track?.addEventListener(
          'ended',
          () => {
            if (current !== generation.current) return;
            releaseDevices();
            setPhase('error');
            setError('The camera was interrupted. Try again to continue.');
          },
          { once: true }
        );
        setPhase('live');
      } catch (failure) {
        if (current !== generation.current) return;
        releaseDevices();
        setPhase('error');
        setError(deviceError(failure, 'camera'));
      }
    },
    [releaseDevices]
  );

  useEffect(() => {
    backButton.current?.focus();
    void startCamera('environment');
    return releaseDevices;
  }, [startCamera, releaseDevices]);

  useEffect(() => {
    const pause = () => {
      if (capture) return;
      const wasRecording = recorder.current?.state === 'recording';
      releaseDevices();
      setPhase('error');
      setError(
        wasRecording
          ? 'The recording was discarded when you left the app. Try again to record a new video.'
          : 'The camera paused when you left the app. Try again to continue.'
      );
    };
    const handleVisibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', pause);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', pause);
    };
  }, [capture, releaseDevices]);

  useEffect(() => {
    return () => {
      if (capture) URL.revokeObjectURL(capture.url);
    };
  }, [capture]);

  const review = (file: File) => {
    releaseDevices();
    setCapture({ file, url: URL.createObjectURL(file) });
    setPhase('review');
    setError(null);
  };

  const takePhoto = async () => {
    const video = preview.current;
    if (phase !== 'live' || !video) return;
    const current = generation.current;
    setPhase('processing');
    setError(null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context || !canvas.width || !canvas.height) {
        throw new Error('The camera is not ready for a photo. Try again.');
      }
      context.drawImage(video, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) =>
            result
              ? resolve(result)
              : reject(new Error('Could not take a photo. Try again.')),
          'image/jpeg',
          0.9
        );
      });
      if (current !== generation.current) return;
      review(new File([blob], `story-${Date.now()}.jpg`, { type: blob.type }));
    } catch (failure) {
      if (current !== generation.current) return;
      setPhase('live');
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not take a photo. Try again.'
      );
    }
  };

  const stopRecording = () => {
    const activeRecorder = recorder.current;
    if (!activeRecorder || activeRecorder.state === 'inactive') return;
    clearTimers();
    setPhase('processing');
    activeRecorder.stop();
  };

  const startRecording = async () => {
    const stream = camera.current;
    if (phase !== 'live' || !stream) return;
    setError(null);
    const mimeType =
      typeof MediaRecorder !== 'undefined'
        ? RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
        : undefined;
    if (!mimeType) {
      setError(
        'Video recording is not supported on this device. Take a photo or choose a video from your gallery.'
      );
      return;
    }

    const current = generation.current;
    setPhase('microphone');
    try {
      const audio = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      if (current !== generation.current) {
        audio.getTracks().forEach((track) => track.stop());
        return;
      }
      microphone.current = audio;
      const recording = new MediaRecorder(
        new MediaStream([
          ...stream.getVideoTracks(),
          ...audio.getAudioTracks(),
        ]),
        { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 }
      );
      recorder.current = recording;
      const chunks: Blob[] = [];
      recording.ondataavailable = ({ data }) => {
        if (data.size) chunks.push(data);
      };
      recording.onerror = () => {
        if (current !== generation.current) return;
        releaseDevices();
        setPhase('error');
        setError('Video recording failed. Try again to record a new video.');
      };
      recording.onstop = () => {
        if (current !== generation.current) return;
        clearTimers();
        const blob = new Blob(chunks, { type: recording.mimeType });
        if (!blob.size) {
          releaseDevices();
          setPhase('error');
          setError('The recording was empty. Try recording a new video.');
          return;
        }
        const extension = blob.type.startsWith('video/mp4') ? 'mp4' : 'webm';
        review(
          new File([blob], `story-${Date.now()}.${extension}`, {
            type: blob.type,
          })
        );
      };
      audio.getAudioTracks()[0]?.addEventListener(
        'ended',
        () => {
          if (current !== generation.current) return;
          releaseDevices();
          setPhase('error');
          setError(
            'The microphone was interrupted. Try recording a new video.'
          );
        },
        { once: true }
      );
      recording.start(1000);
      const started = performance.now();
      setElapsed(0);
      setPhase('recording');
      timer.current = setInterval(() => {
        setElapsed(
          Math.min(
            MAX_RECORDING_SECONDS,
            Math.floor((performance.now() - started) / 1000)
          )
        );
      }, 250);
      recordingLimit.current = setTimeout(
        stopRecording,
        MAX_RECORDING_SECONDS * 1000
      );
    } catch (failure) {
      if (current !== generation.current) return;
      const message = microphone.current
        ? 'Could not start video recording. Try again, or switch to Photo.'
        : deviceError(failure, 'microphone');
      microphone.current?.getTracks().forEach((track) => track.stop());
      microphone.current = null;
      recorder.current = null;
      setPhase('live');
      setError(message);
    }
  };

  const useCapture = async () => {
    if (!capture || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (await onCapture(capture.file)) return;
      setError(
        'Could not upload your capture. It is still here; try again or retake it.'
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not upload your capture. Please try again.'
      );
    }
    setSaving(false);
  };

  const recording = phase === 'recording';
  const working =
    phase === 'starting' || phase === 'microphone' || phase === 'processing';
  const minutes = Math.floor(elapsed / 60);
  const seconds = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="flex h-full flex-col bg-black text-white">
      <header className="flex flex-none items-center justify-between gap-3 pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-3 pl-[max(1rem,env(safe-area-inset-left))]">
        <button
          ref={backButton}
          type="button"
          onClick={onClose}
          disabled={saving}
          aria-label="Back to story"
          className="grid h-11 w-11 place-items-center rounded-full bg-white/10 disabled:opacity-50"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <h2 className="font-semibold">Story camera</h2>
        <span className="w-11 text-right text-xs text-white/70">60s max</span>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <video
          ref={preview}
          autoPlay
          muted
          playsInline
          aria-label="Live camera preview"
          className={capture ? 'hidden' : 'h-full w-full object-contain'}
        />
        {capture &&
          (capture.file.type.startsWith('image/') ? (
            <img
              src={capture.url}
              alt="Story photo preview"
              className="h-full w-full object-contain"
            />
          ) : (
            <video
              src={capture.url}
              controls
              playsInline
              aria-label="Story video preview"
              className="h-full w-full object-contain"
            />
          ))}
        {working && (
          <div
            role="status"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 text-sm"
          >
            <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
            {phase === 'starting'
              ? 'Opening camera...'
              : phase === 'microphone'
                ? 'Allow microphone access to record video...'
                : 'Preparing capture...'}
          </div>
        )}
        {recording && (
          <div
            role="timer"
            aria-label="Recording duration"
            className="absolute top-3 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold tabular-nums"
          >
            {minutes}:{seconds} / 1:00
          </div>
        )}
        {phase === 'error' && (
          <button
            type="button"
            onClick={() => void startCamera(facing)}
            className="absolute flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try camera again
          </button>
        )}
      </div>

      <footer className="flex-none space-y-4 pt-4 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]">
        {error && (
          <p role="alert" className="text-center text-sm text-red-200">
            {error}
          </p>
        )}
        {capture ? (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setCapture(null);
                void startCamera(facing);
              }}
              className="flex min-h-11 items-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-semibold disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retake
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void useCapture()}
              className="flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-4 w-4" aria-hidden="true" />
              )}
              {saving
                ? 'Preparing and uploading...'
                : capture.file.type.startsWith('image/')
                  ? 'Use photo'
                  : 'Use video'}
            </button>
          </div>
        ) : (
          <>
            <div
              className="flex justify-center gap-2"
              aria-label="Capture mode"
            >
              {(['photo', 'video'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={mode === kind}
                  disabled={phase !== 'live'}
                  onClick={() => {
                    setMode(kind);
                    setError(null);
                  }}
                  className={`min-h-11 rounded-full px-5 text-sm font-semibold disabled:opacity-50 ${mode === kind ? 'bg-white text-black' : 'bg-white/10'}`}
                >
                  {kind === 'photo' ? 'Photo' : 'Video'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 items-center justify-items-center gap-4">
              <button
                type="button"
                onClick={onChooseFromGallery}
                disabled={recording}
                aria-label="Choose from gallery"
                className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 disabled:opacity-50"
              >
                <Images className="h-6 w-6" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={phase !== 'live' && !recording}
                onClick={() => {
                  if (recording) stopRecording();
                  else if (mode === 'photo') void takePhoto();
                  else void startRecording();
                }}
                aria-label={
                  recording
                    ? 'Stop recording'
                    : mode === 'photo'
                      ? 'Take photo'
                      : 'Record video'
                }
                className="grid h-20 w-20 place-items-center rounded-full border-4 border-white p-1 disabled:opacity-40"
              >
                <span
                  className={`grid h-full w-full place-items-center rounded-full ${mode === 'video' ? 'bg-red-500' : 'bg-white'}`}
                >
                  {recording && (
                    <Square className="h-7 w-7 fill-white" aria-hidden="true" />
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void startCamera(
                    facing === 'environment' ? 'user' : 'environment'
                  )
                }
                disabled={phase !== 'live'}
                aria-label="Switch camera"
                className="grid h-12 w-12 place-items-center rounded-full bg-white/15 disabled:opacity-50"
              >
                <SwitchCamera className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            <p className="text-center text-xs text-white/70">
              {recording
                ? 'Tap to stop recording'
                : mode === 'video'
                  ? 'Tap to record up to 60 seconds with sound'
                  : 'Tap the shutter to take a photo'}
            </p>
          </>
        )}
      </footer>
    </div>
  );
}
