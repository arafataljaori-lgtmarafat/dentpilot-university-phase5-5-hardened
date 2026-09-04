import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="fatal-error" role="alert"><h1>تعذر عرض البوابة</h1><p>حدث خطأ في واجهة العرض. أعد تحميل الصفحة، ولن تُفقد أي بيانات مؤسسية لأن الواجهة لا تخزنها محليًا.</p><button type="button" className="button primary" onClick={() => window.location.reload()}>إعادة التحميل</button></main>;
    return this.props.children;
  }
}
