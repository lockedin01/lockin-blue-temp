import { notFound } from 'next/navigation';
import simulationsRegistry from '@/data/simulations-modular-registry.json';
import { ModularSimulationViewer, type ModularSimData } from '@/components/viewer/modular-simulation-viewer';

export default async function SimulationPage({ params }: PageProps<'/simulation/[simId]'>) {
  const { simId } = await params;

  const registry = simulationsRegistry as Record<string, ModularSimData>;

  // Match by ID or by slug
  let sim = registry[simId];
  if (!sim) {
    sim = Object.values(registry).find(
      (s) => s.slug === simId || s.slug === `${simId}-simulation` || s.id === simId
    )!;
  }

  if (!sim) {
    // Default to first simulation if not found
    sim = registry['194'] || Object.values(registry)[0];
  }

  if (!sim) {
    notFound();
  }

  return <ModularSimulationViewer sim={sim} />;
}
