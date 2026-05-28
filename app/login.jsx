/* ==========================================================================
   통합 로그인 (Full-screen split layout)
   LEFT: brand hero (로고, 태그라인, 통계, 장식 모티프)
   RIGHT: form (기수 탭, 검색, 학생 그리드, 관리자 토글, 입장)
   ========================================================================== */
function LoginScreen({ onLogin }) {
  const activeCohorts = window.getActiveCohortEntries();
  const defaultCohortId = activeCohorts.length > 0 ? activeCohorts[0][0] : null;
  const [cohortId, setCohortId] = useState(defaultCohortId || '기획3기');
  const [selectedName, setSelectedName] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPrompt, setAdminPrompt] = useState(false);
  const [adminPw, setAdminPw] = useState('');
  const [adminError, setAdminError] = useState('');
  const [search, setSearch] = useState('');

  // Student password state
  const [studentPwMode, setStudentPwMode] = useState('idle'); // 'idle' | 'set' | 'verify'
  const [studentPw, setStudentPw] = useState('');
  const [studentPw2, setStudentPw2] = useState('');
  const [studentPwError, setStudentPwError] = useState('');
  const [studentVerified, setStudentVerified] = useState(false);

  const ADMIN_PASSWORD = '1124';

  // Supabase 비동기 부트스트랩 / 외부 동기화 완료 시 자동 리렌더
  const [storeVersion, setStoreVersion] = useState(0);
  useEffect(() => {
    const unsubscribe = window.STORE.onChange(() => setStoreVersion(v => v + 1));
    return unsubscribe;
  }, []);

  const cohort = window.STUDENT_ROSTER[cohortId];
  const noActiveCohort = !cohort;
  const students = useMemo(
    () => cohort ? window.STORE.listStudents(cohortId) : [],
    [cohort, cohortId, storeVersion]
  );
  const filtered = useMemo(() => {
    if (!search.trim()) return students;
    return students.filter(s => s.name.includes(search.trim()));
  }, [students, search]);
  const isLoading = students.length === 0 && cohort && (window.STORE_MODE === 'supabase' || window.STORE_MODE === 'gist') && storeVersion === 0;

  useEffect(() => {
    try {
      const last = JSON.parse(localStorage.getItem('develocket.last_login') || 'null');
      if (last && last.cohortId && window.STUDENT_ROSTER[last.cohortId]) {
        const stillActive = window.getActiveCohortIds().includes(last.cohortId);
        if (stillActive) setCohortId(last.cohortId);
      }
    } catch (e) {}
  }, []);

  /* ---- 학생 이름 선택 시 비밀번호 단계 결정 ---- */
  function pickStudent(name) {
    setSelectedName(name);
    setIsAdmin(false);
    setAdminPrompt(false);
    setStudentVerified(false);
    setStudentPw(''); setStudentPw2(''); setStudentPwError('');

    const s = window.STORE.getStudentByCohortName(cohortId, name);
    if (!s) return;
    const has = window.STORE.hasStudentPassword(s.id);
    setStudentPwMode(has ? 'verify' : 'set');
    setTimeout(() => {
      const el = document.getElementById('student-pw-input');
      if (el) el.focus();
    }, 50);
  }
  function submitStudentPw() {
    const s = window.STORE.getStudentByCohortName(cohortId, selectedName);
    if (!s) return;
    if (studentPwMode === 'set') {
      // 최초 설정
      if (studentPw.length < 4) {
        setStudentPwError('4자리 이상으로 설정하세요');
        return;
      }
      if (studentPw !== studentPw2) {
        setStudentPwError('비밀번호 확인이 일치하지 않습니다');
        return;
      }
      window.STORE.setStudentPassword(s.id, studentPw);
      setStudentVerified(true);
      setStudentPwMode('idle');
      setStudentPwError('');
    } else if (studentPwMode === 'verify') {
      if (!window.STORE.verifyStudentPassword(s.id, studentPw)) {
        setStudentPwError('비밀번호가 일치하지 않습니다');
        setStudentPw('');
        return;
      }
      setStudentVerified(true);
      setStudentPwMode('idle');
      setStudentPwError('');
    }
  }
  function cancelStudentPw() {
    setSelectedName(null);
    setStudentPwMode('idle');
    setStudentVerified(false);
    setStudentPw(''); setStudentPw2(''); setStudentPwError('');
  }

  /* ---- 관리자 패스워드 ---- */
  function handleAdminToggle() {
    if (isAdmin) {
      setIsAdmin(false);
      setAdminPrompt(false);
      setAdminPw(''); setAdminError('');
      return;
    }
    setAdminPrompt(true);
    setAdminError(''); setAdminPw('');
    setSelectedName(null);
    setStudentPwMode('idle'); setStudentVerified(false);
    setTimeout(() => {
      const el = document.getElementById('admin-pw-input');
      if (el) el.focus();
    }, 50);
  }
  function submitAdminPw() {
    if (adminPw === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setAdminPrompt(false);
      setAdminError('');
    } else {
      setAdminError('비밀번호가 일치하지 않습니다');
      setAdminPw('');
    }
  }

  function go() {
    if (adminPrompt) { submitAdminPw(); return; }
    if (studentPwMode !== 'idle') { submitStudentPw(); return; }
    if (!isAdmin && (!selectedName || !studentVerified)) return;
    const session = {
      cohortId, isAdmin,
      studentName: isAdmin ? null : selectedName,
      ts: Date.now()
    };
    localStorage.setItem('develocket.last_login', JSON.stringify(session));
    onLogin(session);
  }

  const canGo = isAdmin || (selectedName && studentVerified);
  const inProgress = adminPrompt || studentPwMode !== 'idle';

  return (
    <div className="login-stage">
      {/* LEFT — Brand hero */}
      <div className="login-hero">
        <div>
          <img src="assets/develocket-logo-tight.png" alt="디벨로켓" className="login-hero-logo" />
          <h1 className="login-hero-tagline">
            수강생의 매일을 <em>한곳에서</em><br/>
            확인하는 가장 간결한 방법
          </h1>
          <p className="login-hero-sub">
            매일의 회고, 주간 목표, 지원 공고, 면접 진행까지 — 멘토와 수강생이 동일한 시야를 공유합니다.
          </p>
        </div>

        {/* Decorative stripes (logo motif) */}
        <div className="hero-stripes" aria-hidden="true">
          <div className="stripe s1"></div>
          <div className="stripe s2"></div>
          <div className="stripe s3"></div>
          <div className="stripe s4"></div>
        </div>
      </div>

      {/* RIGHT — Form */}
      <div className="login-form-wrap">
        <div className="login-form">
          <div className="login-welcome">로그인 — Welcome back</div>
          <div className="login-headline">기수와 본인 이름을 선택하세요</div>
          <div className="login-headline-sub">관리자 모드로 입장하면 전체 수강생 대시보드가 열립니다.</div>

          {/* 기수 탭 */}
          <div className="cohort-tabs">
            {window.getActiveCohortEntries().map(([id, c]) => (
              <button key={id}
                className={`cohort-tab ${cohortId === id ? 'active' : ''}`}
                onClick={() => { setCohortId(id); setSelectedName(null); }}>
                {c.label}
              </button>
            ))}
          </div>

          {noActiveCohort ? (
            <div className="empty" style={{ padding: 24 }}>
              <div className="big">📭</div>
              운영 중인 기수가 없습니다. 관리자에게 문의하세요.
            </div>
          ) : (
            <span className="track-pill">{cohort.track}</span>
          )}

          {/* 검색 */}
          <div className="student-search">
            <Icon.Search />
            <input className="input" placeholder="이름으로 검색"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* 학생 그리드 */}
          <div className="student-grid">
            {filtered.map(s => {
              const isSel = selectedName === s.name;
              const hasPw = window.STORE.hasStudentPassword(s.id);
              return (
                <button key={s.id}
                  className={`student-chip ${isSel ? 'selected' : ''} ${isSel && studentVerified ? 'verified' : ''}`}
                  onClick={() => pickStudent(s.name)}>
                  {s.name}
                  {!hasPw && <span className="chip-tag new">최초</span>}
                  {isSel && studentVerified && <span className="chip-tag ok">✓</span>}
                </button>
              );
            })}
            {filtered.length === 0 && isLoading && (
              <div className="empty" style={{ gridColumn: '1 / -1', padding: 24 }}>
                <div className="loading-spinner" aria-label="로딩 중"></div>
                <div style={{ marginTop: 12 }}>수강생 명단을 불러오는 중…</div>
              </div>
            )}
            {filtered.length === 0 && !isLoading && (
              <div className="empty" style={{ gridColumn: '1 / -1', padding: 24 }}>
                {search.trim() ? '검색 결과가 없습니다' : '등록된 수강생이 없습니다'}
              </div>
            )}
          </div>

          {/* 학생 비밀번호 게이트 */}
          {selectedName && studentPwMode !== 'idle' && (
            <div className="student-pw-card">
              <div className="student-pw-head">
                {studentPwMode === 'set' ? (
                  <>
                    <div className="student-pw-title">🔐 최초 로그인 — 비밀번호 설정</div>
                    <div className="student-pw-sub">{selectedName}님, 사용할 비밀번호를 설정하세요. 즉시 적용됩니다.</div>
                  </>
                ) : (
                  <>
                    <div className="student-pw-title">🔐 비밀번호 입력</div>
                    <div className="student-pw-sub">{selectedName}님, 비밀번호를 입력하세요.</div>
                  </>
                )}
              </div>
              <div className="student-pw-fields">
                <input
                  id="student-pw-input"
                  type="password"
                  className="input"
                  placeholder={studentPwMode === 'set' ? '새 비밀번호 (4자 이상)' : '비밀번호'}
                  value={studentPw}
                  onChange={e => { setStudentPw(e.target.value); setStudentPwError(''); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (studentPwMode === 'set') {
                        const next = document.getElementById('student-pw-input-2');
                        if (next) next.focus();
                        else submitStudentPw();
                      } else submitStudentPw();
                    }
                    if (e.key === 'Escape') cancelStudentPw();
                  }}
                  autoComplete="new-password"
                />
                {studentPwMode === 'set' && (
                  <input
                    id="student-pw-input-2"
                    type="password"
                    className="input"
                    placeholder="비밀번호 확인"
                    value={studentPw2}
                    onChange={e => { setStudentPw2(e.target.value); setStudentPwError(''); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') submitStudentPw();
                      if (e.key === 'Escape') cancelStudentPw();
                    }}
                    autoComplete="new-password"
                  />
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={cancelStudentPw}>취소</button>
                  <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={submitStudentPw}>
                    {studentPwMode === 'set' ? '설정하고 입장' : '확인'}
                  </button>
                </div>
                {studentPwError && <div className="admin-pw-error">⚠ {studentPwError}</div>}
              </div>
            </div>
          )}

          {/* 학생 인증 완료 표시 */}
          {selectedName && studentVerified && (
            <div className="student-verified-row">
              <span style={{ fontWeight: 700 }}>✓ {selectedName}</span>
              <span className="soft" style={{ fontSize: 12 }}>인증 완료. 아래 버튼으로 입장하세요</span>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={cancelStudentPw}>변경</button>
            </div>
          )}

          {/* 관리자 토글 + 비밀번호 게이트 */}
          <div className={`admin-toggle-row ${isAdmin ? 'verified' : ''} ${adminPrompt ? 'verifying' : ''}`}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                🎓 관리자 모드
                {isAdmin && (
                  <span className="pill" style={{ background: 'var(--alert-fresh-bg)', color: 'var(--alert-fresh)', fontSize: 10 }}>
                    ✓ 인증됨
                  </span>
                )}
              </div>
              <div className="soft" style={{ fontSize: 12 }}>
                {adminPrompt
                  ? '비밀번호를 입력하세요'
                  : isAdmin
                    ? '전체 수강생 대시보드 보기'
                    : '관리자 비밀번호로 인증 필요'}
              </div>
            </div>
            <button className={`toggle ${isAdmin ? 'on' : ''} ${adminPrompt ? 'pending' : ''}`}
              onClick={handleAdminToggle}
              aria-label="관리자 모드"></button>
          </div>

          {adminPrompt && (
            <div className="admin-pw-row">
              <Icon.Search style={{ visibility: 'hidden', width: 0 }} />
              <input
                id="admin-pw-input"
                type="password"
                className="input"
                placeholder="관리자 비밀번호 (4자리)"
                value={adminPw}
                onChange={e => { setAdminPw(e.target.value); setAdminError(''); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitAdminPw();
                  if (e.key === 'Escape') handleAdminToggle();
                }}
                maxLength={20}
                autoComplete="off"
                style={{
                  borderColor: adminError ? 'var(--alert-danger)' : undefined,
                  boxShadow: adminError ? '0 0 0 3px color-mix(in oklab, var(--alert-danger) 15%, transparent)' : undefined
                }}
              />
              <button className="btn btn-primary btn-sm" onClick={submitAdminPw}>확인</button>
              <button className="btn btn-ghost btn-sm" onClick={handleAdminToggle}>취소</button>
              {adminError && <div className="admin-pw-error">⚠ {adminError}</div>}
            </div>
          )}

          {/* 입장 */}
          <button className="btn btn-primary login-go"
            disabled={!canGo || inProgress}
            style={{ opacity: (canGo && !inProgress) ? 1 : 0.4, cursor: (canGo && !inProgress) ? 'pointer' : 'not-allowed' }}
            onClick={go}>
            {adminPrompt
              ? '비밀번호 입력 중…'
              : studentPwMode !== 'idle'
                ? (studentPwMode === 'set' ? '비밀번호 설정 중…' : '비밀번호 입력 중…')
                : isAdmin
                  ? '관리자로 입장 →'
                  : (selectedName && studentVerified ? `${selectedName} 입장 →` : '이름을 선택하세요')}
          </button>

          <div className="login-foot">
            {cohort ? `${students.length}명 · ${cohort.round} · ${window.getActiveCohortEntries().map(([, c]) => c.label).join(' / ')} 동시 운영` : '운영 중 기수 없음'}
          </div>
        </div>
      </div>
    </div>
  );
}

window.LoginScreen = LoginScreen;
