"use client";

import { useState, useEffect, useCallback } from "react";
import TutorialTooltip from "./TutorialTooltip";

const TOTAL_STEPS = 7;
const STORAGE_KEY = "deepborn_tutorial";
const REWARD_DUST = 50;

interface TutorialStep {
  title: string;
  description: string;
  emoji: string;
  tooltipTarget?: string;
  tooltipContent?: string;
  tooltipPosition?: "top" | "bottom" | "left" | "right";
}

const STEPS: TutorialStep[] = [
  {
    title: "Welcome to Deepborn!",
    description:
      "You've inherited an underground dungeon filled with secrets. Dig through tiles to discover resources, hatch eggs into loyal pets, and launch raids against other players!",
    emoji: "🏰",
  },
  {
    title: "Dig your first tile",
    description:
      "Select the ⛏️ Dig tool from the bottom bar, then click on any dark solid tile adjacent to a corridor. Each dig reveals resources or even new pets!",
    emoji: "⛏️",
    tooltipTarget: "dig-tool",
    tooltipContent: "Click here to select the Dig tool, then click dark tiles on the map!",
    tooltipPosition: "top",
  },
  {
    title: "Hatch your first egg",
    description:
      "Place a hatchery on a corridor tile using the 🥚 Hatchery tool, then click the hatchery to incubate an egg. Eggs hatch into pets after a short time!",
    emoji: "🥚",
    tooltipTarget: "hatchery-tool",
    tooltipContent: "Use this to place hatcheries and incubate eggs!",
    tooltipPosition: "top",
  },
  {
    title: "Feed your pet",
    description:
      "Your pets need food to stay happy and strong! Open the Pets panel from the sidebar to see your pets and feed them resources you've collected.",
    emoji: "🍖",
    tooltipTarget: "sidebar-pets",
    tooltipContent: "Open the Pets panel here to manage and feed your pets!",
    tooltipPosition: "right",
  },
  {
    title: "Launch your first raid",
    description:
      "Ready for battle? Use the ⚔️ Raid tool to browse other players' dungeons, select your pets, and launch an attack to steal resources!",
    emoji: "⚔️",
    tooltipTarget: "raid-tool",
    tooltipContent: "Browse dungeons and launch raids from here!",
    tooltipPosition: "top",
  },
  {
    title: "Check your quests",
    description:
      "Complete daily and weekly quests for bonus dust and XP! Open the Quests panel in the sidebar to see your active quests and track progress.",
    emoji: "📜",
    tooltipTarget: "sidebar-quests",
    tooltipContent: "View and track your daily/weekly quests here!",
    tooltipPosition: "right",
  },
  {
    title: "You're ready!",
    description: `Congratulations! You've completed the tutorial. As a reward, you've received ${REWARD_DUST} chrono dust. Now go explore your dungeon and build your pet empire!`,
    emoji: "🎉",
  },
];

interface TutorialOverlayProps {
  onComplete?: () => void;
}

function getStoredState(): { currentStep: number; completedSteps: number[]; startedAt: string | null } {
  if (typeof window === "undefined") {
    return { currentStep: 0, completedSteps: [], startedAt: null };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        currentStep: parsed.currentStep ?? 0,
        completedSteps: parsed.completedSteps ?? [],
        startedAt: parsed.startedAt ?? null,
      };
    }
  } catch {
    // corrupted — reset
  }
  return { currentStep: 0, completedSteps: [], startedAt: null };
}

function setStoredState(currentStep: number, completedSteps: number[], startedAt: string | null) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ currentStep, completedSteps, startedAt })
  );
}

export default function TutorialOverlay({ onComplete }: TutorialOverlayProps) {
  const stored = typeof window !== "undefined" ? getStoredState() : { currentStep: 0, completedSteps: [] as number[], startedAt: null as string | null };
  const [currentStep, setCurrentStep] = useState(stored.currentStep);
  const [completedSteps, setCompletedSteps] = useState<number[]>(stored.completedSteps);
  const [startedAt, setStartedAt] = useState<string | null>(stored.startedAt);
  const [isCompleting, setIsCompleting] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipTargetEl, setTooltipTargetEl] = useState<HTMLElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<"top" | "bottom" | "left" | "right">("bottom");
  const [tooltipContent, setTooltipContent] = useState("");

  useEffect(() => {
    if (startedAt === null) return;
    setStoredState(currentStep, completedSteps, startedAt);
  }, [currentStep, completedSteps, startedAt]);

  useEffect(() => {
    if (currentStep === 0) return;
    const step = STEPS[currentStep - 1];
    if (step?.tooltipTarget) {
      const timer = setTimeout(() => {
        const el = document.querySelector(`[data-tutorial="${step.tooltipTarget}"]`) as HTMLElement | null;
        if (el) {
          setTooltipTargetEl(el);
          setTooltipPosition(step.tooltipPosition ?? "bottom");
          setTooltipContent(step.tooltipContent ?? "");
          setShowTooltip(true);
        }
      }, 400);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      setShowTooltip(false);
      setTooltipTargetEl(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [currentStep]);

  const markStepComplete = useCallback(
    async (stepNumber: number) => {
      if (completedSteps.includes(stepNumber)) return;

      const newCompleted = [...completedSteps, stepNumber];
      setCompletedSteps(newCompleted);

      if (stepNumber >= TOTAL_STEPS) {
        setIsCompleting(true);
      }

      // Fire-and-forget API call — don't block UX
      fetch("/api/tutorial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_number: stepNumber }),
      }).catch(() => {});

      setCurrentStep(stepNumber);
    },
    [completedSteps]
  );

  const handleNext = useCallback(() => {
    const stepToComplete = currentStep + 1;
    markStepComplete(stepToComplete);
  }, [currentStep, markStepComplete]);

  const handleSkip = useCallback(() => {
    const allSteps = Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1);
    setCompletedSteps(allSteps);
    setCurrentStep(TOTAL_STEPS);
    setStoredState(TOTAL_STEPS, allSteps, startedAt ?? new Date().toISOString());
    onComplete?.();
  }, [onComplete, startedAt]);

  const handleStart = useCallback(() => {
    const now = new Date().toISOString();
    setStartedAt(now);
    setCurrentStep(1);
    setStoredState(1, [], now);
  }, []);

  const handleFinish = useCallback(() => {
    onComplete?.();
  }, [onComplete]);

  const step = STEPS[currentStep - 1];
  const isComplete = currentStep >= TOTAL_STEPS || isCompleting;

  if (!startedAt) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center">
        <div className="rounded-2xl bg-zinc-900 border border-zinc-700 p-8 max-w-lg text-center shadow-2xl">
          <div className="text-6xl mb-4">🏰</div>
          <h2 className="text-2xl font-bold text-amber-400 mb-4">Welcome to Deepborn!</h2>
          <p className="text-zinc-300 mb-6">
            Learn the basics of dungeon management, pet care, and raiding in this quick tutorial.
          </p>
          <button
            onClick={handleStart}
            className="rounded-lg bg-amber-600 px-6 py-3 text-white font-medium hover:bg-amber-500 transition-colors"
          >
            Start Tutorial
          </button>
        </div>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center">
        <div className="rounded-2xl bg-zinc-900 border border-zinc-700 p-8 max-w-lg text-center shadow-2xl">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-amber-400 mb-4">You&apos;re ready!</h2>
          <p className="text-zinc-300 mb-2">
            Congratulations! You&apos;ve completed the tutorial.
          </p>
          <p className="text-amber-400 font-semibold mb-6">
            +{REWARD_DUST} chrono dust rewarded!
          </p>
          <button
            onClick={handleFinish}
            className="rounded-lg bg-amber-600 px-6 py-3 text-white font-medium hover:bg-amber-500 transition-colors"
          >
            Start Playing!
          </button>
        </div>
      </div>
    );
  }

  if (!step) return null;

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center">
        <div className="rounded-2xl bg-zinc-900 border border-zinc-700 p-8 max-w-lg text-center shadow-2xl">
          <div className="text-6xl mb-4">{step.emoji}</div>
          <h2 className="text-2xl font-bold text-amber-400 mb-4">{step.title}</h2>
          <p className="text-zinc-300 mb-6">{step.description}</p>

          <div className="flex gap-2 justify-center mb-6">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  completedSteps.includes(i + 1)
                    ? "bg-amber-500"
                    : i + 1 === currentStep
                      ? "bg-amber-500"
                      : "bg-zinc-600"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            {currentStep === 1 ? (
              <button
                onClick={handleSkip}
                className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
              >
                Skip Tutorial
              </button>
            ) : (
              <div />
            )}

            <button
              onClick={handleNext}
              className="rounded-lg bg-amber-600 px-6 py-3 text-white font-medium hover:bg-amber-500 transition-colors"
            >
              {currentStep === TOTAL_STEPS ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>

      {showTooltip && tooltipTargetEl && tooltipContent && (
        <TutorialTooltip
          targetEl={tooltipTargetEl}
          position={tooltipPosition}
          content={tooltipContent}
          visible={showTooltip}
          onDismiss={() => setShowTooltip(false)}
        />
      )}
    </>
  );
}
