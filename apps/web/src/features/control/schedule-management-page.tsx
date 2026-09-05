import { useMemo, useState } from 'react';
import type { DutyScheduleDetailDto, DutyScheduleDto, DutyShiftDto } from '@dentpilot/contracts';
import { api } from '../../api/client';
import { useResource } from '../../api/use-resource';
import { DataTable, EmptyState, ErrorState, Field, LoadingState, PageHeader } from '../../components/ui';
import { navigate } from '../../routing/hash-router';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ar-EG');
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function shortId(value: string): string {
  return value.split('-')[0];
}

function ScheduleDirectoryRow({ schedule, departmentName, academicYearLabel }: { schedule: DutyScheduleDto; departmentName: string; academicYearLabel: string }) {
  return <tr key={schedule.id}>
    <td><b className="mono">{shortId(schedule.id)}</b><small className="block mono">{schedule.id}</small></td>
    <td>{departmentName}</td>
    <td>{academicYearLabel}</td>
    <td>{formatDate(schedule.valid_from)} — {formatDate(schedule.valid_to)}</td>
    <td className="mono">{schedule.timezone}</td>
    <td><button type="button" className="button ghost small" onClick={() => navigate(`/control/schedules/${schedule.id}`)}>فتح التفاصيل</button></td>
  </tr>;
}

export function SchedulesControlPage() {
  const resources = useResource(() => Promise.all([api.controlSchedules(), api.departments(), api.academicYears()]), []);
  const [query, setQuery] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');

  const schedules = resources.data?.[0].items ?? [];
  const departments = resources.data?.[1] ?? [];
  const academicYears = resources.data?.[2] ?? [];
  const visibleSchedules = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return schedules.filter((schedule) => {
      const matchesQuery = !normalizedQuery || schedule.id.toLocaleLowerCase().includes(normalizedQuery) || schedule.timezone.toLocaleLowerCase().includes(normalizedQuery);
      return matchesQuery && (!departmentId || schedule.department_id === departmentId) && (!academicYearId || schedule.academic_year_id === academicYearId);
    });
  }, [academicYearId, departmentId, query, schedules]);

  if (resources.loading) return <LoadingState label="جارٍ تحميل جداول المناوبات…" />;
  if (resources.error) return <ErrorState error={resources.error} onRetry={resources.reload} />;

  return <>
    <PageHeader
      eyebrow="SUPERVISORS & SCHEDULES · CONTROL"
      title="جداول المناوبات"
      description="دليل إداري للقراءة فقط يعرض الجداول والشفتات والمشرفين الذين أعادهم الخادم."
      actions={<span className="read-only-label">قراءة فقط</span>}
    />

    <section className="surface filter-panel" aria-label="فلاتر جداول المناوبات">
      <div className="filter-row">
        <Field label="بحث"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="معرف الجدول أو المنطقة الزمنية" /></Field>
        <Field label="القسم"><select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">كل الأقسام</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></Field>
        <Field label="السنة الأكاديمية"><select value={academicYearId} onChange={(event) => setAcademicYearId(event.target.value)}><option value="">كل السنوات</option>{academicYears.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}</select></Field>
      </div>
      <small className="filter-help">لا توجد إجراءات إنشاء أو تعديل أو حذف في هذه المرحلة.</small>
    </section>

    {!schedules.length ? <EmptyState title="لا توجد جداول مناوبات" description="لم يعُد الخادم جداول ضمن نطاق الحساب الحالي." /> : !visibleSchedules.length ? <EmptyState title="لا توجد نتائج مطابقة" description="غيّر البحث أو الفلاتر لعرض جداول أخرى." /> : <section className="surface"><div className="surface-heading"><div><span className="eyebrow">READ-ONLY SCHEDULE DIRECTORY</span><h2>الجداول ضمن النطاق</h2></div><span className="directory-count">{visibleSchedules.length} من {schedules.length}</span></div><DataTable><thead><tr><th>الجدول</th><th>القسم</th><th>السنة الأكاديمية</th><th>الفترة</th><th>المنطقة الزمنية</th><th /></tr></thead><tbody>{visibleSchedules.map((schedule) => <ScheduleDirectoryRow key={schedule.id} schedule={schedule} departmentName={departments.find((item) => item.id === schedule.department_id)?.name ?? shortId(schedule.department_id)} academicYearLabel={academicYears.find((item) => item.id === schedule.academic_year_id)?.label ?? shortId(schedule.academic_year_id)} />)}</tbody></DataTable></section>}
  </>;
}

function ShiftStatus({ value }: { value: DutyShiftDto['status'] }) {
  const active = value === 'ACTIVE';
  return <span className={`status-badge status-${active ? 'active' : 'inactive'}`}>{active ? 'نشطة' : value === 'CLOSED' ? 'مغلقة' : value === 'REMOVED' ? 'محذوفة' : 'مؤرشفة'}</span>;
}

export function ScheduleDetailControlPage({ id }: { id: string }) {
  const { data, error, loading, reload } = useResource<DutyScheduleDetailDto>(() => api.controlScheduleDetail(id), [id]);

  if (loading) return <LoadingState label="جارٍ تحميل تفاصيل جدول المناوبات…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <EmptyState title="لا توجد بيانات للجدول" description="لم يعُد الخادم تفاصيل هذا الجدول ضمن نطاق الحساب." />;

  const groupedShifts = data.shifts.reduce<Record<string, DutyShiftDto[]>>((acc, shift) => {
    const day = new Date(shift.starts_at).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (!acc[day]) acc[day] = [];
    acc[day].push(shift);
    return acc;
  }, {});

  return <>
    <button type="button" className="back-link" onClick={() => navigate('/control/schedules')}>← العودة إلى الجداول</button>
    <PageHeader
      eyebrow="SCHEDULE DETAIL · READ ONLY"
      title={`جدول المناوبات: ${shortId(data.id)}`}
      description={`${formatDate(data.valid_from)} — ${formatDate(data.valid_to)} · ${data.timezone}`}
      actions={<span className="read-only-label">قراءة فقط</span>}
    />

    <section className="profile-summary surface"><div><span>القسم</span><strong className="mono">{data.department_id}</strong></div><div><span>السنة الأكاديمية</span><strong className="mono">{data.academic_year_id}</strong></div><div><span>الفترة</span><strong>{formatDate(data.valid_from)} — {formatDate(data.valid_to)}</strong></div></section>

    <section className="surface"><div className="surface-heading"><div><span className="eyebrow">DUTY SHIFTS</span><h2>المناوبات والمشرفون المرتبطون</h2></div><span className="directory-count">{data.shifts.length} مناوبة</span></div>{Object.entries(groupedShifts).length ? <div className="schedule-shift-list">{Object.entries(groupedShifts).map(([day, dayShifts]) => <section className="schedule-day" key={day}><h3>{day}</h3>{dayShifts.map((shift) => <article className="schedule-shift-card" key={shift.id}><div className="schedule-shift-time"><strong>{formatTime(shift.starts_at)} — {formatTime(shift.ends_at)}</strong><ShiftStatus value={shift.status} /></div><div><span className="eyebrow">SUPERVISORS</span><div className="schedule-members">{shift.members?.length ? shift.members.map((member) => <span className="schedule-member" key={member.member_id}>{member.supervisor_name ?? 'مشرف غير مسمى'}</span>) : <span className="muted">لا يوجد مشرفون مرتبطون بهذه المناوبة.</span>}</div></div></article>)}</section>)}</div> : <EmptyState title="لا توجد مناوبات" description="لا توجد شفتات مرتبطة بهذا الجدول في البيانات الحالية." />}</section>
  </>;
}
