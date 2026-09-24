import { PageHeader } from '../src/widgets/page-header/PageHeader';
import { ResultsPanel } from '../src/widgets/results-panel/ResultsPanel';

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageHeader />
      <ResultsPanel />
    </div>
  );
}
