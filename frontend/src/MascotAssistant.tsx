import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, ThermometerSun, Volume2, Trophy } from "lucide-react";

type MascotAssistantProps = {
  comfortScore: number;
  recommendation: string;
  status: string;
};

type BarsikMood = {
  key: "veryHappy" | "happy" | "neutral" | "hot" | "concerned" | "worried";
  label: string;
  image: string;
  badge: string;
  accent: string;
  messages: string[];
};

const MOODS: BarsikMood[] = [
  {
    key: "veryHappy",
    label: "VERY HAPPY",
    image: "/barsik/very-happy.png",
    badge: "😸",
    accent: "#7EE0A8",
    messages: [
      "Perfect conditions for studying! 📚",
      "This is one of the best times to be here!",
      "Everything looks great today!",
    ],
  },
  {
    key: "happy",
    label: "HAPPY",
    image: "/barsik/happy.png",
    badge: "😊",
    accent: "#7BBDE8",
    messages: [
      "Comfortable and quiet.",
      "Looks like a good study session.",
      "Nice conditions right now.",
    ],
  },
  {
    key: "neutral",
    label: "NEUTRAL",
    image: "/barsik/neutral.png",
    badge: "😐",
    accent: "#BDD8E9",
    messages: [
      "Conditions are acceptable.",
      "Not bad, but it could be better.",
      "Still suitable for most activities.",
    ],
  },
  {
    key: "hot",
    label: "HOT / UNCOMFORTABLE",
    image: "/barsik/hot.png",
    badge: "🥵",
    accent: "#FFB15C",
    messages: [
      "It's getting warm in here.",
      "You may feel a bit uncomfortable.",
      "Consider taking a short break.",
    ],
  },
  {
    key: "concerned",
    label: "CONCERNED",
    image: "/barsik/concerned.png",
    badge: "😟",
    accent: "#FBBF24",
    messages: [
      "Noise or temperature is becoming an issue.",
      "Not ideal for focused studying.",
      "Conditions are getting worse.",
    ],
  },
  {
    key: "worried",
    label: "WORRIED",
    image: "/barsik/worried.png",
    badge: "😿",
    accent: "#F87171",
    messages: [
      "I wouldn't recommend studying here right now.",
      "Try coming back later.",
      "Current conditions are uncomfortable.",
    ],
  },
];

function moodForScore(score: number) {
  if (score >= 90) return MOODS[0];
  if (score >= 70) return MOODS[1];
  if (score >= 50) return MOODS[2];
  if (score >= 35) return MOODS[3];
  if (score >= 20) return MOODS[4];
  return MOODS[5];
}

function messageIndex(score: number, status: string) {
  const seed = `${Math.round(score)}-${status}`.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return seed % 3;
}

export default function MascotAssistant({ comfortScore, recommendation, status }: MascotAssistantProps) {
  const [playIntro, setPlayIntro] = useState(false);

  useEffect(() => {
    const seen = sessionStorage.getItem("barsik-intro-seen") === "true";
    setPlayIntro(!seen);
    if (!seen) sessionStorage.setItem("barsik-intro-seen", "true");
  }, []);

  const mood = useMemo(() => moodForScore(comfortScore), [comfortScore]);
  const message = mood.messages[messageIndex(comfortScore, status)];
  const cleanRecommendation = recommendation?.trim() || message;
  const isVeryHappy = mood.key === "veryHappy";
  const isHot = mood.key === "hot";
  const isWorried = mood.key === "worried";
  const isConcerned = mood.key === "concerned";

  const mascotAnimation = isVeryHappy
    ? { y: [0, -12, 0], rotate: [0, -2, 2, 0] }
    : mood.key === "happy"
      ? { y: [0, -7, 0] }
      : isHot
        ? { scale: [1, 1.025, 1], y: [0, 3, 0] }
        : isWorried
          ? { x: [0, -2, 2, -2, 2, 0] }
          : isConcerned
            ? { y: [0, 2, 0] }
            : { y: [0, -3, 0] };

  return (
    <motion.aside
      className="pointer-events-none fixed bottom-3 right-3 z-40 flex max-w-[calc(100vw-1.5rem)] items-end gap-2 sm:bottom-5 sm:right-5 md:bottom-7 md:right-7"
      style={{
        position: "fixed",
        right: "max(0.75rem, env(safe-area-inset-right))",
        bottom: "max(0.75rem, env(safe-area-inset-bottom))",
        top: "auto",
        left: "auto",
        transform: "translateZ(0)",
        willChange: "transform",
      }}
      initial={playIntro ? { x: "-110vw", opacity: 0 } : { x: 0, opacity: 1 }}
      animate={{ x: 0, opacity: 1 }}
      transition={playIntro ? { type: "spring", stiffness: 44, damping: 13, mass: 0.9 } : { duration: 0.2 }}
      aria-label="Barsik comfort assistant"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={`${mood.key}-${Math.round(comfortScore)}`}
          className="pointer-events-auto order-1 max-w-[220px] rounded-2xl border border-white/15 bg-[#001D39]/90 p-3 text-white shadow-2xl shadow-black/30 backdrop-blur-xl sm:max-w-[260px] sm:p-4 md:order-none"
          initial={playIntro ? { opacity: 0, y: 14, scale: 0.94 } : { opacity: 1, y: 0, scale: 1 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.96 }}
          transition={{ delay: playIntro ? 1.1 : 0, duration: 0.35 }}
          style={{ boxShadow: `0 18px 50px ${mood.accent}22` }}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">Barsik</div>
            <div className="rounded-full px-2 py-1 text-[10px] font-bold" style={{ background: `${mood.accent}24`, color: mood.accent }}>
              {mood.badge} {mood.label}
            </div>
          </div>
          <p className="text-sm font-semibold leading-snug text-white sm:text-[15px]">{message}</p>
          <div className="mt-3 space-y-2 text-[11px] leading-snug text-white/65 sm:text-xs">
            <div className="flex gap-2">
              <Trophy size={14} className="mt-0.5 shrink-0" style={{ color: mood.accent }} />
              <span>Current comfort score: {Math.round(comfortScore)}/100</span>
            </div>
            <div className="flex gap-2">
              <Sparkles size={14} className="mt-0.5 shrink-0" style={{ color: mood.accent }} />
              <span>{cleanRecommendation}</span>
            </div>
            {comfortScore >= 70 && (
              <div className="flex gap-2">
                <Volume2 size={14} className="mt-0.5 shrink-0" style={{ color: mood.accent }} />
                <span>Very quiet right now</span>
              </div>
            )}
            {comfortScore < 50 && (
              <div className="flex gap-2">
                <ThermometerSun size={14} className="mt-0.5 shrink-0" style={{ color: mood.accent }} />
                <span>Noise or temperature needs attention</span>
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      <motion.div
        className="pointer-events-auto relative h-28 w-28 shrink-0 sm:h-36 sm:w-36 md:h-44 md:w-44"
        animate={mascotAnimation}
        transition={{ duration: isWorried ? 0.55 : isConcerned ? 3.2 : 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        {isVeryHappy && (
          <div className="absolute -inset-2">
            {[0, 1, 2, 3].map((i) => (
              <motion.span
                key={i}
                className="absolute text-lg"
                style={{ left: `${18 + i * 18}%`, top: `${i % 2 ? 8 : 22}%` }}
                animate={{ opacity: [0, 1, 0], scale: [0.4, 1.2, 0.4], rotate: [0, 18, 0] }}
                transition={{ duration: 1.7, repeat: Infinity, delay: i * 0.24 }}
              >
                ✨
              </motion.span>
            ))}
          </div>
        )}
        {isHot && (
          <motion.div
            className="absolute left-3 top-4 rounded-full bg-sky-200 px-1.5 py-1 text-xs shadow-lg"
            animate={{ y: [0, 10, 0], opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            💧
          </motion.div>
        )}
        {isWorried && (
          <motion.div
            className="absolute right-1 top-4 h-4 w-4 rounded-full bg-red-400 shadow-[0_0_18px_rgba(248,113,113,0.9)]"
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        )}
        <img
          src={mood.image}
          alt={`Barsik ${mood.label.toLowerCase()} mascot`}
          className="h-full w-full object-contain drop-shadow-[0_20px_35px_rgba(0,0,0,0.45)]"
          draggable={false}
        />
      </motion.div>
    </motion.aside>
  );
}
