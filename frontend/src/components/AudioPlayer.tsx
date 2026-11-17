import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { clock } from '../lib/format';
import { Icon } from './Icon';

export interface PlayerHandle {
  /** Seek to a time (seconds) and start playback. */
  playFrom: (sec: number) => void;
  currentTime: () => number;
}

export interface Marker { time: number; strong?: boolean; id: number }

/**
 * REV-02: "like YouTube" – clear time display, 10 s back, 30 s forward, smooth scrubbing
 * (pointer drag with range-request streaming). Markers show existing notes on the timeline.
 */
export const AudioPlayer = forwardRef<PlayerHandle, { src: string; markers?: Marker[]; onMarkerClick?: (id: number) => void; onTime?: (sec: number) => void }>(
  function AudioPlayer({ src, markers = [], onMarkerClick, onTime }, ref) {
    const { t } = useI18n();
    const audio = useRef<HTMLAudioElement>(null);
    const bar = useRef<HTMLDivElement>(null);
    const [playing, setPlaying] = useState(false);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [rate, setRate] = useState(1);
    const [dragging, setDragging] = useState<number | null>(null);
    const [error, setError] = useState(false);

    const pendingSeek = useRef<number | null>(null);

    useImperativeHandle(ref, () => ({
      playFrom: (sec: number) => {
        const a = audio.current;
        if (!a) return;
        if (a.readyState < 1) {
          // metadata not loaded yet (e.g. just switched version): seek once it is
          pendingSeek.current = Math.max(0, sec);
          a.load();
          return;
        }
        a.currentTime = Math.max(0, sec);
        a.play().catch(() => undefined);
      },
      currentTime: () => audio.current?.currentTime ?? 0,
    }));

    useEffect(() => {
      setError(false);
      setTime(0);
      setPlaying(false);
    }, [src]);

    useEffect(() => {
      if (audio.current) audio.current.playbackRate = rate;
    }, [rate]);

    const seekBy = (d: number) => {
      const a = audio.current;
      if (!a) return;
      a.currentTime = Math.min(Math.max(0, a.currentTime + d), a.duration || Infinity);
    };

    const toggle = () => {
      const a = audio.current;
      if (!a) return;
      if (a.paused) a.play().catch(() => setError(true));
      else a.pause();
    };

    const posToTime = useCallback((clientX: number) => {
      const el = bar.current;
      if (!el || !duration) return 0;
      const r = el.getBoundingClientRect();
      return Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * duration;
    }, [duration]);

    const onPointerDown = (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDragging(posToTime(e.clientX));
    };
    const onPointerMove = (e: React.PointerEvent) => {
      if (dragging !== null) setDragging(posToTime(e.clientX));
    };
    const onPointerUp = (e: React.PointerEvent) => {
      if (dragging === null) return;
      const target = posToTime(e.clientX);
      if (audio.current) audio.current.currentTime = target;
      setTime(target);
      setDragging(null);
    };

    // Keyboard: space play/pause, arrows seek
    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); toggle(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); seekBy(-10); }
      if (e.key === 'ArrowRight') { e.preventDefault(); seekBy(30); }
    };

    const shown = dragging ?? time;
    const pct = duration ? (shown / duration) * 100 : 0;

    return (
      <div className="player" tabIndex={0} onKeyDown={onKeyDown} aria-label="audio player">
        <audio
          ref={audio}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            const now = e.currentTarget.currentTime;
            if (dragging === null) setTime(now);
            onTime?.(now);
          }}
          onSeeked={(e) => onTime?.(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            const a = e.currentTarget;
            setDuration(a.duration);
            if (pendingSeek.current !== null) {
              a.currentTime = pendingSeek.current;
              pendingSeek.current = null;
              a.play().catch(() => undefined);
            }
          }}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onProgress={(e) => {
            const b = e.currentTarget.buffered;
            if (b.length) setBuffered(b.end(b.length - 1));
          }}
          onError={() => setError(true)}
        />
        <div className="player-row">
          <button className="btn play" onClick={toggle} aria-label={playing ? t('player.pause') : t('player.play')}>
            <Icon name={playing ? 'pause' : 'play'} size={22} />
          </button>
          <button className="btn btn-sm" onClick={() => seekBy(-10)}>{t('player.back10')}</button>
          <button className="btn btn-sm" onClick={() => seekBy(30)}>{t('player.fwd30')}</button>
          <span className="player-time">{clock(shown)} / {clock(duration)}</span>
          <span className="spacer" />
          <label className="row" style={{ gap: 6, fontSize: '0.85rem' }}>
            {t('player.speed')}
            <select value={rate} onChange={(e) => setRate(Number(e.target.value))}>
              {[0.75, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
            </select>
          </label>
        </div>
        <div
          className="scrubber"
          ref={bar}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(shown)}
        >
          <div className="track" />
          <div className="buffered" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
          <div className="progress" style={{ width: `${pct}%` }} />
          {duration > 0 && markers.map((m) => (
            <div
              key={m.id}
              className={`marker${m.strong ? ' lahn' : ''}`}
              style={{ left: `${(m.time / duration) * 100}%` }}
              onPointerDown={(e) => { e.stopPropagation(); onMarkerClick?.(m.id); }}
              title={clock(m.time)}
            />
          ))}
          <div className="thumb" style={{ left: `${pct}%` }} />
        </div>
        {error && <div style={{ marginTop: 8, fontSize: '0.85rem', color: '#ffd0d0' }}>{t('common.error')}</div>}
      </div>
    );
  },
);
