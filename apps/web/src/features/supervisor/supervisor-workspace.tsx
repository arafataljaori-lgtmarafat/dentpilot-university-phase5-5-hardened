import { useHashRoute, navigate } from '../../routing/hash-router';
import { SupervisorHomePage } from './supervisor-home-page';
import { SupervisorDailySheetPage } from './supervisor-daily-sheet-page';
import { SupervisorQueuePage } from './supervisor-queue-page';
import { SupervisorCaseDetail } from './supervisor-case-detail';
import { SupervisorHistoryPage } from './supervisor-history-page';
import { SupervisorSummaryPage } from './supervisor-summary-page';

export function SupervisorWorkspace() {
  const { segments } = useHashRoute();

  // /supervisor -> Home
  // /supervisor/daily-sheet -> Daily Sheet
  // /supervisor/queue -> Queue
  // /supervisor/history -> History
  // /supervisor/summary -> Summary
  // /supervisor/cases/:id -> Case Detail

  if (segments.length === 1) {
    return <SupervisorHomePage />;
  }

  if (segments[1] === 'daily-sheet') {
    return <SupervisorDailySheetPage />;
  }

  if (segments[1] === 'queue') {
    return <SupervisorQueuePage />;
  }

  if (segments[1] === 'history') {
    return <SupervisorHistoryPage />;
  }

  if (segments[1] === 'summary') {
    return <SupervisorSummaryPage />;
  }

  if (segments[1] === 'cases' && segments[2]) {
    return <SupervisorCaseDetail id={segments[2]} />;
  }

  // Not found / fallback
  return <div className="page-blank">
    <h2>Page not found in Clinical Workspace</h2>
    <button className="button" onClick={() => navigate('/supervisor')}>العودة للرئيسية</button>
  </div>;
}
