import { notFound } from 'next/navigation';
import { TRADES_CATALOG } from '@/data/curriculum';
import { TradeSyllabusView } from '@/components/worker/trade-syllabus-view';

export default async function CourseDetailPage({
  params,
}: PageProps<'/learn/[tradeId]'>) {
  const { tradeId } = await params;
  const trade = TRADES_CATALOG[tradeId];

  if (!trade) {
    notFound();
  }

  return <TradeSyllabusView trade={trade} tradeId={tradeId} />;
}
