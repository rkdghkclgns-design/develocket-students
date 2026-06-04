/* ==========================================================================
   admin-extras.jsx
   - AdminKPIBar         : 취업률, 목표 달성률, 등급/직종 분포
   - StudentAdminPanel   : 학생 상세에서 관리자 전용 필드 편집
   - AttendancePanel     : 자습실 / 특강 출석 그리드 (날짜별 체크)
   - 모든 패널은 관리자 전용 — 학생 화면에서는 절대 노출 X
   ========================================================================== */

const EMP_STATUSES = ['구직중', '직종 취업', '알바', '창업', '미응시', '연락두절', '기타'];
const GRADE_OPTIONS = ['', 'A', 'B', 'C', 'D', '조기수료'];

/* ----------- AdminKPIBar ----------- */
function AdminKPIBar({ cohortId, kpiTarget = 0.7, activeFilter = 'all', onFilter }) {
  const stats = useMemo(() => window.STORE.getEmploymentStats(cohortId), [cohortId, activeFilter]);
  const achievement = stats.employment_rate / kpiTarget;
  const pct = Math.round(stats.employment_rate * 100);
  const kpiPct = Math.round(kpiTarget * 100);
  const achievePct = Math.round(achievement * 100);
  const trigger = onFilter || (() => {});

  const cardClickable = (filterKey, body) => {
    const active = activeFilter === filterKey;
    return (
      <button type="button"
        className={`kpi-card kpi-card-filter ${active ? 'active' : ''}`}
        onClick={() => trigger(filterKey)}
        style={{ textAlign: 'left', cursor: 'pointer' }}
        title="클릭하여 필터 적용/해제">
        {body}
        <div className="kpi-filter-hint">{active ? '✓ 필터 적용 중' : '클릭하여 필터'}</div>
      </button>
    );
  };

  return (
    <div className="kpi-bar">
      {cardClickable('employed', (
        <>
          <div className="kpi-label">📊 전체 취업률</div>
          <div className="kpi-big">{pct}<small>%</small></div>
          <div className="kpi-foot">
            모수 {stats.pool_size}명 중 {stats.employed_count}명 취업
            {stats.excluded > 0 && <span className="muted"> · 제외 {stats.excluded}명</span>}
          </div>
          <div className="kpi-bar-wrap">
            <div className="kpi-bar-fill" style={{ width: pct + '%' }}></div>
            <div className="kpi-bar-marker" style={{ left: kpiPct + '%' }} title={`KPI ${kpiPct}%`}></div>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>목표 {kpiPct}% (KPI)</div>
        </>
      ))}

      {cardClickable('in-pool', (
        <>
          <div className="kpi-label">🎯 KPI 대비 달성률</div>
          <div className="kpi-big" style={{ color: achievement >= 1 ? 'var(--alert-fresh)' : achievement >= 0.7 ? 'var(--alert-warn)' : 'var(--alert-danger)' }}>
            {achievePct}<small>%</small>
          </div>
          <div className="kpi-foot">
            {achievement >= 1 ? '✓ 목표 달성' : `${stats.employed_count}/${Math.ceil(stats.pool_size * kpiTarget)}명`}
          </div>
          <div className="kpi-bar-wrap">
            <div className="kpi-bar-fill" style={{
              width: Math.min(100, achievePct) + '%',
              background: achievement >= 1 ? 'var(--alert-fresh)' : 'linear-gradient(90deg, var(--brand-primary), var(--brand-accent))'
            }}></div>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>모수 {stats.pool_size}명 보기</div>
        </>
      ))}

      <div className="kpi-card">
        <div className="kpi-label">🏷️ 등급 분포</div>
        <DistChart dist={stats.grade_dist}
          activeKey={activeFilter.startsWith('grade:') ? activeFilter.slice(6) : null}
          onPick={(k) => trigger(`grade:${k}`)}
          colorMap={{
            'A': '#10B981', 'B': '#3B82F6', 'C': '#F59E0B', 'D': '#EF4444',
            '조기수료': '#8B5CF6', '미분류': '#94A3B8'
          }} />
      </div>

      <div className="kpi-card">
        <div className="kpi-label">💼 직종/취업 분포</div>
        <DistChart dist={stats.emp_dist}
          activeKey={activeFilter.startsWith('emp:') ? activeFilter.slice(4) : null}
          onPick={(k) => trigger(`emp:${k}`)}
          colorMap={{
            '구직중': '#94A3B8', '직종 취업': '#10B981', '알바': '#3B82F6',
            '창업': '#8B5CF6', '미응시': '#F59E0B', '연락두절': '#EF4444', '기타': '#6B7280'
          }} />
      </div>
    </div>
  );
}

/* ----------- DistChart — 가로 막대 비율 (클릭 가능) ----------- */
function DistChart({ dist, colorMap, onPick, activeKey }) {
  const total = Object.values(dist).reduce((s, v) => s + v, 0);
  const entries = Object.entries(dist).filter(([k, v]) => v > 0);
  if (total === 0) return <div className="muted" style={{ fontSize: 12 }}>데이터 없음</div>;
  const clickable = typeof onPick === 'function';
  return (
    <div>
      <div className="dist-stack">
        {entries.map(([k, v]) => (
          <div key={k}
            className={`dist-seg ${clickable ? 'clickable' : ''} ${activeKey === k ? 'active' : ''}`}
            style={{ width: (v / total * 100) + '%', background: colorMap[k] || '#888' }}
            title={`${k}: ${v}명 (${Math.round(v / total * 100)}%)${clickable ? ' — 클릭하여 필터' : ''}`}
            onClick={() => clickable && onPick(k)}>
          </div>
        ))}
      </div>
      <div className="dist-legend">
        {entries.map(([k, v]) => {
          const isActive = activeKey === k;
          if (clickable) {
            return (
              <button key={k} type="button"
                className={`dist-leg-item dist-leg-btn ${isActive ? 'active' : ''}`}
                onClick={() => onPick(k)}
                title="클릭하여 필터 적용/해제">
                <span className="dist-leg-dot" style={{ background: colorMap[k] || '#888' }}></span>
                <b>{k}</b>
                <span className="muted">{v}</span>
              </button>
            );
          }
          return (
            <span key={k} className="dist-leg-item">
              <span className="dist-leg-dot" style={{ background: colorMap[k] || '#888' }}></span>
              <b>{k}</b>
              <span className="muted">{v}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ----------- StudentAdminPanel — 학생 디테일에서 관리자 전용 필드 편집 ----------- */
function StudentAdminPanel({ student, onChange }) {
  const [fields, setFields] = useState({
    grade: student.grade || '',
    career_goal: student.career_goal || '',
    alt_employment: !!student.alt_employment,
    employment_status: student.employment_status || '구직중',
    excluded_from_pool: !!student.excluded_from_pool,
    drive_link: student.drive_link || ''
  });
  const [savedFlash, setSavedFlash] = useState(false);

  function setF(k, v) {
    const next = { ...fields, [k]: v };
    setFields(next);
    window.STORE.updateStudentFields(student.id, next);
    setSavedFlash(true);
    clearTimeout(setF._t);
    setF._t = setTimeout(() => setSavedFlash(false), 1200);
    onChange && onChange();
  }

  const gradeColor = {
    A: 'var(--alert-fresh)', B: 'var(--status-in-progress)',
    C: 'var(--alert-warn)', D: 'var(--alert-danger)',
    '조기수료': '#8B5CF6'
  };

  return (
    <div className="admin-only-card">
      <div className="aoc-head">
        <span className="aoc-tag">👨‍🏫 관리자 전용</span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>수강생 관리 필드</span>
        {savedFlash && <span className="pill" style={{ background: 'var(--alert-fresh-bg)', color: 'var(--alert-fresh)', fontSize: 10, marginLeft: 'auto' }}>✓ 저장됨</span>}
      </div>

      <div className="admin-fields-grid">
        {/* 등급 */}
        <div className="af-row">
          <div className="af-label">🏷️ 등급</div>
          <div className="af-control">
            <div className="grade-picker">
              {GRADE_OPTIONS.map(g => (
                <button key={g || 'none'}
                  className={`grade-pick ${fields.grade === g ? 'active' : ''}`}
                  style={{ color: g ? gradeColor[g] : 'var(--ink-mute)' }}
                  onClick={() => setF('grade', g)}>
                  {g || '—'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 취업 상태 */}
        <div className="af-row">
          <div className="af-label">💼 취업 여부</div>
          <div className="af-control">
            <select className="select" value={fields.employment_status}
              onChange={e => setF('employment_status', e.target.value)}>
              {EMP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* 직종 전향 */}
        <div className="af-row">
          <div className="af-label">🔄 알바/직종 전향</div>
          <div className="af-control">
            <label className="check-row">
              <input type="checkbox" checked={fields.alt_employment}
                onChange={e => setF('alt_employment', e.target.checked)} />
              <span>알바·창업 등으로 전향 (직종 외)</span>
            </label>
          </div>
        </div>

        {/* 모수 제외 */}
        <div className="af-row">
          <div className="af-label">⊘ 모수 제외</div>
          <div className="af-control">
            <label className="check-row">
              <input type="checkbox" checked={fields.excluded_from_pool}
                onChange={e => setF('excluded_from_pool', e.target.checked)} />
              <span>취업률 산정 모수에서 제외</span>
            </label>
          </div>
        </div>

        {/* 희망 진로 */}
        <div className="af-row">
          <div className="af-label">🎯 희망 취업 진로</div>
          <div className="af-control">
            <input className="input" placeholder="예: 게임 기획자, 클라이언트 개발자, VR 콘텐츠 등"
              value={fields.career_goal}
              onChange={e => setF('career_goal', e.target.value)} />
          </div>
        </div>

        {/* 드라이브 링크 */}
        <div className="af-row">
          <div className="af-label">📁 드라이브 링크</div>
          <div className="af-control" style={{ display: 'flex', gap: 6 }}>
            <input className="input" placeholder="https://drive.google.com/..."
              value={fields.drive_link}
              onChange={e => setF('drive_link', e.target.value)} />
            {fields.drive_link && (
              <a href={safeHref(fields.drive_link)} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">
                <Icon.External /> 열기
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------- AttendancePanel — 자습실 / 특강 출석 그리드 ----------- */
function AttendancePanel({ cohortId, type, kind }) {
  const today = window.STORE_HELPERS.todayStr();
  const [days, setDays] = useState(() => generateRange(14));
  const [_, force] = useState(0);

  // Supabase 비동기 부트스트랩 / Gist 폴링으로 데이터가 늦게 도착하는 경우 대비
  useEffect(() => {
    const unsubscribe = window.STORE.onChange(() => force(x => x + 1));
    return unsubscribe;
  }, []);

  function generateRange(n) {
    const arr = [];
    const t = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(t); d.setDate(d.getDate() - i);
      arr.push(window.STORE_HELPERS.todayStr(d));
    }
    return arr;
  }

  const students = window.STORE.listStudents(cohortId);

  function toggle(studentId, date) {
    const att = window.STORE.getAttendance(studentId, type, date);
    if (att) {
      window.STORE.setAttendance(studentId, type, date, false);
    } else {
      window.STORE.setAttendance(studentId, type, date, true);
    }
    force(x => x + 1);
  }

  const totalsByDate = useMemo(() => {
    const t = {};
    days.forEach(d => {
      t[d] = students.filter(s => window.STORE.getAttendance(s.id, type, d)).length;
    });
    return t;
  }, [days, cohortId, _]);

  function shiftDays(direction) {
    const first = new Date(days[0]);
    first.setDate(first.getDate() + direction * 7);
    const arr = [];
    for (let i = 0; i < days.length; i++) {
      const d = new Date(first); d.setDate(d.getDate() + i);
      arr.push(window.STORE_HELPERS.todayStr(d));
    }
    setDays(arr);
  }

  return (
    <div className="attendance-panel">
      <div className="att-head">
        <div>
          <div className="h3" style={{ margin: 0 }}>{kind === 'lecture' ? '🎤 특강 출석' : '📚 자습실 출석'}</div>
          <div className="muted" style={{ fontSize: 12 }}>관리자 전용 · 칸 클릭으로 출석 토글</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => shiftDays(-1)}>← 이전 주</button>
          <span className="muted" style={{ fontSize: 12 }}>{days[0]} ~ {days[days.length - 1]}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => shiftDays(1)}>다음 주 →</button>
        </div>
      </div>

      <div className="att-grid-wrap">
        <table className="att-grid">
          <thead>
            <tr>
              <th className="att-name-col">이름</th>
              <th className="att-total-col">합계</th>
              {days.map(d => {
                const dt = new Date(d);
                const dow = ['일','월','화','수','목','금','토'][dt.getDay()];
                const isToday = d === today;
                const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
                return (
                  <th key={d} className={`att-day ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}`}>
                    <div className="att-day-num">{dt.getDate()}</div>
                    <div className="att-day-dow">{dow}</div>
                    <div className="att-day-count">{totalsByDate[d] || 0}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {students.map(s => {
              const total = window.STORE.countAttendance(s.id, type);
              return (
                <tr key={s.id}>
                  <td className="att-name-col">
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{s.name}</div>
                  </td>
                  <td className="att-total-col">
                    <span className="att-total">{total}</span>
                  </td>
                  {days.map(d => {
                    const att = window.STORE.getAttendance(s.id, type, d);
                    return (
                      <td key={d} className="att-cell"
                        onClick={() => toggle(s.id, d)}>
                        {att ? <span className="att-mark">O</span> : <span className="att-empty">·</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ==========================================================================
   📅 AdminMentoringPanel — 캘린더 + 일자/시간 리스트 (관리자 전용)
   ========================================================================== */
function AdminMentoringPanel({ cohortId }) {
  const today = window.STORE_HELPERS.todayStr();
  const [_, force] = useState(0);
  const [viewMode, setViewMode] = useState('calendar');
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const unsub = window.STORE.onChange(() => force(v => v + 1));
    return unsub;
  }, []);

  const students = useMemo(() => window.STORE.listStudents(cohortId), [cohortId, _]);
  const studentMap = useMemo(() => {
    const m = {}; students.forEach(s => { m[s.id] = s; }); return m;
  }, [students]);
  const sessions = useMemo(() => window.STORE.listMentoring({ cohort: cohortId }), [cohortId, _]);
  const sessionsByDate = useMemo(() => {
    const g = {};
    sessions.forEach(s => {
      const d = (s.scheduled_at || '').slice(0, 10);
      if (!d) return;
      g[d] = g[d] || [];
      g[d].push(s);
    });
    return g;
  }, [sessions]);

  function moveMonth(delta) {
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + delta);
    setCursor(next);
  }
  function goToday() {
    const t = new Date();
    setCursor(t);
    setSelectedDate(window.STORE_HELPERS.todayStr(t));
  }
  function buildMonthGrid() {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const startWeekday = first.getDay();
    const lastDay = new Date(y, m + 1, 0).getDate();
    const grid = [];
    for (let i = 0; i < startWeekday; i++) grid.push(null);
    for (let d = 1; d <= lastDay; d++) {
      const dt = new Date(y, m, d);
      grid.push(window.STORE_HELPERS.todayStr(dt));
    }
    while (grid.length < 42) grid.push(null);
    return grid;
  }
  const monthLabel = `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`;
  const grid = useMemo(buildMonthGrid, [cursor]);
  const selectedSessions = sessionsByDate[selectedDate] || [];

  return (
    <div className="mentoring-panel">
      <div className="att-head" style={{ marginBottom: 14 }}>
        <div>
          <div className="h3" style={{ margin: 0 }}>📅 멘토링 일정</div>
          <div className="muted" style={{ fontSize: 12 }}>
            관리자 전용 · 일자별 면담·멘토링 예정 확인 · {sessions.length}건 ({window.STUDENT_ROSTER[cohortId]?.label || cohortId})
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="layout-switch" role="tablist" aria-label="멘토링 보기 모드">
            <button className={viewMode === 'calendar' ? 'active' : ''}
              role="tab" aria-selected={viewMode === 'calendar'}
              onClick={() => setViewMode('calendar')}>🗓 캘린더</button>
            <button className={viewMode === 'list' ? 'active' : ''}
              role="tab" aria-selected={viewMode === 'list'}
              onClick={() => setViewMode('list')}>📋 리스트</button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => {
            setEditing({
              student_id: students[0]?.id || '',
              scheduled_at: selectedDate + 'T14:00',
              duration_min: 30,
              topic: '', location: '', mentor: '관리자',
              status: 'scheduled', admin_notes: '', student_notes: ''
            });
          }}>+ 세션 추가</button>
        </div>
      </div>

      {viewMode === 'calendar' && (
        <>
          <div className="mentoring-month-nav">
            <button className="btn btn-secondary btn-sm" onClick={() => moveMonth(-1)}>← 이전 달</button>
            <div style={{ fontSize: 16, fontWeight: 700, flex: 1, textAlign: 'center' }}>{monthLabel}</div>
            <button className="btn btn-ghost btn-sm" onClick={goToday}>오늘</button>
            <button className="btn btn-secondary btn-sm" onClick={() => moveMonth(1)}>다음 달 →</button>
          </div>
          <div className="mentoring-cal">
            {['일', '월', '화', '수', '목', '금', '토'].map(d => (
              <div key={d} className="mentoring-cal-dow">{d}</div>
            ))}
            {grid.map((dateStr, i) => {
              if (!dateStr) return <div key={i} className="mentoring-cal-cell empty"></div>;
              const day = parseInt(dateStr.slice(8, 10), 10);
              const dayOfWeek = i % 7;
              const list = sessionsByDate[dateStr] || [];
              const isToday = dateStr === today;
              const isSelected = dateStr === selectedDate;
              const dowLabel = ['일','월','화','수','목','금','토'][dayOfWeek];
              return (
                <div key={i}
                  className={`mentoring-cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${dayOfWeek === 0 ? 'sun' : ''} ${dayOfWeek === 6 ? 'sat' : ''}`}
                  role="button" tabIndex={0}
                  aria-label={`${dateStr} ${dowLabel}요일${isToday ? ' (오늘)' : ''} · 멘토링 ${list.length}건`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedDate(dateStr)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedDate(dateStr); } }}>
                  <div className="mentoring-cal-day">{day}</div>
                  {list.slice(0, 3).map(s => {
                    const st = studentMap[s.student_id];
                    const time = (s.scheduled_at || '').slice(11, 16);
                    const label = `${time} ${st?.name || s.student_id} ${s.topic || ''}`;
                    return (
                      <div key={s.id} className={`mentoring-cal-pill status-${s.status}`}
                        role="listitem" aria-label={label}
                        title={`${time} · ${st?.name || s.student_id} · ${s.topic || ''}`}>
                        <span className="mt-time">{time}</span>
                        <span className="mt-name">{st?.name || '?'}</span>
                      </div>
                    );
                  })}
                  {list.length > 3 && (
                    <div className="mentoring-cal-more" aria-label={`외 ${list.length - 3}건 더 있음`}>+{list.length - 3}건</div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mentoring-day-detail">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                📌 {selectedDate} ({selectedSessions.length}건)
              </div>
            </div>
            {selectedSessions.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>이 날짜에 예정된 멘토링이 없습니다.</div>
            ) : (
              <div className="mentoring-day-list">
                {selectedSessions.map(s => (
                  <MentoringRow key={s.id} session={s} student={studentMap[s.student_id]}
                    onEdit={() => setEditing(s)}
                    onDelete={async () => {
                      if (!confirm('이 멘토링 세션을 삭제할까요?')) return;
                      try {
                        const r = window.STORE.deleteMentoring(s.id);
                        if (r && typeof r.then === 'function') await r;
                      } catch (e) { window.showToast('삭제 실패: ' + e.message, 'error'); }
                    }}
                    onStatusChange={async (newStatus) => {
                      try {
                        const r = window.STORE.upsertMentoring({ ...s, status: newStatus });
                        if (r && typeof r.then === 'function') await r;
                      } catch (e) { window.showToast('상태 변경 실패: ' + e.message, 'error'); }
                    }} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {viewMode === 'list' && (
        <div className="mentoring-list-view">
          {sessions.length === 0 ? (
            <div className="empty"><div className="big">📅</div>예정된 멘토링이 없습니다</div>
          ) : (
            <div className="mentoring-day-list">
              {sessions.map(s => (
                <MentoringRow key={s.id} session={s} student={studentMap[s.student_id]} showDate
                  onEdit={() => setEditing(s)}
                  onDelete={async () => {
                    if (!confirm('이 멘토링 세션을 삭제할까요?')) return;
                    try {
                      const r = window.STORE.deleteMentoring(s.id);
                      if (r && typeof r.then === 'function') await r;
                    } catch (e) { window.showToast('삭제 실패: ' + e.message, 'error'); }
                  }}
                  onStatusChange={async (newStatus) => {
                    try {
                      const r = window.STORE.upsertMentoring({ ...s, status: newStatus });
                      if (r && typeof r.then === 'function') await r;
                    } catch (e) { window.showToast('상태 변경 실패: ' + e.message, 'error'); }
                  }} />
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <MentoringEditModal
          initial={editing}
          students={students}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            try {
              const r = window.STORE.upsertMentoring(payload);
              if (r && typeof r.then === 'function') await r;
              setEditing(null);
            } catch (e) {
              window.showToast('저장 실패: ' + e.message, 'error');
            }
          }}
        />
      )}
    </div>
  );
}

function MentoringRow({ session, student, showDate, onEdit, onDelete, onStatusChange }) {
  const s = session;
  const dt = s.scheduled_at || '';
  const date = dt.slice(0, 10);
  const time = dt.slice(11, 16);
  const statusLabel = {
    scheduled: '예정', completed: '완료', cancelled: '취소', no_show: '불참'
  }[s.status] || s.status;
  return (
    <div className={`mentoring-row status-${s.status}`}>
      <div className="mentoring-row-time">
        {showDate && <div className="mr-date">{date}</div>}
        <div className="mr-clock">⏰ {time}</div>
        <div className="mr-dur">{s.duration_min}분</div>
      </div>
      <div className="mentoring-row-body">
        <div className="mentoring-row-head">
          <Avatar name={student?.name || '?'} size={28} />
          <div style={{ fontWeight: 700, fontSize: 14 }}>{student?.name || s.student_id}</div>
          <span className={`pill status-pill-${s.status}`}>{statusLabel}</span>
          {s.student_notes && <span className="pill" style={{ background: 'var(--alert-fresh-bg)', color: 'var(--alert-fresh)', fontSize: 10 }}>✓ 학생 기록</span>}
        </div>
        {s.topic && <div className="mentoring-row-topic">📌 {s.topic}</div>}
        {s.location && <div className="muted" style={{ fontSize: 12 }}>📍 {s.location}</div>}
        {s.mentor && <div className="muted" style={{ fontSize: 12 }}>🎓 {s.mentor}</div>}
        {s.admin_notes && (
          <details className="mentoring-row-notes">
            <summary>관리자 의제</summary>
            <MarkdownView text={s.admin_notes} />
          </details>
        )}
        {s.student_notes && (
          <details className="mentoring-row-notes">
            <summary>🧑‍🎓 학생 기록 {s.student_notes_updated_at && `(${new Date(s.student_notes_updated_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })})`}</summary>
            <MarkdownView text={s.student_notes} />
          </details>
        )}
      </div>
      <div className="mentoring-row-actions">
        <select className="select" style={{ padding: '4px 8px', fontSize: 11 }}
          value={s.status} onChange={e => onStatusChange(e.target.value)}>
          <option value="scheduled">예정</option>
          <option value="completed">완료</option>
          <option value="cancelled">취소</option>
          <option value="no_show">불참</option>
        </select>
        <button className="btn btn-ghost btn-sm" onClick={onEdit} aria-label="멘토링 세션 편집" title="편집"><Icon.Edit /></button>
        <button className="btn btn-ghost btn-sm" onClick={onDelete} aria-label="멘토링 세션 삭제" title="삭제" style={{ color: 'var(--alert-danger)' }}><Icon.Trash /></button>
      </div>
    </div>
  );
}

function MentoringEditModal({ initial, students, onClose, onSave }) {
  const boxRef = useRef(null);
  const titleId = useMemo(() => 'mt-title-' + Math.random().toString(36).slice(2, 8), []);
  window.useModalA11y(boxRef, onClose);

  const [form, setForm] = useState({
    id: initial.id || '',
    student_id: initial.student_id || (students[0]?.id || ''),
    scheduled_at: initial.scheduled_at || '',
    duration_min: initial.duration_min ?? 30,
    topic: initial.topic || '',
    location: initial.location || '',
    mentor: initial.mentor || '관리자',
    status: initial.status || 'scheduled',
    admin_notes: initial.admin_notes || '',
    student_notes: initial.student_notes || '',
    student_notes_updated_at: initial.student_notes_updated_at || null,
    created_by: initial.created_by || 'admin',
    created_at: initial.created_at || new Date().toISOString()
  });
  const [submitting, setSubmitting] = useState(false);

  function up(k, v) { setForm(f => ({ ...f, [k]: v })); }
  async function submit() {
    if (!form.student_id) { window.showToast('수강생을 선택하세요', 'error'); return; }
    if (!form.scheduled_at) { window.showToast('일자/시간을 입력하세요', 'error'); return; }
    setSubmitting(true);
    try {
      await onSave({ ...form });
    } finally {
      setSubmitting(false);
    }
  }

  const isNew = !form.id;
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560 }}
        role="dialog" aria-modal="true" aria-labelledby={titleId} ref={boxRef}>
        <div className="drawer-head">
          <div>
            <div className="h2" id={titleId} style={{ margin: 0 }}>{isNew ? '📅 새 멘토링 세션' : '✏️ 멘토링 편집'}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {isNew ? '새 멘토링 일정을 추가합니다' : '기존 세션을 수정합니다'}
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}><Icon.X /></button>
        </div>
        <div className="drawer-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="field-label">수강생 *</div>
            <select className="select" value={form.student_id} onChange={e => up('student_id', e.target.value)}>
              {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <div className="field-label">일자·시간 *</div>
            <input type="datetime-local" className="input"
              value={(form.scheduled_at || '').slice(0, 16)}
              onChange={e => up('scheduled_at', e.target.value)} />
          </div>
          <div>
            <div className="field-label">진행 시간(분)</div>
            <input type="number" className="input"
              value={form.duration_min}
              onChange={e => up('duration_min', parseInt(e.target.value) || 30)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="field-label">주제</div>
            <input className="input" value={form.topic} onChange={e => up('topic', e.target.value)}
              placeholder="예: 자기소개서 피드백, 면접 모의" />
          </div>
          <div>
            <div className="field-label">장소</div>
            <input className="input" value={form.location} onChange={e => up('location', e.target.value)}
              placeholder="예: 강의실 A / Zoom" />
          </div>
          <div>
            <div className="field-label">멘토</div>
            <input className="input" value={form.mentor} onChange={e => up('mentor', e.target.value)} />
          </div>
          <div>
            <div className="field-label">상태</div>
            <select className="select" value={form.status} onChange={e => up('status', e.target.value)}>
              <option value="scheduled">예정</option>
              <option value="completed">완료</option>
              <option value="cancelled">취소</option>
              <option value="no_show">불참</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="field-label">관리자 의제 <span style={{ fontWeight: 400, color: 'var(--ink-mute)' }}>(학생도 봄)</span></div>
            <MarkdownEditor value={form.admin_notes} onChange={v => up('admin_notes', v)}
              placeholder="멘토링에서 다룰 주제·자료·체크리스트" rows={3} minimal />
          </div>
          {!isNew && form.student_notes && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="field-label">🧑‍🎓 학생 사후 기록</div>
              <div style={{ padding: 10, background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', fontSize: 13 }}>
                <MarkdownView text={form.student_notes} />
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                * 학생 본인이 작성. 관리자는 열람만 가능
              </div>
            </div>
          )}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>취소</button>
            <button className="btn btn-primary" onClick={submit} disabled={submitting}
              style={{ flex: 1, opacity: submitting ? 0.7 : 1, cursor: submitting ? 'wait' : 'pointer' }}>
              {submitting ? '⏳ 저장 중…' : (isNew ? '+ 추가' : '💾 저장')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  AdminKPIBar, StudentAdminPanel, AttendancePanel, EMP_STATUSES, GRADE_OPTIONS,
  AdminMentoringPanel, MentoringRow, MentoringEditModal
});
