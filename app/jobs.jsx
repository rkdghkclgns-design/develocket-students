/* ==========================================================================
   공고 관리 탭 — 2번째 이미지 기반 테이블 + 마크다운 비고 + 행 추가
   ========================================================================== */
const JOB_STATUSES = ['미지원', '지원완료', '면접', '합격', '불합격', '채용시 마감'];
const JOB_STATUS_STYLES = {
  '미지원':       { bg: 'var(--bg-2)',            color: 'var(--ink-mute)' },
  '지원완료':     { bg: '#DBEAFE',                color: '#1D4ED8' },
  '면접':         { bg: 'var(--brand-accent-soft)', color: '#C2410C' },
  '합격':         { bg: 'var(--alert-fresh-bg)',  color: 'var(--alert-fresh)' },
  '불합격':       { bg: 'var(--alert-danger-bg)', color: 'var(--alert-danger)' },
  '채용시 마감':  { bg: '#FED7AA',                color: '#9A3412' }
};

/* 관심도 1-10 — 점수 + 별 시각화 */
function InterestPicker({ value, onChange, compact = false }) {
  const v = Math.min(10, Math.max(1, value || 1));
  const color = v >= 8 ? 'var(--alert-fresh)' : v >= 5 ? 'var(--alert-warn)' : 'var(--ink-mute)';
  function clamp(n) { return Math.min(10, Math.max(1, parseInt(n) || 1)); }

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input type="number" min="1" max="10" className="input"
          style={{ width: 48, padding: '4px 6px', textAlign: 'center', color, fontWeight: 700, fontSize: 13 }}
          value={v}
          onChange={e => onChange(clamp(e.target.value))} />
        <span style={{ color: 'var(--ink-mute)', fontSize: 11, fontWeight: 600 }}>/10</span>
      </div>
    );
  }

  return (
    <div className="interest-picker">
      <input type="range" min="1" max="10" value={v}
        onChange={e => onChange(clamp(e.target.value))}
        className="interest-range"
        style={{ accentColor: color }} />
      <div className="interest-readout">
        <b style={{ color }}>{v}</b>
        <span>/10</span>
      </div>
    </div>
  );
}

/* ===== 면접 차수 (1·2·3차 + 과제) ===== */
const INTERVIEW_ROUNDS = ['1차', '2차', '3차', '과제'];
const ROUND_STATUSES = ['대기', '불합', '합격'];
const ROUND_STATUS_STYLES = {
  '대기': { bg: 'var(--bg-2)',            color: 'var(--ink-mute)' },
  '불합': { bg: 'var(--alert-danger-bg)', color: 'var(--alert-danger)' },
  '합격': { bg: 'var(--alert-fresh-bg)',  color: 'var(--alert-fresh)' }
};

/* job.interview_rounds 의 합격/진행 요약 라벨 */
function roundsSummary(job) {
  const rs = Array.isArray(job.interview_rounds) ? job.interview_rounds : [];
  if (rs.length === 0) return null;
  const pass = rs.filter(r => r.status === '합격').length;
  const fail = rs.filter(r => r.status === '불합').length;
  return { count: rs.length, pass, fail };
}

function InterviewRoundsEditor({ job, onChange }) {
  const rounds = Array.isArray(job.interview_rounds) ? job.interview_rounds : [];
  const byRound = {};
  rounds.forEach(r => { byRound[r.round] = r; });

  function setRound(roundKey, patch) {
    const existing = byRound[roundKey] || { round: roundKey, date: '', status: '대기', memo: '' };
    Promise.resolve(window.STORE.setInterviewRound(job.id, { ...existing, ...patch })).then(() => onChange && onChange()).catch(() => {});
  }
  function removeRound(roundKey) {
    Promise.resolve(window.STORE.removeInterviewRound(job.id, roundKey)).then(() => onChange && onChange()).catch(() => {});
  }

  return (
    <div className="rounds-editor">
      <div className="field-label" style={{ marginBottom: 8 }}>🎤 면접 이력 (차수별 일자 · 결과)</div>
      {INTERVIEW_ROUNDS.map(rk => {
        const r = byRound[rk];
        const active = !!r;
        return (
          <div key={rk} className={`round-row ${active ? 'active' : ''}`}>
            <span className="round-label">{rk}</span>
            <input type="date" className="input round-date" value={(r && r.date) || ''}
              onChange={e => setRound(rk, { date: e.target.value })} />
            <div className="round-status-group">
              {ROUND_STATUSES.map(st => {
                const sel = r && r.status === st;
                const stl = ROUND_STATUS_STYLES[st];
                return (
                  <button key={st}
                    className="round-status-btn"
                    style={sel ? { background: stl.bg, color: stl.color, fontWeight: 700, borderColor: stl.color } : {}}
                    onClick={() => setRound(rk, { status: st })}>{st}</button>
                );
              })}
            </div>
            {active && (
              <button className="btn btn-ghost btn-icon round-clear" onClick={() => removeRound(rk)} title="이 차수 제거">
                <Icon.X />
              </button>
            )}
          </div>
        );
      })}
      <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>일자나 결과를 누르면 해당 차수가 기록됩니다. 과제 전형도 동일하게 관리하세요.</div>
    </div>
  );
}

/* ===== 지원 → 면접 → 합격 도달률 (퍼널) ===== */
function computeJobFunnel(jobs) {
  const hasRounds = j => Array.isArray(j.interview_rounds) && j.interview_rounds.length > 0;
  const total = jobs.length;
  const applied = jobs.filter(j => j.applied_at || ['지원완료', '면접', '합격', '불합격'].includes(j.status) || hasRounds(j)).length;
  const interviewing = jobs.filter(j => j.status === '면접' || hasRounds(j)).length;
  const passed = jobs.filter(j => j.status === '합격' || (hasRounds(j) && j.interview_rounds.some(r => r.status === '합격'))).length;
  return {
    total, applied, interviewing, passed,
    applyRate: total ? applied / total : 0,
    interviewRate: applied ? interviewing / applied : 0,
    passRate: interviewing ? passed / interviewing : 0
  };
}

function FunnelCard({ funnel, title = '지원 → 면접 → 합격 도달률' }) {
  const pct = n => Math.round((n || 0) * 100);
  const stages = [
    { label: '지원', value: funnel.applied,      sub: funnel.total ? `${pct(funnel.applyRate)}%` : '—',        color: '#1D4ED8' },
    { label: '면접', value: funnel.interviewing, sub: funnel.applied ? `${pct(funnel.interviewRate)}%` : '—',  color: '#C2410C' },
    { label: '합격', value: funnel.passed,       sub: funnel.interviewing ? `${pct(funnel.passRate)}%` : '—',  color: 'var(--alert-fresh)' }
  ];
  return (
    <div className="funnel-card">
      <div className="funnel-title">🎯 {title} <span className="muted" style={{ fontWeight: 500 }}>· 총 {funnel.total}건</span></div>
      <div className="funnel-stages">
        {stages.map((s, i) => (
          <React.Fragment key={s.label}>
            {i > 0 && <span className="funnel-arrow">→</span>}
            <div className="funnel-stage">
              <div className="funnel-value" style={{ color: s.color }}>{s.value}</div>
              <div className="funnel-label">{s.label}</div>
              <div className="funnel-rate">{s.sub}</div>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function JobsTab({ student }) {
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // id of row being memo/면접-edited
  const [showAdd, setShowAdd] = useState(false);
  const [viewMode, setViewMode] = useState('all'); // 'all' | 'interview'
  const [layout, setLayout] = useState(() => {
    try { return localStorage.getItem('develocket.jobsLayout') || 'card'; }
    catch { return 'card'; }
  }); // 'card' | 'kanban' | 'table'

  function reload() { setJobs(window.STORE.listJobs(student.id)); }
  useEffect(() => { reload(); return window.STORE.onChange(reload); }, [student.id]);
  useEffect(() => { try { localStorage.setItem('develocket.jobsLayout', layout); } catch {} }, [layout]);

  const funnel = useMemo(() => computeJobFunnel(jobs), [jobs]);

  const filtered = useMemo(() => {
    let list = jobs;
    if (viewMode === 'interview') {
      list = list.filter(j => (Array.isArray(j.interview_rounds) && j.interview_rounds.length > 0) || j.status === '면접');
    }
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(j =>
      (j.title || '').toLowerCase().includes(q) ||
      (j.company || '').toLowerCase().includes(q) ||
      (j.role || '').toLowerCase().includes(q)
    );
    return list;
  }, [jobs, search, viewMode]);

  const today = window.STORE_HELPERS.todayStr();
  function dueState(due) {
    if (!due) return null;
    const days = window.STORE_HELPERS.daysBetween(today, due);
    if (days < 0) return { label: '마감', cls: 'danger' };
    if (days <= 3) return { label: `D-${days}`, cls: 'warn' };
    return { label: `D-${days}`, cls: 'fresh' };
  }
  function planState(planned) {
    if (!planned) return null;
    const days = window.STORE_HELPERS.daysBetween(today, planned);
    if (days < -1) return { label: '미진행', cls: 'danger' };
    if (days < 0) return { label: '지남', cls: 'warn' };
    if (days === 0) return { label: '오늘', cls: 'warn' };
    if (days <= 2) return { label: `D-${days}`, cls: 'warn' };
    return { label: `D-${days}`, cls: 'fresh' };
  }

  function update(id, patch) {
    const j = jobs.find(x => x.id === id);
    if (!j) return;
    window.STORE.upsertJob({ ...j, ...patch });
    reload();
  }
  function remove(id) {
    if (!confirm('이 공고를 삭제할까요?')) return;
    window.STORE.deleteJob(id);
    reload();
  }
  function add(payload) {
    window.STORE.upsertJob({
      student_id: student.id,
      status: '미지원',
      interest: 5,
      registered_at: today,
      updated_at: today,
      ...payload
    });
    setShowAdd(false);
    reload();
  }

  return (
    <div className="float-in">
      <div className="jobs-toolbar">
        <h2 className="h2" style={{ margin: 0 }}>📋 공고 관리</h2>
        <span className="muted" style={{ fontSize: 13 }}>{jobs.length}개</span>

        <div className="jobs-search">
          <Icon.Search />
          <input className="input" placeholder="공고명, 회사, 직무 검색"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="layout-switch" style={{ marginLeft: 'auto' }}>
          <button className={viewMode === 'all' ? 'active' : ''} onClick={() => setViewMode('all')}>전체</button>
          <button className={viewMode === 'interview' ? 'active' : ''} onClick={() => setViewMode('interview')}>🎤 면접 진행</button>
        </div>

        <div className="layout-switch" role="tablist" aria-label="공고 레이아웃">
          <button className={layout === 'card' ? 'active' : ''} role="tab" aria-selected={layout === 'card'}
            onClick={() => setLayout('card')} title="카드 보기">📇 카드</button>
          <button className={layout === 'kanban' ? 'active' : ''} role="tab" aria-selected={layout === 'kanban'}
            onClick={() => setLayout('kanban')} title="칸반 보기">🗂 칸반</button>
          <button className={layout === 'table' ? 'active' : ''} role="tab" aria-selected={layout === 'table'}
            onClick={() => setLayout('table')} title="테이블 보기">📋 테이블</button>
        </div>

        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <Icon.Plus /> 공고 추가
        </button>
      </div>

      {jobs.length > 0 && <FunnelCard funnel={funnel} />}

      {layout === 'card' && (
        filtered.length === 0 ? (
          <div className="card" style={{ padding: 32 }}>
            <div className="empty">
              <div className="big">🔎</div>
              {search ? '검색 결과가 없습니다'
                : viewMode === 'interview' ? '면접이 진행 중인 공고가 없습니다'
                : '아직 등록된 공고가 없습니다'}
            </div>
          </div>
        ) : (
          <div className="job-card-grid">
            {filtered.map(j => (
              <JobCard key={j.id} job={j}
                onOpen={() => setEditing(editing === j.id ? null : j.id)}
                dueState={dueState} planState={planState} />
            ))}
          </div>
        )
      )}

      {layout === 'kanban' && (
        filtered.length === 0 ? (
          <div className="card" style={{ padding: 32 }}>
            <div className="empty">
              <div className="big">🗂</div>
              {search ? '검색 결과가 없습니다' : '아직 등록된 공고가 없습니다'}
            </div>
          </div>
        ) : (
          <JobKanban jobs={filtered}
            onOpen={(id) => setEditing(editing === id ? null : id)}
            dueState={dueState} planState={planState} />
        )
      )}

      {layout === 'table' && (
      <div className="card table-card">
        <div style={{ overflowX: 'auto' }}>
          <table className="jobs-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>No.</th>
                <th>공고명</th>
                <th>회사</th>
                <th>직무</th>
                <th>상태</th>
                <th>등록일</th>
                <th>지원 예정일</th>
                <th>지원일</th>
                <th>마감일</th>
                <th style={{ width: 90 }}>관심도</th>
                <th style={{ width: 96 }}>면접</th>
                <th>비고 (마크다운)</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j, i) => {
                const ds = dueState(j.due_date);
                const ps = planState(j.planned_apply_date);
                const stStyle = JOB_STATUS_STYLES[j.status] || JOB_STATUS_STYLES['미지원'];
                return (
                  <React.Fragment key={j.id}>
                    <tr>
                      <td className="job-no">{i + 1}</td>
                      <td className="job-title-cell" style={{ minWidth: 240, maxWidth: 360 }}>
                        <input className="input" style={{ padding: '6px 8px', border: 'none', fontWeight: 500, background: 'transparent', color: 'var(--brand-primary)', width: '100%' }}
                          title={j.title || ''}
                          value={j.title} onChange={e => update(j.id, { title: e.target.value })} />
                        {j.url && j.url !== '#' && (
                          <a href={safeHref(j.url)} target="_blank" rel="noopener" style={{ marginLeft: 4 }}>
                            <Icon.External />
                          </a>
                        )}
                      </td>
                      <td>
                        <input className="input" style={{ padding: '6px 8px', border: 'none', background: 'transparent' }}
                          value={j.company} onChange={e => update(j.id, { company: e.target.value })} />
                      </td>
                      <td>
                        <input className="input" style={{ padding: '6px 8px', border: 'none', background: 'transparent' }}
                          value={j.role} onChange={e => update(j.id, { role: e.target.value })} />
                      </td>
                      <td>
                        <select className="select" style={{ width: 110, padding: '4px 8px', background: stStyle.bg, color: stStyle.color, fontWeight: 600, border: 'none', borderRadius: 999, fontSize: 12, textAlign: 'center', appearance: 'none' }}
                          value={j.status} onChange={e => update(j.id, { status: e.target.value })}>
                          {JOB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="date" className="input" style={{ padding: '6px 8px', border: 'none', background: 'transparent', fontSize: 12 }}
                          value={j.registered_at} onChange={e => update(j.id, { registered_at: e.target.value })} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input type="date" className="input" style={{ padding: '6px 8px', border: 'none', background: 'transparent', fontSize: 12 }}
                            value={j.planned_apply_date || ''} onChange={e => update(j.id, { planned_apply_date: e.target.value })} />
                          {ps && <span className={`elapsed-badge ${ps.cls}`} style={{ fontSize: 10 }}>{ps.label}</span>}
                        </div>
                      </td>
                      <td>
                        <input type="date" className="input" style={{ padding: '6px 8px', border: 'none', background: 'transparent', fontSize: 12 }}
                          value={j.applied_at || ''} onChange={e => update(j.id, { applied_at: e.target.value })} title="실제 지원한 날짜" />
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input type="date" className="input" style={{ padding: '6px 8px', border: 'none', background: 'transparent', fontSize: 12 }}
                            value={j.due_date || ''} onChange={e => update(j.id, { due_date: e.target.value })} />
                          {ds && <span className={`elapsed-badge ${ds.cls}`} style={{ fontSize: 10 }}>{ds.label}</span>}
                        </div>
                      </td>
                      <td>
                        <InterestPicker value={j.interest} onChange={v => update(j.id, { interest: v })} compact />
                      </td>
                      <td>
                        {(() => {
                          const rs = roundsSummary(j);
                          return (
                            <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}
                              onClick={() => setEditing(editing === j.id ? null : j.id)} title="면접 차수 기록">
                              {rs
                                ? <span style={{ fontSize: 12, fontWeight: 600 }}>🎤 {rs.count}{rs.pass ? ` ·합${rs.pass}` : ''}{rs.fail ? ` ·불${rs.fail}` : ''}</span>
                                : <span style={{ color: 'var(--ink-faint)', fontSize: 12 }}>＋ 면접</span>}
                            </button>
                          );
                        })()}
                      </td>
                      <td style={{ minWidth: 200 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', minHeight: 32, padding: '4px 8px' }}
                          onClick={() => setEditing(editing === j.id ? null : j.id)}>
                          {j.memo
                            ? <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', maxWidth: 200 }}>
                                {j.memo.slice(0, 40)}{j.memo.length > 40 ? '…' : ''}
                              </span>
                            : <span style={{ color: 'var(--ink-faint)', fontSize: 12, fontStyle: 'italic' }}>비고 작성…</span>}
                        </button>
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-icon" onClick={() => remove(j.id)} title="삭제">
                          <Icon.Trash style={{ color: 'var(--alert-danger)' }} />
                        </button>
                      </td>
                    </tr>
                    {editing === j.id && (
                      <tr>
                        <td colSpan="13" style={{ padding: '0 12px 16px', background: 'var(--surface-2)' }}>
                          <div style={{ paddingTop: 12, display: 'grid', gap: 16 }}>
                            <InterviewRoundsEditor job={j} onChange={reload} />
                            <div>
                              <div className="field-label" style={{ marginBottom: 8 }}>📝 비고 / 메모 (마크다운 지원)</div>
                              <MarkdownEditor
                                value={j.memo || ''}
                                onChange={v => update(j.id, { memo: v })}
                                placeholder="이 공고에 대한 메모, 자기소개서 초안, 면접 후기 등을 자유롭게 작성하세요"
                                rows={5}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan="13">
                  <div className="empty">
                    <div className="big">🔎</div>
                    {search ? '검색 결과가 없습니다'
                      : viewMode === 'interview' ? '면접이 진행 중인 공고가 없습니다'
                      : '아직 등록된 공고가 없습니다'}
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {showAdd && <AddJobModal onAdd={add} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function AddJobModal({ onAdd, onClose }) {
  const todayStr = window.STORE_HELPERS.todayStr();
  const boxRef = useRef(null);
  const titleId = useMemo(() => 'add-job-title-' + Math.random().toString(36).slice(2, 8), []);
  window.useModalA11y(boxRef, onClose);   // body scroll lock + ESC + focus trap

  const [form, setForm] = useState({
    title: '', company: '', role: '', url: '',
    status: '미지원', interest: 5,
    registered_at: todayStr,
    planned_apply_date: '',
    applied_at: '',
    due_date: '',
    memo: '',
    keywords: [],
    portfolio_direction: ''
  });
  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  function submit() {
    if (!form.title.trim() || !form.company.trim()) {
      window.showToast('공고명과 회사명은 필수입니다.', 'error');
      return;
    }
    onAdd({ ...form, interest: Math.min(10, Math.max(1, form.interest || 1)) });
  }
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={boxRef}>
        <div className="drawer-head">
          <div>
            <div className="h2" id={titleId} style={{ margin: 0 }}>새 공고 추가</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>관심 있는 공고를 등록하세요</div>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="닫기"><Icon.X /></button>
        </div>
        <div className="drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="field-label">공고명 *</div>
            <input className="input" value={form.title} onChange={e => update('title', e.target.value)} placeholder="예: [Pearl Abyss] 게임 기획자 신입 채용" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div className="field-label">회사 *</div>
              <input className="input" value={form.company} onChange={e => update('company', e.target.value)} placeholder="회사명" />
            </div>
            <div>
              <div className="field-label">직무</div>
              <input className="input" value={form.role} onChange={e => update('role', e.target.value)} placeholder="예: 게임 기획" />
            </div>
          </div>
          <div>
            <div className="field-label">공고 URL</div>
            <input className="input" value={form.url} onChange={e => update('url', e.target.value)} placeholder="https://..." />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <div className="field-label">상태</div>
              <select className="select" value={form.status} onChange={e => update('status', e.target.value)}>
                {JOB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div className="field-label">등록일</div>
              <input type="date" className="input" value={form.registered_at} onChange={e => update('registered_at', e.target.value)} />
            </div>
            <div>
              <div className="field-label">관심도</div>
              <InterestPicker value={form.interest} onChange={v => update('interest', v)} compact />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <div className="field-label">📅 지원 예정일</div>
              <input type="date" className="input" value={form.planned_apply_date} onChange={e => update('planned_apply_date', e.target.value)} />
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>내가 지원하기로 계획한 날짜</div>
            </div>
            <div>
              <div className="field-label">📌 실제 지원일</div>
              <input type="date" className="input" value={form.applied_at} onChange={e => update('applied_at', e.target.value)} />
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>실제로 지원서를 제출한 날짜</div>
            </div>
            <div>
              <div className="field-label">⏰ 공고 마감일</div>
              <input type="date" className="input" value={form.due_date} onChange={e => update('due_date', e.target.value)} />
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>회사가 공고를 닫는 날짜</div>
            </div>
          </div>
          <div>
            <div className="field-label">🏷 키워드 <span style={{ fontWeight: 400, color: 'var(--ink-mute)' }}>· 해시태그 형식 (Enter/쉼표/Space로 추가)</span></div>
            <KeywordsChipInput value={form.keywords} onChange={v => update('keywords', v)} placeholder="예: 유니티 클라이언트 RPG" />
          </div>
          <div>
            <div className="field-label">🎯 포트폴리오 방향 <span style={{ fontWeight: 400, color: 'var(--ink-mute)' }}>· 이 공고를 위해 보강할 작업물</span></div>
            <textarea className="input" value={form.portfolio_direction}
              onChange={e => update('portfolio_direction', e.target.value)}
              placeholder="예: 인디 RPG 프로토타입 영상, 시스템 기획서 1편"
              rows={2} style={{ resize: 'vertical', minHeight: 56, fontFamily: 'inherit' }} />
          </div>
          <div>
            <div className="field-label">비고 (마크다운)</div>
            <MarkdownEditor value={form.memo} onChange={v => update('memo', v)} placeholder="필요한 메모를 작성하세요" rows={3} minimal />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>취소</button>
            <button className="btn btn-primary" onClick={submit} style={{ flex: 1 }}>
              <Icon.Plus /> 공고 추가
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   🏷 KeywordsChipInput — 해시태그 형식 키워드 입력
   - Enter/쉼표/Space로 키워드 추가
   - Backspace로 마지막 키워드 제거
   - 중복 제거 + 최대 길이 제한
   ========================================================================== */
function KeywordsChipInput({ value, onChange, placeholder }) {
  const tags = Array.isArray(value) ? value : [];
  const [draft, setDraft] = useState('');
  function add(raw) {
    const t = (raw || '').trim().replace(/^#+/, '').slice(0, 20);
    if (!t) return;
    if (tags.includes(t)) { setDraft(''); return; }
    if (tags.length >= 20) { setDraft(''); return; }
    onChange([...tags, t]);
    setDraft('');
  }
  function removeAt(i) { onChange(tags.filter((_, idx) => idx !== i)); }
  function onKey(e) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && tags.length) {
      e.preventDefault();
      onChange(tags.slice(0, -1));
    }
  }
  function onPaste(e) {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (text && /[,\s]/.test(text)) {
      e.preventDefault();
      text.split(/[,\s]+/).forEach(t => add(t));
    }
  }
  return (
    <div className="kw-chip-input">
      {tags.map((t, i) => (
        <span key={i} className="kw-chip">
          <span className="kw-chip-hash">#</span>{t}
          <button type="button" className="kw-chip-remove" onClick={() => removeAt(i)} aria-label={`${t} 제거`}>×</button>
        </span>
      ))}
      <input
        className="kw-chip-field"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={onKey}
        onPaste={onPaste}
        onBlur={() => draft && add(draft)}
        placeholder={tags.length ? '' : (placeholder || '해시태그 입력')}
      />
    </div>
  );
}

/* ==========================================================================
   📇 JobCard — 카드 뷰의 개별 공고 카드
   ========================================================================== */
function JobCard({ job, onOpen, dueState, planState }) {
  const sty = JOB_STATUS_STYLES[job.status] || JOB_STATUS_STYLES['미지원'];
  const dueLabel = dueState(job.due_date);
  const planLabel = planState(job.planned_apply_date);
  const status = job.status || '미지원';
  const isInactive = status === '불합격' || status === '채용시 마감' ||
    (job.due_date && job.due_date < window.STORE_HELPERS.todayStr() && status === '미지원');

  return (
    <div className={`job-card ${isInactive ? 'inactive' : ''}`} onClick={onOpen}>
      <div className="job-card-head">
        <div className="job-card-title" title={job.title}>{job.title || '(공고명 없음)'}</div>
        <span className="pill" style={{ background: sty.bg, color: sty.fg, flexShrink: 0 }}>{status}</span>
      </div>
      <div className="job-card-sub">
        {job.company && <span><b>{job.company}</b></span>}
        {job.role && <span>· {job.role}</span>}
        <span className="muted">· 관심도 {job.interest}/10</span>
      </div>
      {Array.isArray(job.keywords) && job.keywords.length > 0 && (
        <div className="job-card-keywords">
          {job.keywords.slice(0, 6).map((k, i) => (
            <span key={i} className="kw-chip-mini">#{k}</span>
          ))}
          {job.keywords.length > 6 && <span className="kw-more">+{job.keywords.length - 6}</span>}
        </div>
      )}
      <div className="job-card-meta">
        {job.registered_at && (
          <div className="jc-meta-row">
            <span className="jc-meta-label">📅 등록</span>
            <span className="jc-meta-value">{job.registered_at}</span>
          </div>
        )}
        {planLabel && (
          <div className="jc-meta-row">
            <span className="jc-meta-label">📌 지원예정</span>
            <span className="jc-meta-value">{job.planned_apply_date} <span className={`pill pill-${planLabel.cls}`} style={{ fontSize: 10 }}>{planLabel.label}</span></span>
          </div>
        )}
        {job.due_date && (
          <div className="jc-meta-row">
            <span className="jc-meta-label">⏰ 마감</span>
            <span className="jc-meta-value">{job.due_date} {dueLabel && <span className={`pill pill-${dueLabel.cls}`} style={{ fontSize: 10 }}>{dueLabel.label}</span>}</span>
          </div>
        )}
      </div>
      {job.portfolio_direction && (
        <div className="job-card-portfolio" title={job.portfolio_direction}>
          🎯 {job.portfolio_direction}
        </div>
      )}
      {job.url && (
        <a href={safeHref(job.url)} target="_blank" rel="noopener"
          className="job-card-url" onClick={e => e.stopPropagation()}>
          <Icon.External /> 공고 원문 보기
        </a>
      )}
      {isInactive && <div className="job-card-inactive-badge">종료된 공고</div>}
    </div>
  );
}

/* ==========================================================================
   🗂 JobKanban — 칸반 뷰 (상태별 컬럼)
   ========================================================================== */
function JobKanban({ jobs, onOpen, dueState, planState }) {
  const columns = JOB_STATUSES;
  const grouped = useMemo(() => {
    const map = Object.fromEntries(columns.map(s => [s, []]));
    jobs.forEach(j => {
      const s = map[j.status] ? j.status : '미지원';
      map[s].push(j);
    });
    return map;
  }, [jobs]);
  return (
    <div className="job-kanban">
      {columns.map(status => {
        const list = grouped[status] || [];
        const sty = JOB_STATUS_STYLES[status] || JOB_STATUS_STYLES['미지원'];
        return (
          <div key={status} className="job-kanban-col">
            <div className="job-kanban-head">
              <span className="pill" style={{ background: sty.bg, color: sty.fg }}>{status}</span>
              <span className="muted" style={{ fontSize: 11 }}>{list.length}개</span>
            </div>
            <div className="job-kanban-list">
              {list.length === 0 ? (
                <div className="job-kanban-empty">—</div>
              ) : list.map(j => (
                <JobCard key={j.id} job={j} onOpen={() => onOpen(j.id)}
                  dueState={dueState} planState={planState} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

window.JobsTab = JobsTab;
window.JOB_STATUS_STYLES = JOB_STATUS_STYLES;
window.JOB_STATUSES = JOB_STATUSES;
window.FunnelCard = FunnelCard;
window.computeJobFunnel = computeJobFunnel;
window.InterviewRoundsEditor = InterviewRoundsEditor;
window.roundsSummary = roundsSummary;
window.ROUND_STATUS_STYLES = ROUND_STATUS_STYLES;
window.KeywordsChipInput = KeywordsChipInput;
window.JobCard = JobCard;
window.JobKanban = JobKanban;
