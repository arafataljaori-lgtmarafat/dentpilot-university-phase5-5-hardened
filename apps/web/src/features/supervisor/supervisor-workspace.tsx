import { useHashRoute, navigate } from '../../routing/hash-router';
import { SupervisorHomePage } from './supervisor-home-page';
import { SupervisorQueuePage } from './supervisor-queue-page';
import { SupervisorCaseDetail } from './supervisor-case-detail';

export function SupervisorWorkspace() {
  const { segments } = useHashRoute();

  // /supervisor -> Home
  // /supervisor/queue -> Queue
  // /supervisor/cases/:id -> Case Detail

  if (segments.length === 1) {
    return <SupervisorHomePage />;
  }

  if (segments[1] === 'queue') {
    return <SupervisorQueuePage />;
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
