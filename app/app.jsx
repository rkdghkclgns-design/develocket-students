/* ==========================================================================
   디벨로켓 메인 App — Login → Student / Admin View 분기
   Tweaks 패널 통합
   ========================================================================== */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "cohortOverride": "auto",
  "primaryColor": "#7C5CFF",
  "accentColor": "#FF8A3D",
  "dangerThreshold": 3,
  "adminLayout": "cards",
  "alwaysAdmin": false,
  "statusStyle": "stepped",
  "showSupabaseNote": true
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState('daily'); // 'daily' | 'jobs' (student) — admin handles its own
  // STORE 변경(기수 추가/아카이브 등) 시 상단바 셀렉트박스 등 자동 갱신
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const unsub = window.STORE.onChange(() => forceUpdate(v => v + 1));
    return unsub;
  }, []);

  /* Apply tweaks (CSS variables) */
  useEffect(() => {
    document.documentElement.style.setProperty('--brand-primary', t.primaryColor);
    document.documentElement.style.setProperty('--brand-accent', t.accentColor);
    document.documentElement.style.setProperty('--brand-primary-soft',
      `color-mix(in oklab, ${t.primaryColor} 18%, white)`);
    document.documentElement.style.setProperty('--brand-primary-deep',
      `color-mix(in oklab, ${t.primaryColor} 65%, black)`);
    document.documentElement.style.setProperty('--brand-accent-soft',
      `color-mix(in oklab, ${t.accentColor} 18%, white)`);
    document.documentElement.style.setProperty('--shadow-pop',
      `0 10px 30px color-mix(in oklab, ${t.primaryColor} 25%, transparent)`);
  }, [t.primaryColor, t.accentColor]);

  /* When tweak adminLayout / dangerThreshold changes, propagate to admin */
  function logout() {
    localStorage.removeItem('develocket.last_login');
    setSession(null);
  }

  function switchCohort(cohortId) {
    setSession(s => s ? { ...s, cohortId } : s);
  }

  // Cohort override via tweaks (auto = use session cohort)
  const activeCohortId = session
    ? (t.cohortOverride === 'auto' ? session.cohortId : t.cohortOverride)
    : null;

  /* ----- Render ----- */
  if (!session) {
    return (
      <>
        <div className="app-bg"></div>
        <LoginScreen onLogin={s => {
          // alwaysAdmin tweak: force admin view if enabled (still need cohort)
          setSession(t.alwaysAdmin ? { ...s, isAdmin: true } : s);
        }} />
        {renderTweaks(t, setTweak)}
      </>
    );
  }

  const activeIds = window.getActiveCohortIds();
  const effectiveCohortId = activeIds.includes(activeCohortId)
    ? activeCohortId
    : (activeIds[0] || activeCohortId);
  const cohort = window.STUDENT_ROSTER[effectiveCohortId];
  const me = session.isAdmin ? null
    : window.STORE.getStudentByCohortName(effectiveCohortId, session.studentName);

  return (
    <>
      <div className="app-bg"></div>
      <div className="app-shell">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-brand">
            <img src="assets/develocket-logo-tight.png" alt="디벨로켓" className="topbar-brand-logo" />
            <span className="pill" style={{ background: 'var(--brand-primary-soft)', color: 'var(--brand-primary-deep)' }}>
              {cohort.label}
            </span>
          </div>

          <div className="topbar-user">
            {/* Cohort switcher (admin only) */}
            {session.isAdmin && (
              <select className="select" style={{ width: 180, padding: '6px 10px' }}
                value={activeCohortId}
                onChange={e => switchCohort(e.target.value)}>
                {window.getActiveCohortEntries().map(([id, c]) =>
                  <option key={id} value={id}>{c.label}</option>
                )}
              </select>
            )}
            <div className="user-chip">
              {session.isAdmin ? (
                <>
                  <Avatar name="관리자" size={24} />
                  관리자
                </>
              ) : me ? (
                <>
                  <Avatar name={me.name} size={24} />
                  {me.name}
                </>
              ) : null}
            </div>
            <button className="btn btn-ghost btn-icon" onClick={logout} title="로그아웃">
              <Icon.Logout />
            </button>
          </div>
        </div>

        {/* Student tabs */}
        {!session.isAdmin && me && (
          <div className="tab-bar">
            <button className={`tab ${tab === 'daily' ? 'active' : ''}`}
              onClick={() => setTab('daily')}>
              📝 일일 보고
              {window.STORE.getTodayReport(me.id) && <span className="tab-badge">✓ 오늘</span>}
            </button>
            <button className={`tab ${tab === 'jobs' ? 'active' : ''}`}
              onClick={() => setTab('jobs')}>
              📋 공고 관리
              <span className="tab-badge">{window.STORE.listJobs(me.id).length}</span>
            </button>
            <button className={`tab ${tab === 'docs' ? 'active' : ''}`}
              onClick={() => setTab('docs')}>
              📁 이력서·포폴
              <span className="tab-badge">{window.STORE.listDocuments(me.id).length}</span>
            </button>
            <button className={`tab ${tab === 'mentoring' ? 'active' : ''}`}
              onClick={() => setTab('mentoring')}>
              📅 멘토링
              {(() => {
                const all = window.STORE.listMentoring({ studentId: me.id });
                const pending = all.filter(m => m.status === 'completed' && !m.student_notes).length;
                return pending > 0 ? <span className="tab-badge" style={{ background: 'var(--alert-warn)' }}>!{pending}</span> :
                  (all.length > 0 ? <span className="tab-badge">{all.length}</span> : null);
              })()}
            </button>
          </div>
        )}

        {/* Body */}
        <div className="page">
          {session.isAdmin ? (
            <AdminDashboard
              cohortId={effectiveCohortId}
              dangerThreshold={t.dangerThreshold}
              layout={t.adminLayout}
              onChangeLayout={(v) => setTweak('adminLayout', v)}
              onChangeThreshold={(v) => setTweak('dangerThreshold', v)}
              onLogout={logout}
              onSwitchCohort={switchCohort}
            />
          ) : me ? (
            tab === 'jobs' ? <JobsTab student={me} />
              : tab === 'docs' ? <DocumentsPanel student={me} viewerRole="student" />
              : tab === 'mentoring' ? <StudentMentoringTab student={me} />
              : <DailyReportTab student={me} />
          ) : (
            <div className="empty">
              <div className="big">⚠️</div>
              해당 기수에 본인 정보가 없습니다.
              <div style={{ marginTop: 12 }}>
                <button className="btn btn-secondary" onClick={logout}>다시 로그인</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {renderTweaks(t, setTweak)}
    </>
  );
}

function renderTweaks(t, setTweak) {
  const mode = window.STORE_MODE || 'local';
  const cfg = window.getSupabaseConfig?.();

  return (
    <TweaksPanel>
      <TweakSection label="🎨 비주얼" />
      <TweakColor label="메인 색상" value={t.primaryColor}
        options={['#7C5CFF', '#3B82F6', '#10B981', '#EC4899', '#F59E0B']}
        onChange={v => setTweak('primaryColor', v)} />
      <TweakColor label="강조 색상" value={t.accentColor}
        options={['#FF8A3D', '#F59E0B', '#10B981', '#06B6D4', '#EC4899']}
        onChange={v => setTweak('accentColor', v)} />

      <TweakSection label="👨‍🏫 관리자" />
      <TweakToggle label="항상 관리자 모드"
        value={t.alwaysAdmin}
        onChange={v => setTweak('alwaysAdmin', v)} />
      <TweakRadio label="대시보드 레이아웃"
        value={t.adminLayout}
        options={['cards', 'table', 'kanban']}
        onChange={v => setTweak('adminLayout', v)} />
      <TweakSlider label="경과일 경고 임계값"
        value={t.dangerThreshold}
        min={2} max={14} step={1} unit="일"
        onChange={v => setTweak('dangerThreshold', v)} />

      <TweakSection label="🗂️ 기수" />
      <TweakSelect label="기수 강제 전환 (관리자)"
        value={t.cohortOverride}
        options={['auto', '기획3기', '프로그램3기']}
        onChange={v => setTweak('cohortOverride', v)} />

      <TweakSection label="🔌 Supabase 연결" />
      <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
        현재 모드: <b style={{ color: mode === 'supabase' ? 'var(--alert-fresh)' : 'var(--ink-mute)' }}>
          {mode === 'supabase' ? '🟢 Supabase' : '⚪ localStorage'}
        </b>
        <br/>
        <span style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
          {mode === 'supabase'
            ? `${(cfg?.url || '').slice(0, 30)}…`
            : '아래 버튼으로 연결하세요'}
        </span>
      </div>
      <TweakButton label="Supabase 연결 설정" onClick={() => {
        const url = prompt('Supabase Project URL', cfg?.url || 'https://xxx.supabase.co');
        if (!url) return;
        const anonKey = prompt('Supabase anon key', cfg?.anonKey || '');
        if (!anonKey) return;
        window.setSupabaseConfig({ url, anonKey });
        if (confirm('설정 저장됨. 새로고침하여 적용할까요?')) location.reload();
      }} />
      {mode === 'supabase' && (
        <TweakButton label="Supabase 연결 해제" onClick={() => {
          if (confirm('연결을 해제하고 localStorage 모드로 돌아갈까요?')) {
            window.setSupabaseConfig(null);
            location.reload();
          }
        }} />
      )}

      <TweakSection label="⚙️ 기타" />
      <TweakButton label="데모 데이터 초기화"
        onClick={() => {
          if (confirm('localStorage 데이터를 초기화할까요? (수강생 명단은 다시 시드됩니다)')) {
            if (window.STORE.resetAll) window.STORE.resetAll();
            else localStorage.removeItem('develocket.v1');
            location.reload();
          }
        }} />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
