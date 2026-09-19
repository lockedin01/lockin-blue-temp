import { notFound } from 'next/navigation';

import { LessonView } from '@/components/worker/lesson-view';
import { LESSONS_DATABASE } from '@/data/curriculum';
import simulationsRegistry from '@/data/simulations-modular-registry.json';
import { ModularSimulationViewer, type ModularSimData } from '@/components/viewer/modular-simulation-viewer';

export default async function LessonPage({ params }: PageProps<'/lesson/[lessonId]'>) {
  const { lessonId } = await params;

  // 1. Check if it's an authored procedural lesson
  if (LESSONS_DATABASE[lessonId]) {
    return <LessonView lesson={LESSONS_DATABASE[lessonId]} />;
  }

  // 2. Check if it's a modular simulation from the 495 Lunchbox Sessions catalog
  const registry = simulationsRegistry as Record<string, ModularSimData>;
  let matchedSim: ModularSimData | undefined = registry[lessonId];
  if (!matchedSim) {
    matchedSim = Object.values(registry).find(
      (s) => s.slug === lessonId || s.id === lessonId || `${s.slug}-simulation` === lessonId
    );
  }

  if (matchedSim) {
    const simData: ModularSimData = matchedSim;
    return <ModularSimulationViewer sim={simData} />;
  }

  // 3. Fallback to default HPU lesson
  const fallbackLesson = LESSONS_DATABASE['lesson-hpu-startup'];
  if (!fallbackLesson) {
    notFound();
  }

  return <LessonView lesson={fallbackLesson} />;
}
