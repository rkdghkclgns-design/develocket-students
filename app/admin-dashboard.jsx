/* ==========================================================================
   관리자 대시보드 — 3가지 레이아웃 (cards, table, kanban)
   - 수강생별 마지막 입력 후 경과일 (색상 + 배지)
   - 오늘 보고 작성 여부
   - 주간 목표 진행률 평균
   - 지원 공고 / 면접 진행
   - 일일/주간 목표 달성률 차트
   - 수강생 클릭 → 상세 드로어 (코멘트, 최근 보고 보기)
   ========================================================================== */

function AdminDashboard({ cohortId, dangerThreshold, layout, onLogout, onSwitchCohort, onChangeLayout, onChangeThreshold }) {
  const cohort = window.STUDENT_ROSTER[cohortId];
  const cohortMeta = window.STORE.getCohort(cohortId);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all' | 'not-today' | 'today-done' | 'danger' | 'warn' | 'fresh' | 'never' | 'overdue-planned' | 'has-interview' | 'has-applied' | 'employed' | `grade:A` | `emp:구직중`
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'elapsed', dir: 'desc' });
  const [drawer, setDrawer] = useState(null);
  const [view, setView] = useState('students'); // students | study-room | lectures
  const [kpiTarget, setKpiTarget] = useState(0.7);
  const [_, force] = useState(0);

  function reload() { setRows(window.STORE.getDashboardRows(cohortId)); }
  useEffect(() => {
    reload();
    return window.STORE.onChange(() => reload());
  }, [cohortId]);

  /* ----- summary stats ----- */
  const stats = useMemo(() => {
    const total = rows.length;
    const todayDone = rows.filter(r => r.todayDone).length;
    const danger = rows.filter(r => elapsedTier(r.elapsed, dangerThreshold) === 'danger' || r.elapsed === null).length;
    const goalAvg = total === 0 ? 0 : Math.round(rows.reduce((sum, r) => sum + r.weeklyGoalPct, 0) / total);
    const totalApplied = rows.reduce((s, r) => s + r.appliedCount, 0);
    const totalInterview = rows.reduce((s, r) => s + r.interviewingCount, 0);
    const overduePlanned = rows.reduce((s, r) => s + r.overduePlannedCount, 0);
    const overdueStudents = rows.filter(r => r.overduePlannedCount > 0).length;
    return { total, todayDone, danger, goalAvg, totalApplied, totalInterview, overduePlanned, overdueStudents };
  }, [rows, dangerThreshold]);

  /* ----- filtering + sorting ----- */
  const EMPLOYED_STATUSES = ['직종 취업', '알바', '창업'];
  const visibleRows = useMemo(() => {
    let r = rows.slice();
    const q = search.trim().toLowerCase();
    if (q) {
      r = r.filter(x =>
        x.student.name.toLowerCase().includes(q) ||
        (x.student.email || '').toLowerCase().includes(q) ||
        (x.student.phone || '').toLowerCase().includes(q) ||
        (x.student.education || '').toLowerCase().includes(q) ||
        (x.student.career_goal || '').toLowerCase().includes(q)
      );
    }
    if (filter === 'not-today') r = r.filter(x => !x.todayDone);
    else if (filter === 'today-done') r = r.filter(x => x.todayDone);
    else if (filter === 'danger') r = r.filter(x => x.elapsed === null || elapsedTier(x.elapsed, dangerThreshold) === 'danger');
    else if (filter === 'warn') r = r.filter(x => elapsedTier(x.elapsed, dangerThreshold) === 'warn');
    else if (filter === 'fresh') r = r.filter(x => elapsedTier(x.elapsed, dangerThreshold) === 'fresh');
    else if (filter === 'never') r = r.filter(x => x.elapsed === null);
    else if (filter === 'overdue-planned') r = r.filter(x => x.overduePlannedCount > 0);
    else if (filter === 'has-applied') r = r.filter(x => x.appliedCount > 0);
    else if (filter === 'has-interview') r = r.filter(x => x.interviewingCount > 0);
    else if (filter === 'employed') r = r.filter(x => EMPLOYED_STATUSES.includes(x.student.employment_status));
    else if (filter === 'in-pool') r = r.filter(x => !x.student.excluded_from_pool);
    else if (filter === 'excluded-pool') r = r.filter(x => !!x.student.excluded_from_pool);
    else if (filter.startsWith('grade:')) {
      const g = filter.slice(6);
      r = r.filter(x => (x.student.grade || '미분류') === g);
    } else if (filter.startsWith('emp:')) {
      const e = filter.slice(4);
      r = r.filter(x => (x.student.employment_status || '구직중') === e);
    }
    r.sort((a, b) => {
      let av, bv;
      if (sort.key === 'elapsed') {
        av = a.elapsed === null ? 9999 : a.elapsed;
        bv = b.elapsed === null ? 9999 : b.elapsed;
      } else if (sort.key === 'name') {
        return sort.dir === 'asc' ? a.student.name.localeCompare(b.student.name, 'ko') : b.student.name.localeCompare(a.student.name, 'ko');
      } else if (sort.key === 'goal') {
        av = a.weeklyGoalPct; bv = b.weeklyGoalPct;
      } else if (sort.key === 'applied') {
        av = a.appliedCount; bv = b.appliedCount;
      }
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
    return r;
  }, [rows, filter, sort, dangerThreshold, search]);

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  }

  return (
    <div className="float-in">
      {/* Header */}
      <div className="admin-header">
        <div className="admin-title-row">
          <h1 className="h1">👨‍🏫 관리자 대시보드</h1>
          <div className="admin-subtitle">
            {cohort.label} · {cohort.track} · 총 {stats.total}명 ·
            <span style={{ marginLeft: 6, color: stats.danger > 0 ? 'var(--alert-danger)' : 'var(--alert-fresh)', fontWeight: 600 }}>
              ⚠ 주의 필요 {stats.danger}명
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* View switch */}
          <div className="layout-switch">
            <button className={view === 'students' ? 'active' : ''} onClick={() => setView('students')}>👥 수강생</button>
            <button className={view === 'study-room' ? 'active' : ''} onClick={() => setView('study-room')}>📚 자습실</button>
            <button className={view === 'lectures' ? 'active' : ''} onClick={() => setView('lectures')}>🎤 특강</button>
          </div>
          <AdminManageButton
            cohortId={cohortId}
            kpiTarget={kpiTarget}
            onChangeKpi={setKpiTarget}
            onChange={() => { reload(); force(x => x + 1); }}
          />
          <button className="btn btn-secondary btn-sm"
            onClick={() => {
              if (!cohortMeta) return;
              if (!confirm(
                `${cohort.label} 기수를 종료(아카이브)하시겠어요?\n` +
                `\n` +
                `· 수강생 ${stats.total}명과 모든 보고/공고/코멘트 데이터는 보존됩니다.\n` +
                `· 로그인·관리자 화면에서는 더 이상 노출되지 않습니다.\n` +
                `· [관리 → 기수] 메뉴에서 언제든 복구할 수 있습니다.`
              )) return;
              window.STORE.archiveCohort(cohortId);
              const remaining = window.getActiveCohortIds();
              if (remaining.length > 0 && onSwitchCohort) onSwitchCohort(remaining[0]);
              reload();
              force(x => x + 1);
            }}
            title="현재 기수 종료(아카이브)"
            style={{ color: 'var(--alert-danger)' }}>
            🗂️ 기수 종료
          </button>
          {view === 'students' && (
            <div className="layout-switch">
              <button className={layout === 'cards' ? 'active' : ''} onClick={() => onChangeLayout('cards')}>
                <Icon.Grid /> 카드
              </button>
              <button className={layout === 'table' ? 'active' : ''} onClick={() => onChangeLayout('table')}>
                <Icon.List /> 테이블
              </button>
              <button className={layout === 'kanban' ? 'active' : ''} onClick={() => onChangeLayout('kanban')}>
                <Icon.Columns /> 칸반
              </button>
            </div>
          )}
        </div>
      </div>

      {/* KPI bar - 관리자 전용 (클릭 → 필터) */}
      <AdminKPIBar
        cohortId={cohortId}
        kpiTarget={kpiTarget}
        activeFilter={filter}
        onFilter={(key) => setFilter(prev => prev === key ? 'all' : key)}
      />

      {view === 'study-room' && (
        <AttendancePanel cohortId={cohortId} type="study_room" kind="study" />
      )}
      {view === 'lectures' && (
        <AttendancePanel cohortId={cohortId} type="lectures" kind="lecture" />
      )}

      {view === 'students' && <></>}

      {view === 'students' && (
        <>
          {/* Summary Cards (클릭 → 필터) */}
          <div className="summary-grid">
        <SummaryCard
          decor="var(--brand-primary)"
          label="오늘 보고 작성"
          value={stats.todayDone}
          unit={`/ ${stats.total}명`}
          foot={`${stats.total > 0 ? Math.round(stats.todayDone / stats.total * 100) : 0}% 완료`}
          filterKey="today-done"
          activeFilter={filter}
          onFilter={setFilter}
        />
        <SummaryCard
          decor="var(--alert-danger)"
          label={`주의 필요 (≥${dangerThreshold}일)`}
          value={stats.danger}
          unit="명"
          valueColor={stats.danger > 0 ? 'var(--alert-danger)' : 'var(--ink)'}
          foot={`${stats.danger}명이 연락 필요`}
          filterKey="danger"
          activeFilter={filter}
          onFilter={setFilter}
        />
        <div className="summary-card">
          <div className="summary-decor" style={{ background: 'var(--brand-accent)' }}></div>
          <div className="summary-label">주간 목표 평균</div>
          <div className="summary-value">{stats.goalAvg}<small>%</small></div>
          <ProgressBar value={stats.goalAvg} />
        </div>
        <SummaryCard
          decor="var(--alert-fresh)"
          label="지원 / 면접 진행"
          value={stats.totalApplied}
          unit="건"
          foot={<>면접 진행 <b style={{ color: 'var(--brand-accent)' }}>{stats.totalInterview}</b>건</>}
          filterKey="has-applied"
          activeFilter={filter}
          onFilter={setFilter}
        />
        <SummaryCard
          decor="#FF8A3D"
          label="⏰ 지원 예정일 지남"
          value={stats.overduePlanned}
          unit="건"
          valueColor={stats.overduePlanned > 0 ? 'var(--alert-danger)' : 'var(--ink)'}
          foot={stats.overdueStudents > 0
            ? <>수강생 <b>{stats.overdueStudents}</b>명 지원 누락</>
            : '모든 예정일 준수 중'}
          filterKey="overdue-planned"
          activeFilter={filter}
          onFilter={setFilter}
          borderHighlight={stats.overduePlanned > 0}
        />
      </div>

      {/* Search */}
      <div className="admin-search">
        <div className="student-search" style={{ marginBottom: 0, flex: 1 }}>
          <Icon.Search />
          <input className="input"
            placeholder="이름·이메일·전화·학력·진로 검색"
            value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        {search && (
          <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>
            <Icon.X /> 초기화
          </button>
        )}
        <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {visibleRows.length} / {rows.length}명
        </span>
      </div>

      {/* Filter chips */}
      <div className="filter-bar">
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink-soft)' }}>필터:</span>
        {[
          { k: 'all', label: '전체', n: rows.length },
          { k: 'today-done', label: '✓ 오늘 작성', n: rows.filter(r => r.todayDone).length },
          { k: 'not-today', label: '오늘 미작성', n: rows.filter(r => !r.todayDone).length },
          { k: 'danger', label: `${dangerThreshold}일+ 미입력`, n: rows.filter(r => r.elapsed === null || elapsedTier(r.elapsed, dangerThreshold) === 'danger').length },
          { k: 'warn', label: '주의', n: rows.filter(r => elapsedTier(r.elapsed, dangerThreshold) === 'warn').length },
          { k: 'fresh', label: '활발', n: rows.filter(r => elapsedTier(r.elapsed, dangerThreshold) === 'fresh').length },
          { k: 'never', label: '미입력', n: rows.filter(r => r.elapsed === null).length },
          { k: 'has-applied', label: '지원중', n: rows.filter(r => r.appliedCount > 0).length },
          { k: 'has-interview', label: '면접 진행', n: rows.filter(r => r.interviewingCount > 0).length },
          { k: 'employed', label: '✓ 취업', n: rows.filter(r => EMPLOYED_STATUSES.includes(r.student.employment_status)).length },
          { k: 'overdue-planned', label: '⏰ 지원 예정일 지남', n: rows.filter(r => r.overduePlannedCount > 0).length },
          { k: 'excluded-pool', label: '⊘ 모수 제외', n: rows.filter(r => !!r.student.excluded_from_pool).length }
        ].map(f => (
          <button key={f.k} className={`chip ${filter === f.k ? 'active' : ''}`} onClick={() => setFilter(f.k)}>
            {f.label} <span style={{ marginLeft: 4, opacity: 0.7 }}>({f.n})</span>
          </button>
        ))}
        {/* 동적 필터(KPI 분포에서 선택된 항목) 표시 */}
        {(filter.startsWith('grade:') || filter.startsWith('emp:')) && (
          <button className="chip active" onClick={() => setFilter('all')}>
            {filter.startsWith('grade:') ? `🏷️ 등급 ${filter.slice(6)}` : `💼 ${filter.slice(4)}`}
            <span style={{ marginLeft: 6, opacity: 0.85 }}>✕</span>
          </button>
        )}
      </div>

      {/* Body — layout switch */}
      {layout === 'cards' && (
        <CardsLayout rows={visibleRows} threshold={dangerThreshold} onPick={setDrawer} />
      )}
      {layout === 'table' && (
        <TableLayout rows={visibleRows} threshold={dangerThreshold} sort={sort} toggleSort={toggleSort} onPick={setDrawer} />
      )}
      {layout === 'kanban' && (
        <KanbanLayout rows={visibleRows} threshold={dangerThreshold} onPick={setDrawer} />
      )}
        </>
      )}

      {/* Detail popup (modal) */}
      {drawer && (
        <StudentDetailModal
          row={drawer}
          threshold={dangerThreshold}
          onClose={() => setDrawer(null)}
          onUpdate={() => { reload(); force(x => x + 1); }}
        />
      )}
    </div>
  );
}

/* ==========================================================================
   StudentDetailModal — React Portal + 인라인 스타일로 stacking context 회피
   - document.body 직속에 렌더링 → 부모 transform/overflow/contain 영향 0
   - 인라인 스타일로 CSS 충돌 방지
   - ESC, 오버레이 클릭으로 닫기
   ========================================================================== */
function StudentDetailModal({ row, threshold, onClose, onUpdate }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    top: 0, right: 0, bottom: 0, left: 0,
    width: '100vw',
    height: '100vh',
    zIndex: 99999,
    background: 'rgba(20, 12, 50, 0.5)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    boxSizing: 'border-box',
    animation: 'fadein 0.18s ease both'
  };
  const boxStyle = {
    background: '#FFFFFF',
    borderRadius: '20px',
    boxShadow: '0 24px 64px rgba(20, 12, 50, 0.32)',
    width: 'min(760px, calc(100vw - 48px))',
    maxHeight: 'calc(100vh - 48px)',
    minHeight: '320px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    animation: 'pop 0.22s cubic-bezier(0.16, 1, 0.3, 1) both'
  };
  const scrollWrapStyle = {
    overflowY: 'auto',
    overflowX: 'hidden',
    flex: '1 1 auto',
    minHeight: 0,
    WebkitOverflowScrolling: 'touch'
  };

  const node = (
    <div style={overlayStyle}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={boxStyle} role="dialog" aria-modal="true" aria-label="학생 상세 정보">
        <div style={scrollWrapStyle}>
          <StudentDetail row={row} threshold={threshold} onClose={onClose} onUpdate={onUpdate} />
        </div>
      </div>
    </div>
  );

  // React Portal: document.body 직속에 렌더 → 부모 stacking context 우회
  return ReactDOM.createPortal(node, document.body);
}

window.StudentDetailModal = StudentDetailModal;

/* ============= Layouts ============= */
function CardsLayout({ rows, threshold, onPick }) {
  if (rows.length === 0) return <div className="empty"><div className="big">✨</div>조건에 맞는 수강생이 없습니다</div>;
  return (
    <div className="student-card-grid">
      {rows.map(r => {
        const tier = elapsedTier(r.elapsed, threshold);
        const hasOverdue = r.overduePlannedCount > 0;
        return (
          <div key={r.student.id}
            className={`student-card ${tier === 'danger' ? 'danger' : tier === 'warn' ? 'warn' : ''} ${hasOverdue ? 'has-overdue' : ''}`}
            onClick={() => onPick(r)}>
            <div className="student-card-head">
              <Avatar name={r.student.name} size={42} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="student-card-name">
                  {r.student.name}
                  {hasOverdue && (
                    <span className="pill" style={{ background: 'var(--alert-danger-bg)', color: 'var(--alert-danger)', fontSize: 10, marginLeft: 6 }}>
                      ⏰{r.overduePlannedCount}
                    </span>
                  )}
                </div>
                <div className="student-card-meta">{r.student.education?.split('/')[0] || '—'}</div>
              </div>
              <ElapsedBadge days={r.elapsed} threshold={threshold} />
            </div>
            <div className="student-card-body">
              {r.todayDone ? (
                <span style={{ color: 'var(--alert-fresh)', fontWeight: 600 }}>
                  ✓ 오늘 보고 작성 완료 {window.moodIcon(r.lastMood)}
                </span>
              ) : (
                <span className="muted">오늘 미작성</span>
              )}
              {hasOverdue && (
                <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--alert-danger-bg)', color: 'var(--alert-danger)', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600 }}>
                  ⏰ 지원 예정일 지남 {r.overduePlannedCount}건
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span className="muted">주간 목표</span>
                  <span style={{ fontWeight: 700 }}>{r.weeklyGoalPct}%</span>
                </div>
                <ProgressBar value={r.weeklyGoalPct} />
              </div>
            </div>
            <div className="student-card-foot">
              <div className="kv"><span className="k">지원</span><span className="v">{r.appliedCount}</span></div>
              <div className="kv"><span className="k">면접</span><span className="v" style={{ color: 'var(--brand-accent)' }}>{r.interviewingCount}</span></div>
              <div className="kv"><span className="k">코멘트</span><span className="v">{r.commentCount}</span></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TableLayout({ rows, threshold, sort, toggleSort, onPick }) {
  if (rows.length === 0) return <div className="empty">조건에 맞는 수강생이 없습니다</div>;
  const arrow = (k) => sort.key === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return (
    <div className="card table-card">
      <div style={{ overflowX: 'auto' }}>
        <table className="dash-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => toggleSort('name')}>이름{arrow('name')}</th>
              <th>오늘</th>
              <th className="sortable" onClick={() => toggleSort('elapsed')}>마지막 입력{arrow('elapsed')}</th>
              <th className="sortable" onClick={() => toggleSort('goal')}>주간 목표{arrow('goal')}</th>
              <th className="sortable" onClick={() => toggleSort('applied')}>지원{arrow('applied')}</th>
              <th>면접</th>
              <th>최근 상태</th>
              <th>코멘트</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.student.id} onClick={() => onPick(r)}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={r.student.name} size={32} />
                    <div>
                      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {r.student.name}
                        {r.overduePlannedCount > 0 && (
                          <span className="pill" style={{ background: 'var(--alert-danger-bg)', color: 'var(--alert-danger)', fontSize: 10 }}>
                            ⏰{r.overduePlannedCount}
                          </span>
                        )}
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>{r.student.education?.split('/')[0] || '—'}</div>
                    </div>
                  </div>
                </td>
                <td>{r.todayDone ? <span style={{ color: 'var(--alert-fresh)', fontWeight: 700 }}>✓ {window.moodIcon(r.lastMood)}</span> : <span className="muted">—</span>}</td>
                <td><ElapsedBadge days={r.elapsed} threshold={threshold} /> {r.lastReportDate && <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>({r.lastReportDate})</span>}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
                    <div style={{ flex: 1 }}><ProgressBar value={r.weeklyGoalPct} /></div>
                    <span style={{ fontSize: 12, fontWeight: 700, minWidth: 32, textAlign: 'right' }}>{r.weeklyGoalPct}%</span>
                  </div>
                </td>
                <td style={{ fontWeight: 600 }}>{r.appliedCount}</td>
                <td style={{ fontWeight: 600, color: r.interviewingCount > 0 ? 'var(--brand-accent)' : 'var(--ink-mute)' }}>{r.interviewingCount || '—'}</td>
                <td>{r.lastStatus ? <StatusPill status={r.lastStatus} /> : <span className="muted">—</span>}</td>
                <td>{r.commentCount > 0 ? <span className="pill" style={{ background: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}><Icon.Message /> {r.commentCount}</span> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KanbanLayout({ rows, threshold, onPick }) {
  const cols = {
    fresh:  { title: '✅ 활발', rows: [] },
    warn:   { title: '⚠️ 주의', rows: [] },
    danger: { title: '🚨 위험', rows: [] },
    never:  { title: '⭕ 미입력', rows: [] }
  };
  rows.forEach(r => {
    if (r.elapsed === null) cols.never.rows.push(r);
    else cols[elapsedTier(r.elapsed, threshold)].rows.push(r);
  });
  return (
    <div className="kanban">
      {['fresh', 'warn', 'danger', 'never'].map(k => (
        <div key={k} className={`kanban-col ${k}`}>
          <div className="kanban-head">
            <span>{cols[k].title}</span>
            <span className="count">{cols[k].rows.length}</span>
          </div>
          {cols[k].rows.map(r => (
            <div key={r.student.id} className="kanban-card" onClick={() => onPick(r)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <Avatar name={r.student.name} size={28} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{r.student.name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {r.lastReportDate ? `최근: ${r.lastReportDate}` : '미입력'}
                  </div>
                </div>
              </div>
              <ElapsedBadge days={r.elapsed} threshold={threshold} />
            </div>
          ))}
          {cols[k].rows.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 8px', color: 'var(--ink-mute)', fontSize: 12 }}>없음</div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ============= Detail Drawer ============= */
function StudentDetail({ row, threshold, onClose, onUpdate }) {
  const s = row.student;
  const [comments, setComments] = useState(window.STORE.listComments(s.id));
  const [newComment, setNewComment] = useState('');
  const [newVisibility, setNewVisibility] = useState('both');
  const [reports, setReports] = useState(window.STORE.listReports(s.id));
  const [jobs, setJobs] = useState(window.STORE.listJobs(s.id));
  const [tab, setTab] = useState('overview'); // overview | reports | jobs | comments | info

  function reloadJobs() { setJobs(window.STORE.listJobs(s.id)); }

  function addComment(visibility = 'both') {
    const text = newComment.trim();
    if (!text) return;
    window.STORE.addComment(s.id, '관리자', text, { role: 'admin', visibility });
    setComments(window.STORE.listComments(s.id));
    setNewComment('');
    onUpdate();
  }
  function delComment(id) {
    window.STORE.deleteComment(id);
    setComments(window.STORE.listComments(s.id));
    onUpdate();
  }

  return (
    <>
      <div className="drawer-head">
        <Avatar name={s.name} size={44} />
        <div style={{ flex: 1 }}>
          <div className="h2" style={{ margin: 0 }}>{s.name}</div>
          <div className="muted" style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
            {window.STUDENT_ROSTER[s.cohort].label} · {s.age}세 · {s.gender === 'F' ? '여' : '남'} · {s.education?.split('/')[0] || '—'}
          </div>
        </div>
        <ElapsedBadge days={row.elapsed} threshold={threshold} />
        <button className="drawer-close" onClick={onClose}><Icon.X /></button>
      </div>

      {/* Drawer tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', padding: '0 16px', overflowX: 'auto' }}>
        {[
          { k: 'overview', label: '개요' },
          { k: 'reports', label: `보고 (${reports.length})` },
          { k: 'jobs', label: `공고 (${jobs.length})`, alert: row.overduePlannedCount > 0 ? row.overduePlannedCount : null },
          { k: 'comments', label: `코멘트 (${comments.length})` },
          { k: 'info', label: '연락처' }
        ].map(tt => (
          <button key={tt.k} className={`tab ${tab === tt.k ? 'active' : ''}`} style={{ padding: '12px 14px', fontSize: 13, whiteSpace: 'nowrap' }}
            onClick={() => setTab(tt.k)}>
            {tt.label}
            {tt.alert && <span className="pill" style={{ background: 'var(--alert-danger-bg)', color: 'var(--alert-danger)', fontSize: 10, marginLeft: 4 }}>⏰{tt.alert}</span>}
          </button>
        ))}
      </div>

      <div className="drawer-body">
        {tab === 'overview' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
              <MiniStat label="마지막 입력" value={row.lastReportDate || '없음'} sub={row.elapsed !== null ? `${row.elapsed}일 경과` : '—'} />
              <MiniStat label="주간 진행률" value={`${row.weeklyGoalPct}%`} sub={`목표 ${row.weeklyGoals.length}개`} />
              <MiniStat label="지원 공고" value={row.appliedCount} sub={`전체 ${row.jobCount}개`} />
              <MiniStat label="면접 진행" value={row.interviewingCount} accent={row.interviewingCount > 0} />
            </div>

            <div className="section-title">
              <span className="dot" style={{ background: 'var(--brand-accent)' }}></span>
              이번 주 목표
            </div>
            {row.weeklyGoals.length === 0 ? (
              <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>설정된 주간 목표가 없습니다</div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                {row.weeklyGoals.map(g => (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
                    <span className={`goal-check ${g.status}`} style={{ width: 22, height: 22, fontSize: 11, margin: 0 }}>
                      {g.status === 'done' ? '✓' : g.status === 'in-progress' ? '◐' : g.status === 'blocked' ? '!' : '○'}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, textDecoration: g.status === 'done' ? 'line-through' : 'none', color: g.status === 'done' ? 'var(--ink-mute)' : 'inherit' }}>
                      {g.text || '(빈 항목)'}
                    </span>
                    <span className="muted" style={{ fontSize: 11 }}>{STATUS_OPTIONS.find(o => o.key === g.status)?.label}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="section-title">
              <span className="dot"></span>
              가장 최근 보고
            </div>
            {reports[0] ? (
              <div className="history-item">
                <div className="history-head">
                  <span className="history-date">{reports[0].date}</span>
                  <span className="history-mood">{window.moodIcon(reports[0].mood)}</span>
                </div>
                {reports[0].today_done && <><b style={{ fontSize: 12 }}>오늘 한 일</b><MarkdownView text={reports[0].today_done} /></>}
                {reports[0].blockers && <><b style={{ fontSize: 12, color: 'var(--alert-danger)' }}>막힌 부분</b><MarkdownView text={reports[0].blockers} /></>}
              </div>
            ) : <div className="muted" style={{ fontSize: 13 }}>아직 작성한 보고가 없습니다</div>}
          </>
        )}

        {tab === 'reports' && (
          <div className="history-list" style={{ maxHeight: 'none' }}>
            {reports.length === 0 ? <div className="empty">보고 없음</div> :
              reports.map(r => <HistoryItem key={r.id} report={r} />)
            }
          </div>
        )}

        {tab === 'jobs' && (
          <StudentJobsPanel student={s} jobs={jobs} onChange={reloadJobs} />
        )}

        {tab === 'comments' && (
          <>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              💬 마크다운 지원 · 학생과의 양방향 피드백 채널입니다.
            </div>
            <div className="comment-list">
              {comments.map(c => (
                <div key={c.id} className="comment" style={{
                  background: c.author_role === 'student' ? 'var(--brand-primary-soft)' : 'var(--surface-2)',
                  borderColor: c.author_role === 'student'
                    ? 'color-mix(in oklab, var(--brand-primary) 25%, var(--line))'
                    : 'var(--line-soft)'
                }}>
                  <div className="comment-meta">
                    <span className="comment-author">
                      {c.author_role === 'student' ? `🧑‍🎓 ${c.author}` : `🎓 ${c.author}`}
                    </span>
                    {' · '}
                    {new Date(c.created_at).toLocaleString('ko-KR')}
                    {c.author_role !== 'student' && (
                      <span className="pill" style={{
                        marginLeft: 6,
                        background: c.visibility === 'admin-only' ? 'var(--alert-warn-bg)' : 'var(--alert-fresh-bg)',
                        color: c.visibility === 'admin-only' ? 'var(--alert-warn)' : 'var(--alert-fresh)',
                        fontSize: 10
                      }}>
                        {c.visibility === 'admin-only' ? '🔒 관리자만' : '👁 학생도 보임'}
                      </span>
                    )}
                    <button className="btn btn-ghost btn-sm" style={{ float: 'right', padding: '2px 6px' }} onClick={() => delComment(c.id)}>
                      <Icon.X />
                    </button>
                  </div>
                  <MarkdownView text={c.text} />
                </div>
              ))}
              {comments.length === 0 && <div className="muted" style={{ fontSize: 13, padding: 12, textAlign: 'center' }}>아직 코멘트가 없습니다</div>}
            </div>
            <div style={{ marginTop: 14, padding: 14, background: 'var(--surface-2)', borderRadius: 'var(--r-md)', border: '1px solid var(--line-soft)' }}>
              <div className="field-label" style={{ marginBottom: 6 }}>🎓 멘토 메시지 작성</div>
              <MarkdownEditor value={newComment} onChange={setNewComment} placeholder="이 수강생에게 보낼 메시지를 작성하세요" rows={3} minimal />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-soft)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={newVisibility === 'both'} onChange={e => setNewVisibility(e.target.checked ? 'both' : 'admin-only')} />
                  학생에게도 보이게 (체크 해제 시 관리자만 볼 수 있는 내부 메모)
                </label>
                <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => addComment(newVisibility)}>
                  <Icon.Plus /> 전송
                </button>
              </div>
            </div>
          </>
        )}

        {tab === 'info' && (
          <div>
            <InfoRow k="이메일" v={s.email} />
            <InfoRow k="전화번호" v={s.phone} />
            <InfoRow k="주소" v={`${s.addr1 || ''} ${s.addr2 || ''}`.trim() || '—'} />
            <InfoRow k="생년월일" v={`${s.birthDate || '—'} (만 ${s.age}세)`} />
            <InfoRow k="전공 / 학력" v={s.education || '—'} />
            <InfoRow k="과정" v={s.course || '—'} />

            <StudentAdminPanel student={s} onChange={onUpdate} />

            <PasswordAdminRow student={s} onUpdate={onUpdate} />
          </div>
        )}
      </div>
    </>
  );
}

function MiniStat({ label, value, sub, accent }) {
  return (
    <div style={{ padding: 14, borderRadius: 'var(--r-md)', background: 'var(--surface-2)', border: '1px solid var(--line-soft)' }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: accent ? 'var(--brand-accent)' : 'var(--ink)', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function InfoRow({ k, v }) {
  return (
    <div style={{ display: 'flex', padding: '10px 0', borderBottom: '1px solid var(--line-soft)', gap: 12 }}>
      <div style={{ width: 90, color: 'var(--ink-mute)', fontSize: 12, fontWeight: 600 }}>{k}</div>
      <div style={{ flex: 1, fontSize: 13, color: 'var(--ink)', wordBreak: 'break-all' }}>{v}</div>
    </div>
  );
}

/* ==========================================================================
   StudentJobsPanel — 관리자가 학생 상세 드로어에서 보는 공고 리스트
   ========================================================================== */
function StudentJobsPanel({ student, jobs, onChange }) {
  const today = window.STORE_HELPERS.todayStr();
  const days = (a, b) => window.STORE_HELPERS.daysBetween(a, b);

  if (jobs.length === 0) {
    return <div className="empty"><div className="big">📋</div>등록된 공고가 없습니다</div>;
  }

  // 정렬: 지원 예정일 지남(미지원) > D-day 임박 > 그 외
  const sorted = [...jobs].sort((a, b) => {
    const aOver = a.planned_apply_date && a.status === '미지원' && days(today, a.planned_apply_date) < 0;
    const bOver = b.planned_apply_date && b.status === '미지원' && days(today, b.planned_apply_date) < 0;
    if (aOver !== bOver) return aOver ? -1 : 1;
    const aDay = a.due_date ? days(today, a.due_date) : 9999;
    const bDay = b.due_date ? days(today, b.due_date) : 9999;
    return aDay - bDay;
  });

  const overdueCount = jobs.filter(j =>
    j.planned_apply_date && j.status === '미지원' && days(today, j.planned_apply_date) < 0
  ).length;

  return (
    <div>
      {/* 요약 통계 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        <MiniStat label="전체" value={jobs.length} />
        <MiniStat label="지원완료" value={jobs.filter(j => j.status === '지원완료' || j.status === '면접' || j.status === '합격').length} />
        <MiniStat label="면접" value={jobs.filter(j => j.status === '면접').length} accent={jobs.some(j => j.status === '면접')} />
        <MiniStat label="예정일 지남" value={overdueCount} accent={overdueCount > 0} />
      </div>

      {overdueCount > 0 && (
        <div style={{
          padding: '10px 14px',
          background: 'var(--alert-danger-bg)',
          border: '1px solid color-mix(in oklab, var(--alert-danger) 35%, var(--line))',
          borderRadius: 'var(--r-md)',
          marginBottom: 14,
          fontSize: 13,
          color: 'var(--alert-danger)',
          fontWeight: 600
        }}>
          ⏰ 지원 예정일이 지났는데 아직 미지원인 공고가 <b>{overdueCount}건</b> 있습니다. 학생과 확인이 필요해요.
        </div>
      )}

      <div className="student-jobs-list">
        {sorted.map(j => {
          const planDays = j.planned_apply_date ? days(today, j.planned_apply_date) : null;
          const dueDays = j.due_date ? days(today, j.due_date) : null;
          const isOverdue = j.planned_apply_date && j.status === '미지원' && planDays < 0;
          const stStyle = (window.JOB_STATUS_STYLES || {})[j.status] || { bg: 'var(--bg-2)', color: 'var(--ink-mute)' };
          return (
            <div key={j.id} className={`student-job-card ${isOverdue ? 'overdue' : ''}`}>
              <div className="sj-head">
                <div className="sj-title">{j.title}</div>
                <span className="pill" style={{ background: stStyle.bg, color: stStyle.color }}>
                  {j.status}
                </span>
              </div>
              <div className="sj-meta">
                <span><b>{j.company}</b></span>
                <span>·</span>
                <span>{j.role || '—'}</span>
                <span>·</span>
                <span>관심도 <b style={{ color: j.interest >= 8 ? 'var(--alert-fresh)' : j.interest >= 5 ? 'var(--alert-warn)' : 'var(--ink-mute)' }}>{j.interest}/10</b></span>
              </div>
              <div className="sj-dates">
                <div className="sj-date">
                  <span className="sjd-k">등록</span>
                  <span className="sjd-v">{j.registered_at || '—'}</span>
                </div>
                <div className="sj-date">
                  <span className="sjd-k">📅 지원 예정</span>
                  <span className="sjd-v">
                    {j.planned_apply_date || '—'}
                    {j.planned_apply_date && j.status === '미지원' && (
                      <span className={`elapsed-badge ${planDays < 0 ? 'danger' : planDays <= 2 ? 'warn' : 'fresh'}`} style={{ marginLeft: 6, fontSize: 10 }}>
                        {planDays < 0 ? `${-planDays}일 지남` : planDays === 0 ? '오늘' : `D-${planDays}`}
                      </span>
                    )}
                  </span>
                </div>
                <div className="sj-date">
                  <span className="sjd-k">⏰ 마감</span>
                  <span className="sjd-v">
                    {j.due_date || '—'}
                    {j.due_date && (
                      <span className={`elapsed-badge ${dueDays < 0 ? 'danger' : dueDays <= 3 ? 'warn' : 'fresh'}`} style={{ marginLeft: 6, fontSize: 10 }}>
                        {dueDays < 0 ? '마감' : `D-${dueDays}`}
                      </span>
                    )}
                  </span>
                </div>
              </div>
              {j.memo && (
                <details className="sj-memo">
                  <summary>📝 비고 보기</summary>
                  <MarkdownView text={j.memo} />
                </details>
              )}
              {j.url && j.url !== '#' && (
                <a href={j.url} target="_blank" rel="noopener" className="sj-link">
                  <Icon.External /> 공고 원문 보기
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.StudentJobsPanel = StudentJobsPanel;

/* ==========================================================================
   PasswordAdminRow — 관리자가 수강생의 비밀번호 열람/수정
   ========================================================================== */
function PasswordAdminRow({ student, onUpdate }) {
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [flash, setFlash] = useState('');

  const current = window.STORE.getStudentPassword(student.id);
  const hasPw = !!current;

  function save() {
    if (newPw.length < 4) {
      alert('비밀번호는 4자 이상이어야 합니다');
      return;
    }
    window.STORE.setStudentPassword(student.id, newPw);
    setEditing(false);
    setNewPw('');
    setFlash('저장됨');
    setTimeout(() => setFlash(''), 1800);
    onUpdate && onUpdate();
  }
  function resetPassword() {
    if (!confirm(
      `${student.name}님의 비밀번호를 초기화할까요?\n\n` +
      `· 현재 비밀번호가 즉시 제거됩니다.\n` +
      `· 다음 로그인 시 "최초 입장"처럼 새 비밀번호를 직접 설정하게 됩니다.\n` +
      `· 본 작업은 되돌릴 수 없습니다.`
    )) return;
    window.STORE.setStudentPassword(student.id, null);
    setShow(false);
    setEditing(false);
    setNewPw('');
    setFlash('초기화됨 — 다음 로그인 시 재설정 필요');
    setTimeout(() => setFlash(''), 3000);
    onUpdate && onUpdate();
  }

  return (
    <div style={{ marginTop: 18, padding: 14, background: 'var(--surface-2)', borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>🔐 계정 비밀번호</span>
        {flash && <span className="pill" style={{ background: 'var(--alert-fresh-bg)', color: 'var(--alert-fresh)', fontSize: 11 }}>✓ {flash}</span>}
        {!hasPw && !flash && <span className="pill" style={{ background: 'var(--alert-warn-bg)', color: 'var(--alert-warn)', fontSize: 11 }}>미설정 (최초 로그인 대기)</span>}
      </div>

      {!editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            flex: '1 1 200px',
            minWidth: 0,
            padding: '8px 12px',
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r-sm)',
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            letterSpacing: hasPw && !show ? '0.2em' : '0.05em',
            color: hasPw ? 'var(--ink)' : 'var(--ink-mute)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {hasPw ? (show ? current : '•'.repeat(Math.min(current.length, 12))) : '(설정되지 않음)'}
          </div>
          {hasPw && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShow(v => !v)}>
              {show ? '숨기기' : '열람'}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(true); setNewPw(''); }}>
            <Icon.Edit /> 수정
          </button>
          <button
            className="btn btn-sm"
            onClick={resetPassword}
            disabled={!hasPw}
            style={{
              background: hasPw ? 'var(--alert-danger)' : 'var(--bg-2)',
              color: hasPw ? 'white' : 'var(--ink-mute)',
              cursor: hasPw ? 'pointer' : 'not-allowed'
            }}
            title={hasPw ? '비밀번호를 제거하여 최초 입장 흐름으로 재설정하도록 함' : '이미 미설정 상태입니다'}>
            <Icon.Trash /> 초기화
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            className="input"
            placeholder="새 비밀번호 (4자 이상)"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') { setEditing(false); setNewPw(''); }
            }}
            style={{ fontFamily: 'var(--font-mono)' }}
            autoFocus
          />
          <button className="btn btn-primary btn-sm" onClick={save}>저장</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setNewPw(''); }}>취소</button>
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-mute)', lineHeight: 1.6 }}>
        💡 수강생이 최초 로그인할 때 직접 설정합니다. 잊어버린 경우<br/>
        <b>수정</b> — 관리자가 새 비밀번호를 직접 지정 (수강생에게 전달 필요)<br/>
        <b>초기화</b> — 비밀번호를 제거하여 다음 로그인이 "최초 입장" 흐름으로 진행
      </div>
    </div>
  );
}

/* ==========================================================================
   SummaryCard — 클릭하면 해당 필터 토글
   ========================================================================== */
function SummaryCard({ decor, label, value, unit, valueColor, foot, filterKey, activeFilter, onFilter, borderHighlight }) {
  const active = activeFilter === filterKey;
  return (
    <button
      type="button"
      className={`summary-card summary-card-filter ${active ? 'active' : ''}`}
      onClick={() => onFilter && onFilter(active ? 'all' : filterKey)}
      style={{
        cursor: 'pointer',
        textAlign: 'left',
        borderColor: active
          ? 'var(--brand-primary)'
          : (borderHighlight ? 'color-mix(in oklab, var(--alert-danger) 40%, var(--line))' : undefined),
        boxShadow: active ? '0 0 0 3px color-mix(in oklab, var(--brand-primary) 18%, transparent)' : undefined
      }}
      title={`${label} 만 보기`}
    >
      <div className="summary-decor" style={{ background: decor }}></div>
      <div className="summary-label">{label}</div>
      <div className="summary-value" style={{ color: valueColor || 'var(--ink)' }}>
        {value}<small>{unit}</small>
      </div>
      {foot && <div className="summary-foot">{foot}</div>}
      <div className="summary-filter-hint">{active ? '✓ 필터 적용 중' : '클릭하여 필터'}</div>
    </button>
  );
}

window.AdminDashboard = AdminDashboard;
window.SummaryCard = SummaryCard;
