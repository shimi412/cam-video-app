"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { StoryboardSheetSchema } from "@/lib/concept/storyboard-review";
import { sceneMediaUrl } from "@/lib/concept/preview-inputs";
import { presenterFontSize } from "@/lib/concept/presenter-text";

type Props = {
  jobId: string;
  title: string;
  sheet: z.infer<typeof StoryboardSheetSchema>;
  voice: { file: string; phraseStart: number; phraseEnd: number; words: { text: string; start: number }[] };
  descriptions: { title: string; action: string }[];
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function StoryboardProposal({ jobId, title, sheet, voice, descriptions }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(voice.phraseEnd + .4);
  const [error, setError] = useState("");
  const duration = voice.phraseEnd - voice.phraseStart + 1.2;
  useEffect(() => {
    if (!playing) return;
    let frame: number;
    function tick() {
      const element = audio.current;
      if (!element) return;
      setTime(element.currentTime);
      if (element.paused || element.ended) { setPlaying(false); return; }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  async function play() {
    if (!audio.current) return;
    setError("");
    audio.current.currentTime = 0;
    setTime(0);
    try { await audio.current.play(); setPlaying(true); }
    catch { setError("La lecture n’a pas démarré. Réessaie avec le bouton."); }
  }
  // The preview audio is a local excerpt with 400 ms of headroom. Use exactly
  // the same word times, entry and emphasis durations as the production title.
  const absoluteTime = playing ? time + voice.phraseStart - .4 : time;
  const alpha = clamp((voice.phraseEnd + .8 - absoluteTime) / .25);
  function titleWord(text: string, index: number) {
    const enterAt = voice.phraseStart + Math.min(index * .06, .24);
    const progress = clamp((absoluteTime - enterAt) / .28);
    const emphasis = clamp((absoluteTime - voice.words[index].start) / .16);
    const start = [59, 36, 22], end = [23, 102, 166];
    const color = `rgb(${start.map((n, i) => Math.round(n + (end[i] - n) * emphasis)).join(",")})`;
    return <span key={index} style={{ display: "inline-block", opacity: progress, transform: `translateY(${(1 - progress) * 8}px)`, color }}>{text}</span>;
  }
  return <section className="space-y-7" lang="fr">
    <header>
      <p className="text-xs font-semibold tracking-widest text-accent uppercase">CAM · Storyboard à valider</p>
      <h1 className="text-3xl font-semibold mt-2">{title}</h1>
      <p className="text-sm text-muted mt-3">Les deux premiers plans sont conservés. Le troisième devient une adresse simple au spectateur, avec les mots de la narration au-dessus du personnage.</p>
      <p className="text-sm text-accent mt-2">Aucune animation vidéo lancée. Aucun crédit fal.ai utilisé pour ce storyboard.</p>
    </header>
    <div className="grid grid-cols-1 min-[600px]:grid-cols-3 gap-5" id="storyboard-panels">
      {sheet.panels.map((panel, i) => {
        const presenter = panel.visualMode === "presenter-text";
        const image = presenter ? panel.start : panel.end ?? panel.start;
        return <article key={panel.scene} className="rounded-2xl border border-line bg-surface overflow-hidden">
          <div className="px-4 pt-4 pb-3 min-h-24">
            <p className="text-xs text-muted">{String(i + 1).padStart(2, "0")} · {presenter ? "NOUVEAU PLAN" : "PLAN CONSERVÉ"}</p>
            <h2 className="font-semibold mt-1">{descriptions[i].title}</h2>
          </div>
          <div style={{ position: "relative", aspectRatio: "9/16", containerType: "inline-size", background: "#fff4dc" }}>
            {image && <Image unoptimized fill sizes="(max-width: 600px) 100vw, 300px" src={sceneMediaUrl(jobId, image)} alt={descriptions[i].title} style={{ objectFit: "cover" }} />}
            {presenter && <div aria-label="Texte au-dessus du personnage" style={{ position: "absolute", left: "10%", top: "12%", width: "76%", padding: "1.67% 2.04%", borderRadius: "1.85cqw", background: "rgba(255,244,220,.96)", opacity: alpha, color: "#3b2416", fontFamily: "Arial, sans-serif", fontSize: `${presenterFontSize(panel.overlay ?? "", 1080, 1920) / 10.8}cqw`, fontWeight: 900, lineHeight: 1.16, textAlign: "center", textWrap: "balance", textTransform: "uppercase" }}>
              {voice.words.map((word, j) => <span key={j}>{j > 0 ? " " : ""}{titleWord(word.text, j)}</span>)}
            </div>}
          </div>
          <div className="p-4 space-y-3">
            <p className="text-sm font-semibold">“{panel.narration}”</p>
            <p className="text-sm text-muted">{descriptions[i].action}</p>
            {!presenter && panel.start && <details className="text-xs text-muted">
              <summary className="cursor-pointer">Voir l’image de départ</summary>
              <Image unoptimized width={panel.start.width} height={panel.start.height} src={sceneMediaUrl(jobId, panel.start)} alt={`Départ du plan ${panel.scene}`} className="w-full rounded-lg mt-2" />
            </details>}
          </div>
        </article>;
      })}
    </div>
    <section className="rounded-2xl border border-accent/40 bg-surface p-5 space-y-3">
      <h2 className="font-semibold">Essayer le texte avec la narration</h2>
      <p className="text-sm text-muted">Le texte entre en fondu et monte légèrement, puis chaque mot passe au bleu au moment où il est prononcé. Le personnage reste fixe dans cet aperçu ; son léger geste sera animé après validation.</p>
      <div className="flex gap-4 items-center flex-wrap">
        <button onClick={() => void play()} className="bg-accent text-white rounded-lg px-4 py-2">{playing ? "Rejouer" : "Lire le texte avec la narration"}</button>
        <button onClick={() => { audio.current?.pause(); setPlaying(false); setTime(voice.phraseEnd + .4); }} className="text-sm text-accent">Revenir à la planche fixe</button>
      </div>
      <label className="text-xs text-muted block">Scruter l’animation du texte
        <input aria-label="Position de l’animation du texte" className="w-full mt-2" type="range" min={voice.phraseStart - .4} max={voice.phraseEnd + .8} step=".01" value={playing ? absoluteTime : time} onChange={e => { audio.current?.pause(); setPlaying(false); setTime(Number(e.target.value)); }} />
      </label>
      <audio ref={audio} preload="metadata" src={`/api/media/concepts/${jobId}/live/storyboard-proposal/${voice.file}`} onEnded={() => { setPlaying(false); setTime(voice.phraseEnd + .4); }} />
      <p className="text-xs text-muted">Aperçu d’environ {duration.toFixed(1).replace(".", ",")} secondes, avec un extrait de la narration déjà enregistrée.</p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </section>
    <section className="rounded-2xl border border-line bg-surface p-5 flex items-center gap-6 flex-wrap">
      <div className="rounded-xl bg-[#fff4dc] p-5 w-48 shrink-0">
        <Image unoptimized src="/recipes/cam-clay/logo.png" width={1200} height={630} alt="Logo original Combat Antisemitism Movement" style={{ mixBlendMode: "multiply" }} />
      </div>
      <div className="flex-1 min-w-52">
        <p className="text-xs text-muted">04 · FIN CAM</p>
        <h2 className="font-semibold mt-1">Laisser la phrase se terminer</h2>
        <p className="text-sm text-muted mt-2">Un temps de respiration, puis le logo CAM sur fond crème. La musique accompagne la fin et s’éteint en fondu. Aucun changement sonore abrupt.</p>
      </div>
    </section>
    <footer className="text-sm text-muted space-y-2">
      <p>À valider : l’enchaînement des quatre étapes, le cadrage du personnage et le texte au-dessus de sa tête. Dis-moi si cette planche te convient, ou ce que tu veux changer, avant de lancer la vidéo.</p>
      <Link href={`/production/${jobId}`} className="text-accent">Revenir à la production</Link>
    </footer>
  </section>;
}
