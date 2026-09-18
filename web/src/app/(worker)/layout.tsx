import { gatePage } from '@/lib/auth';

export default async function WorkerLayout({ children }: LayoutProps<'/'>) {
  await gatePage('worker');
  return children;
}
