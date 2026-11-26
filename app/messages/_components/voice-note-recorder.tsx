'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, X } from 'lucide-react';
import {
  VOICE_NOTE_MAX_BYTES,
  VOICE_NOTE_MAX_SECONDS,
  voiceNoteError,
  voiceNoteMediaType,
  voiceNoteRecordingType,
} from '@/lib/media/voice-notes';
import styles from '@/components/messages/workspace.module.css';

export function VoiceNoteRecorder({
  disabled,
  onBusy,
  onCapture,
  onError,
}: {
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onCapture: (file: File, duration: number) => void;
  onError: (error: string | null) => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'starting' | 'recording'>('idle');
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const limit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacks = useRef({ onBusy, onCapture, onError });
  callbacks.current = { onBusy, onCapture, onError };

  const clearTimers = () => {
    if (timer.current !== null) clearInterval(timer.current);
    if (limit.current !== null) clearTimeout(limit.current);
    timer.current = null;
    limit.current = null;
  };
  const release = () => {
    generation.current++;
    pending.current = false;
    clearTimers();
    const active = recorder.current;
    recorder.current = null;
    if (active) {
      active.ondataavailable = null;
      active.onstop = null;
      active.onerror = null;
      if (active.state !== 'inactive') active.stop();
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };
  const cancel = (error: string | null = null) => {
    release();
    setPhase('idle');
    callbacks.current.onBusy(false);
    callbacks.current.onError(error);
  };

  useEffect(() => {
    const pause = () => {
      if (!pending.current && !stream.current && !recorder.current) return;
      cancel('Recording was interrupted. Record a new voice note.');
    };
    const visibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pause);
    return () => {
      release();
      callbacks.current.onBusy(false);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pause);
    };
    // Device lifetime belongs to this conversation's mounted recorder.
  }, []);

  const start = async () => {
    if (disabled || pending.current || phase !== 'idle') return;
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      onError(
        'Voice recording is unavailable here. Use a supported browser or the app over HTTPS.'
      );
      return;
    }
    const mimeType = voiceNoteRecordingType((type) =>
      MediaRecorder.isTypeSupported(type)
    );
    if (!mimeType) {
      onError('This device cannot record a supported voice note format.');
      return;
    }
    const current = ++generation.current;
    pending.current = true;
    setPhase('starting');
    onBusy(true);
    onError(null);
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });
      if (current !== generation.current) {
        microphone.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = microphone;
      const active = new MediaRecorder(microphone, {
        mimeType,
        audioBitsPerSecond: 64_000,
      });
      recorder.current = active;
      const chunks: Blob[] = [];
      let bytes = 0;
      const started = performance.now();
      active.ondataavailable = (event) => {
        if (current !== generation.current) return;
        bytes += event.data.size;
        if (bytes > VOICE_NOTE_MAX_BYTES) {
          cancel('This recording is too large. Try a shorter voice note.');
          return;
        }
        if (event.data.size) chunks.push(event.data);
      };
      active.onerror = () =>
        cancel('Recording failed. Record a new voice note.');
      active.onstop = () => {
        if (current !== generation.current) return;
        const duration = Math.min(
          VOICE_NOTE_MAX_SECONDS,
          (performance.now() - started) / 1000
        );
        const type = voiceNoteMediaType(active.mimeType || mimeType);
        const file = new File(
          chunks,
          `voice-note.${type === 'audio/mp4' ? 'm4a' : 'weba'}`,
          { type }
        );
        release();
        setPhase('idle');
        callbacks.current.onBusy(false);
        const invalid = voiceNoteError(file, duration);
        if (invalid) callbacks.current.onError(invalid);
        else callbacks.current.onCapture(file, duration);
      };
      microphone.getTracks().forEach((track) =>
        track.addEventListener(
          'ended',
          () => {
            if (current === generation.current)
              cancel(
                'The microphone was disconnected. Record a new voice note.'
              );
          },
          { once: true }
        )
      );
      active.start(1000);
      setSeconds(0);
      setPhase('recording');
      timer.current = setInterval(
        () =>
          setSeconds(
            Math.min(
              VOICE_NOTE_MAX_SECONDS,
              Math.floor((performance.now() - started) / 1000)
            )
          ),
        250
      );
      limit.current = setTimeout(() => {
        if (active.state === 'recording') active.stop();
      }, VOICE_NOTE_MAX_SECONDS * 1000);
    } catch (error) {
      if (current !== generation.current) return;
      const name = error instanceof Error ? error.name : '';
      cancel(
        name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? 'Microphone access was denied. Allow it in your browser or app settings, then try again.'
          : name === 'NotFoundError'
            ? 'No microphone was found. Connect a microphone and try again.'
            : 'Could not start the microphone. Close other apps using it and try again.'
      );
    }
  };

  if (phase === 'idle') {
    return (
      <button
        type="button"
        className={styles.attachButton}
        aria-label="Record a voice note"
        aria-description="Up to 5 minutes. Uses shareable Pana media links, not end-to-end encryption."
        title="Record a voice note (up to 5 minutes)"
        disabled={disabled}
        onClick={() => void start()}
      >
        <Mic size={22} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label="Voice recording"
    >
      <button
        type="button"
        className={styles.attachButton}
        aria-label="Cancel voice recording"
        onClick={() => cancel()}
      >
        <X size={20} aria-hidden="true" />
      </button>
      <span
        className="text-pana-red-deep text-xs tabular-nums"
        role="timer"
        aria-label="Recording time"
      >
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
      </span>
      <button
        type="button"
        className={styles.attachButton}
        aria-label={
          phase === 'starting'
            ? 'Waiting for microphone'
            : 'Stop voice recording'
        }
        disabled={phase === 'starting'}
        onClick={() => {
          clearTimers();
          if (recorder.current?.state === 'recording') recorder.current.stop();
        }}
      >
        <Square size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
