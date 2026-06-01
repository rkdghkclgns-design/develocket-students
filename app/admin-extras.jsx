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

Object.assign(window, { AdminKPIBar, StudentAdminPanel, AttendancePanel, EMP_STATUSES, GRADE_OPTIONS });
