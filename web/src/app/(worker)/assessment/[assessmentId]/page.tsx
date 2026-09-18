import { AssessmentView } from '@/components/worker/assessment-view';

export default async function AssessmentPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;

  return <AssessmentView assessmentId={assessmentId} />;
}
