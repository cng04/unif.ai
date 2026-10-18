"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addPerson, deletePerson, personPublic, runMatching, type AddPersonState } from "@/app/admin/actions";
import { Caption, Chip, outline, Panel } from "@/components/admin-ui";
import { CopyButton } from "@/components/copy-button";
import type { PublicProfile } from "@/lib/api";
import { SOCIALS } from "@/lib/socials";

const PROMPTS = ["what are you into lately?", "what can't you stand in people?", "when are you usually free?"];
const BARS = 40;
const PHASE_HINT = {
  starting: "starting chrome's speech recognition…",
  "mic open": "listening · say something",
  "hearing speech": "hearing speech…",
  transcribing: "transcribing · tap to stop",
  "no speech heard": "chrome hears no speech · check its mic in chrome://settings/content/microphone",
} as const;

const field =
  "w-full rounded-[12px] border border-line bg-white/55 px-3.5 py-2.5 text-[13px] leading-4 font-light tracking-body outline-none placeholder:text-ink-faint focus:border-ink/40";
const label = "font-mono text-[10px] leading-3 tracking-label text-ink-muted";

/** The whole screen remounts on "add another", which is the only way to clear useActionState. */
export function AddPerson({ universeId, matching }: { universeId: string; matching: boolean }) {
  const [round, setRound] = useState(0);
  return <AddPersonForm key={round} universeId={universeId} matching={matching} onReset={() => setRound((r) => r + 1)} />;
}

function AddPersonForm({ universeId, matching, onReset }: { universeId: string; matching: boolean; onReset: () => void }) {
  const [state, formAction, pending] = useActionState<AddPersonState, FormData>(addPerson.bind(null, universeId), {});
  const [name, setName] = useState("");
  const [socials, setSocials] = useState<Record<string, string>>({});
  const mic = useDictation();
  const first = name.trim().split(/\s+/)[0] || "them";

  if (state.added) return <Added universeId={universeId} added={state.added} matching={matching} onReset={onReset} />;

  return (
    <form
      action={formAction}
      onSubmit={() => mic.stop()}
      className={`flex flex-col gap-5 transition-opacity ${pending ? "pointer-events-none opacity-60" : ""}`}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Panel className="flex flex-col gap-4 p-5 rise-in">
          <Caption>who</Caption>
          <label className="flex flex-col gap-1.5">
            <span className={label}>full name *</span>
            <input
              name="full_name"
              required
              maxLength={120}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bob Example"
              className={`${field} text-[16px] leading-5`}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={label}>phone</span>
              <input name="phone" type="tel" autoComplete="off" placeholder="+1 555 0100" className={field} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={label}>email</span>
              <input name="email" type="email" autoComplete="off" placeholder="bob@…" className={field} />
            </label>
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <span className={label}>socials · handle or link</span>
            {SOCIALS.map((p) => (
              <div key={p} className="flex items-center gap-2.5">
                <span className="w-[66px] shrink-0 font-mono text-[10.5px] tracking-meta text-ink-faint">{p}</span>
                <input
                  name={p}
                  autoComplete="off"
                  value={socials[p] ?? ""}
                  onChange={(e) => setSocials((s) => ({ ...s, [p]: e.target.value }))}
                  placeholder="@"
                  className={`${field} py-2`}
                />
              </div>
            ))}
          </div>
          {Object.values(socials).some((v) => v.trim()) && (
            <label className="flex items-start gap-2.5 rounded-[12px] border border-dashed border-ink/25 px-3 py-2.5 fade-in">
              <input name="scrape_consent" type="checkbox" className="mt-0.5 accent-[var(--color-ink)]" />
              <span className="text-[12px] leading-4 font-light tracking-body text-ink-muted">
                {first} agreed we can read these public profiles to build their agent.
              </span>
            </label>
          )}
          <p className="micro text-ink-faint">nothing is sent to their phone or email.</p>
        </Panel>

        <Panel className="flex flex-col gap-5 p-5 rise-in [animation-delay:80ms]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Caption>30-second interview</Caption>
            {mic.device && <span className="micro text-ink-faint">input · {mic.device.toLowerCase()}</span>}
          </div>
          <ol className="flex flex-wrap gap-2">
            {PROMPTS.map((q, i) => (
              <li key={q} className="rounded-full border border-line bg-white/40 px-3 py-1.5 text-[12px] leading-4 font-light tracking-body">
                <span className="pr-1.5 font-mono text-[10px] text-ink-faint">0{i + 1}</span>
                {q}
              </li>
            ))}
          </ol>

          <div className="flex items-center gap-5">
            {mic.supported ? (
              <button
                type="button"
                onClick={mic.listening ? mic.stop : mic.start}
                aria-label={mic.listening ? "stop listening" : "start listening"}
                className={`press relative flex size-[72px] shrink-0 items-center justify-center rounded-full ${
                  mic.listening ? "bg-ember" : "bg-ink"
                }`}
              >
                {mic.listening && <span className="absolute inset-0 rounded-full bg-ember pulse-ring" aria-hidden />}
                {mic.listening ? (
                  <span className="relative size-5 rounded-[5px] bg-paper" />
                ) : (
                  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden className="relative">
                    <rect x="9" y="3" width="6" height="11" rx="3" fill="var(--color-paper)" />
                    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="var(--color-paper)" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            ) : (
              <p className="micro max-w-[200px] text-ink-muted">voice needs chrome. typing works everywhere.</p>
            )}
            <Waveform levels={mic.levels} live={mic.listening} />
          </div>
          <p className="micro -mt-2 text-ink-muted">
            {mic.error ??
              (mic.listening
                ? PHASE_HINT[mic.phase]
                : mic.supported
                  ? "tap the mic, then ask away"
                  : "")}
          </p>

          <label className="flex flex-1 flex-col gap-1.5">
            <span className={label}>what they said · edit freely</span>
            <textarea
              name="transcript"
              required
              rows={7}
              value={mic.text}
              readOnly={mic.listening}
              onChange={(e) => mic.setText(e.target.value)}
              placeholder="I'm into bouldering and bad sci-fi, can't stand people who are late, free most weeknights…"
              className={`${field} min-h-[160px] flex-1 resize-y text-[15px] leading-6 ${mic.listening ? "text-ink-muted" : ""}`}
            />
          </label>
        </Panel>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-4">
        {state.error && <p className="micro text-ember-text">{state.error}</p>}
        <button
          disabled={pending || !name.trim() || !mic.text.trim()}
          className="press inline-flex items-center gap-2.5 rounded-full bg-ink px-6 py-3.5 text-[13px] leading-4 tracking-meta text-paper disabled:opacity-35"
        >
          {pending ? (
            <>
              <span className="size-1.5 animate-pulse rounded-full bg-ember" />
              building {first}&apos;s agent…
            </>
          ) : (
            <>add {first} to the universe ▸</>
          )}
        </button>
      </div>
    </form>
  );
}

function Waveform({ levels, live }: { levels: number[]; live: boolean }) {
  return (
    <div className="flex h-14 min-w-0 flex-1 items-center gap-[3px]" aria-hidden>
      {levels.map((v, i) => (
        <span
          key={i}
          className={`w-full rounded-full transition-[height] duration-75 ${live ? "bg-ink/70" : "bg-ink/15"}`}
          style={{ height: `${Math.max(6, v * 100)}%` }}
        />
      ))}
    </div>
  );
}

function Added({
  universeId,
  added,
  matching,
  onReset,
}: {
  universeId: string;
  added: NonNullable<AddPersonState["added"]>;
  matching: boolean;
  onReset: () => void;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile>(added.public);
  const [done, setDone] = useState<string[]>([]);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const reading = added.scraping.filter((p) => !done.includes(p));

  // Scrapes land in the background and rebuild the profile; poll until every platform has come back.
  useEffect(() => {
    if (!reading.length) return;
    const id = setInterval(async () => {
      const next = await personPublic(added.userId).catch(() => null);
      if (!next) return;
      setDone(next.scraped);
      setProfile(next.public);
    }, 4000);
    return () => clearInterval(id);
  }, [added.userId, reading.length]);

  const act = (fn: () => Promise<{ error?: string }>, then: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else then();
    });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
      <Panel className="relative flex flex-col gap-5 overflow-hidden p-6 md:p-8 pop-in">
        <div className="flex flex-wrap items-center gap-3">
          <span className="size-2 rounded-full bg-ember" />
          <Caption>agent ready</Caption>
          {reading.map((p) => (
            <span key={p} className="animate-pulse">
              <Chip tone="dashed">reading {p}…</Chip>
            </span>
          ))}
          {done.map((p) => (
            <Chip key={p}>{p} ✓</Chip>
          ))}
        </div>
        <h2 className="text-[34px] leading-[40px] font-light tracking-[0.06em] lowercase">{profile.name}</h2>
        {profile.intro && (
          <p className="max-w-[56ch] text-[16px] leading-6 font-light tracking-body">&ldquo;{profile.intro}&rdquo;</p>
        )}
        {!!profile.interests?.length && (
          <div className="flex flex-wrap gap-2">
            {profile.interests.map((t, i) => (
              <span
                key={t}
                className="rounded-full border border-line bg-white/55 px-3 py-1.5 text-[12.5px] leading-4 font-light tracking-body rise-in"
                style={{ animationDelay: `${120 + i * 50}ms` }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <dl className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["vibe", profile.vibe],
              ["looking for", profile.looking_for],
              ["humor", profile.humor],
              ["in a group", profile.group_role],
            ] as const
          )
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1">
                <dt className={label}>{k}</dt>
                <dd className="text-[13.5px] leading-5 font-light tracking-body">{v}</dd>
              </div>
            ))}
        </dl>
      </Panel>

      <div className="flex flex-col gap-5">
        <Panel className="flex flex-col items-center gap-4 p-6 pop-in [animation-delay:120ms]">
          <Caption>scan to follow along</Caption>
          <div className="size-[188px] rounded-[16px] bg-white/70 p-3.5 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: added.qr }} />
          <div className="flex max-w-full items-center gap-2">
            <span className="truncate font-mono text-[10px] tracking-[0.06em] text-ink-muted">{added.link}</span>
            <CopyButton text={added.link} />
          </div>
        </Panel>
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            disabled={busy || matching}
            onClick={() => act(() => runMatching(universeId), () => router.push(`/admin/universes/${universeId}`))}
            className="press rounded-full bg-ink px-5 py-3.5 text-[13px] leading-4 tracking-meta text-paper disabled:opacity-40"
          >
            {matching ? "matching already running" : busy ? "starting…" : "match now ▸"}
          </button>
          <div className="flex gap-2.5">
            <button type="button" onClick={onReset} disabled={busy} className={`${outline} flex-1 justify-center`}>
              add another
            </button>
            <Link href={`/admin/universes/${universeId}`} className={`${outline} flex-1 justify-center`}>
              overview
            </Link>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => act(() => deletePerson(added.userId), onReset)}
            className="micro self-center pt-1 text-ink-faint hover:text-ember-text"
          >
            undo · remove {profile.name.split(" ")[0].toLowerCase()}
          </button>
          {error && <p className="micro text-center text-ember-text">{error}</p>}
        </div>
      </div>
    </div>
  );
}

// ---- Dictation: Chrome's Web Speech API for words, Web Audio on the same mic for the level bars. ----

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
};

// What Chrome's recognizer has reported so far, shown under the mic so a silent failure is visible on stage.
type Phase = "starting" | "mic open" | "hearing speech" | "transcribing" | "no speech heard";

function useDictation() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [committed, setCommitted] = useState("");
  const [interim, setInterim] = useState("");
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [device, setDevice] = useState<string>();
  const [error, setError] = useState<string>();
  const [phase, setPhase] = useState<Phase>("starting");
  const want = useRef(false);
  const pendingRef = useRef("");
  const rec = useRef<Recognition | null>(null);
  const audio = useRef<{ ctx: AudioContext; stream: MediaStream; frame: number } | null>(null);

  function stopAudio() {
    if (!audio.current) return;
    cancelAnimationFrame(audio.current.frame);
    audio.current.stream.getTracks().forEach((t) => t.stop());
    void audio.current.ctx.close();
    audio.current = null;
    setLevels(Array(BARS).fill(0));
  }

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    // Feature detection has to wait for the browser; the server render always assumes no speech support.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    return () => {
      want.current = false;
      rec.current?.stop();
      stopAudio();
    };
  }, []);

  async function start() {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    setError(undefined);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setDevice(stream.getAudioTracks()[0]?.label || undefined);
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let last = 0;
      const tick = (t: number) => {
        if (!audio.current) return;
        audio.current.frame = requestAnimationFrame(tick);
        if (t - last < 60) return;
        last = t;
        analyser.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
        setLevels((prev) => [...prev.slice(1), Math.min(1, rms * 6)]);
      };
      audio.current = { ctx, stream, frame: requestAnimationFrame(tick) };
    } catch {
      setError("couldn't open the microphone; check the browser's permission");
      return;
    }

    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    const trace = (what: string) => console.debug("[dictation]", what);
    r.onaudiostart = () => {
      trace("audiostart");
      setPhase("mic open");
    };
    r.onspeechstart = () => {
      trace("speechstart");
      setPhase("hearing speech");
    };
    r.onresult = (e) => {
      trace(`result ${e.results.length}`);
      setPhase("transcribing");
      let fresh = "";
      let pendingText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) fresh += res[0].transcript;
        else pendingText += res[0].transcript;
      }
      if (fresh) setCommitted((c) => join(c, fresh));
      pendingRef.current = pendingText;
      setInterim(pendingText);
    };
    r.onerror = (e) => {
      trace(`error ${e.error}`);
      if (e.error === "aborted") return;
      // Chrome gives up after ~8s without speech; keep listening, but say so instead of looping silently.
      if (e.error === "no-speech") return setPhase("no speech heard");
      setError(e.error === "not-allowed" ? "microphone permission was denied" : `speech error: ${e.error}`);
      want.current = false;
    };
    // Chrome ends a session after a pause; keep going until the admin taps stop.
    r.onend = () => {
      trace("end");
      if (want.current) {
        try {
          r.start();
          return;
        } catch {}
      }
      const leftover = pendingRef.current;
      pendingRef.current = "";
      if (leftover) setCommitted((c) => join(c, leftover));
      setInterim("");
      setListening(false);
      stopAudio();
    };
    rec.current = r;
    want.current = true;
    setPhase("starting");
    r.start();
    setListening(true);
  }

  function stop() {
    if (!want.current) return;
    want.current = false;
    rec.current?.stop();
  }

  return {
    supported,
    listening,
    levels,
    device,
    error,
    phase,
    text: interim ? join(committed, interim) : committed,
    setText: setCommitted,
    start,
    stop,
  };
}

function join(a: string, b: string) {
  const t = b.trim();
  if (!t) return a;
  return a.trim() ? `${a.trimEnd()} ${t}` : t;
}
