/* ==========================================================================
   admin-manage.jsx — 관리자 데이터 관리
   - AdminManageButton: 헤더 우측 ⚙ 버튼
   - AdminManageDrawer: 수강생 추가/편집/삭제, KPI 목표, 데이터 초기화
   ========================================================================== */

function AdminManageButton({ cohortId, kpiTarget, onChangeKpi, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)} title="관리 메뉴">
        ⚙️ 관리
      </button>
      {open && <AdminManageDrawer
        cohortId={cohortId}
        kpiTarget={kpiTarget}
        onChangeKpi={onChangeKpi}
        onClose={() => setOpen(false)}
        onChange={onChange}
      />}
    </>
  );
}

function AdminManageDrawer({ cohortId, kpiTarget, onChangeKpi, onClose, onChange }) {
  const [tab, setTab] = useState('students'); // students | kpi | settings | data
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [addCohort, setAddCohort] = useState(cohortId);
  const [showAdd, setShowAdd] = useState(false);
  const [_, force] = useState(0);

  const allStudents = useMemo(() => {
    const list = window.STORE.listStudents();
    return list.filter(s => !search.trim() || s.name.includes(search.trim()));
  }, [search, _]);

  function refresh() { force(x => x + 1); onChange && onChange(); }

  function handleDelete(s) {
    if (!confirm(`${s.name}을 삭제하시겠어요?\n관련된 일일 보고, 공고, 코멘트, 출석도 모두 삭제됩니다.`)) return;
    window.STORE.deleteStudent(s.id);
    refresh();
  }

  return (
    <>
      <div className="drawer-overlay" onClick={onClose}></div>
      <div className="drawer" style={{ width: 680 }}>
        <div className="drawer-head">
          <div>
            <div className="h2" style={{ margin: 0 }}>⚙️ 관리</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>수강생·기수·KPI 등 운영 데이터 편집</div>
          </div>
          <button className="drawer-close" onClick={onClose}><Icon.X /></button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', padding: '0 16px', overflowX: 'auto' }}>
          {[
            { k: 'students', label: '👥 수강생' },
            { k: 'cohorts', label: '🗂️ 기수' },
            { k: 'kpi', label: '🎯 KPI 목표' },
            { k: 'settings', label: '🔌 동기화' },
            { k: 'data', label: '💾 데이터' }
          ].map(t => (
            <button key={t.k} className={`tab ${tab === t.k ? 'active' : ''}`} style={{ padding: '12px 14px', fontSize: 13 }}
              onClick={() => setTab(t.k)}>{t.label}</button>
          ))}
        </div>

        <div className="drawer-body">
          {tab === 'students' && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                <div className="student-search" style={{ flex: 1, marginBottom: 0 }}>
                  <Icon.Search />
                  <input className="input" placeholder="이름으로 검색"
                    value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => { setShowAdd(true); setAddCohort(cohortId); }}>
                  <Icon.Plus /> 수강생 추가
                </button>
              </div>

              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                총 {allStudents.length}명 · 클릭하여 편집
              </div>

              <div className="manage-list">
                {allStudents.map(s => (
                  <ManageStudentRow key={s.id}
                    student={s}
                    editing={editingId === s.id}
                    onEdit={() => setEditingId(editingId === s.id ? null : s.id)}
                    onSave={() => { setEditingId(null); refresh(); }}
                    onDelete={() => handleDelete(s)}
                  />
                ))}
              </div>

              {showAdd && (
                <AddStudentModal
                  defaultCohort={addCohort}
                  onAdd={(payload) => { window.STORE.addStudent(payload.cohort, payload); setShowAdd(false); refresh(); }}
                  onClose={() => setShowAdd(false)}
                />
              )}
            </>
          )}

          {tab === 'cohorts' && (
            <CohortsManagement onChange={refresh} />
          )}

          {tab === 'kpi' && (
            <KpiSettings cohortId={cohortId} kpiTarget={kpiTarget} onChangeKpi={onChangeKpi} />
          )}

          {tab === 'settings' && (
            <SyncSettings />
          )}

          {tab === 'data' && (
            <DataManagement onReset={() => { onClose(); }} />
          )}
        </div>
      </div>
    </>
  );
}

/* ----------- ManageStudentRow ----------- */
function ManageStudentRow({ student, editing, onEdit, onSave, onDelete }) {
  const [draft, setDraft] = useState(student);
  useEffect(() => { setDraft(student); }, [student.id, editing]);

  function save() {
    window.STORE.updateStudent(student.id, draft);
    onSave();
  }

  const cohortMeta = window.STUDENT_ROSTER[student.cohort];

  if (!editing) {
    return (
      <div className="manage-row" onClick={onEdit}>
        <Avatar name={student.name} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {student.name}
            {student.grade && <span className="pill" style={{ marginLeft: 6, background: 'var(--brand-primary-soft)', color: 'var(--brand-primary-deep)', fontSize: 10 }}>{student.grade}</span>}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {cohortMeta?.label || student.cohort} · {student.email || '—'} · {student.phone || '—'}
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
          <Icon.Edit /> 편집
        </button>
        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="삭제">
          <Icon.Trash style={{ color: 'var(--alert-danger)' }} />
        </button>
      </div>
    );
  }

  return (
    <div className="manage-row editing">
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <Avatar name={draft.name || '?'} size={40} />
        <div>
          <input className="input" style={{ fontWeight: 700, fontSize: 15 }}
            placeholder="이름"
            value={draft.name}
            onChange={e => setDraft({ ...draft, name: e.target.value })} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div className="field-label">기수</div>
          <select className="select" value={draft.cohort} onChange={e => setDraft({ ...draft, cohort: e.target.value })}>
            {window.getActiveCohortEntries().map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <div className="field-label">나이</div>
          <input type="number" className="input" value={draft.age || ''} onChange={e => setDraft({ ...draft, age: parseInt(e.target.value) || null })} />
        </div>
        <div>
          <div className="field-label">성별</div>
          <select className="select" value={draft.gender} onChange={e => setDraft({ ...draft, gender: e.target.value })}>
            <option value="M">남</option>
            <option value="F">여</option>
          </select>
        </div>
        <div>
          <div className="field-label">전화번호</div>
          <input className="input" value={draft.phone || ''} onChange={e => setDraft({ ...draft, phone: e.target.value })} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="field-label">이메일</div>
          <input className="input" value={draft.email || ''} onChange={e => setDraft({ ...draft, email: e.target.value })} />
        </div>
        <div>
          <div className="field-label">주소</div>
          <input className="input" value={draft.addr1 || ''} onChange={e => setDraft({ ...draft, addr1: e.target.value })} placeholder="시/도" />
        </div>
        <div>
          <div className="field-label">상세 주소</div>
          <input className="input" value={draft.addr2 || ''} onChange={e => setDraft({ ...draft, addr2: e.target.value })} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="field-label">전공 / 학력</div>
          <input className="input" value={draft.education || ''} onChange={e => setDraft({ ...draft, education: e.target.value })} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={onSave}>취소</button>
        <button className="btn btn-primary btn-sm" onClick={save} style={{ marginLeft: 'auto' }}>저장</button>
      </div>
    </div>
  );
}

/* ----------- AddStudentModal ----------- */
function AddStudentModal({ defaultCohort, onAdd, onClose }) {
  const [form, setForm] = useState({
    cohort: defaultCohort,
    name: '', age: '', gender: 'M', phone: '', email: '',
    addr1: '', addr2: '', education: ''
  });
  function update(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function submit() {
    if (!form.name.trim()) { alert('이름은 필수입니다'); return; }
    onAdd({ ...form, age: parseInt(form.age) || null });
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="drawer-head">
          <div>
            <div className="h2" style={{ margin: 0 }}>👤 수강생 추가</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>새 수강생을 등록합니다</div>
          </div>
          <button className="drawer-close" onClick={onClose}><Icon.X /></button>
        </div>
        <div className="drawer-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="field-label">기수 *</div>
            <select className="select" value={form.cohort} onChange={e => update('cohort', e.target.value)}>
              {window.getActiveCohortEntries().map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="field-label">이름 *</div>
            <input className="input" autoFocus value={form.name} onChange={e => update('name', e.target.value)} placeholder="이름" />
          </div>
          <div>
            <div className="field-label">나이</div>
            <input type="number" className="input" value={form.age} onChange={e => update('age', e.target.value)} />
          </div>
          <div>
            <div className="field-label">성별</div>
            <select className="select" value={form.gender} onChange={e => update('gender', e.target.value)}>
              <option value="M">남</option>
              <option value="F">여</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="field-label">전화번호</div>
            <input className="input" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="010-0000-0000" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="field-label">이메일</div>
            <input className="input" value={form.email} onChange={e => update('email', e.target.value)} placeholder="example@gmail.com" />
          </div>
          <div>
            <div className="field-label">주소 (시/도)</div>
            <input className="input" value={form.addr1} onChange={e => update('addr1', e.target.value)} />
          </div>
          <div>
            <div className="field-label">주소 (상세)</div>
            <input className="input" value={form.addr2} onChange={e => update('addr2', e.target.value)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="field-label">전공 / 학력</div>
            <input className="input" value={form.education} onChange={e => update('education', e.target.value)} placeholder="대학교/학과" />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>취소</button>
            <button className="btn btn-primary" onClick={submit} style={{ flex: 1 }}>
              <Icon.Plus /> 등록
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------- KpiSettings ----------- */
function KpiSettings({ cohortId, kpiTarget, onChangeKpi }) {
  const [val, setVal] = useState(Math.round(kpiTarget * 100));
  const stats = window.STORE.getEmploymentStats(cohortId);

  return (
    <div>
      <div className="field-label">🎯 목표 취업률 (KPI)</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        대시보드의 KPI 대비 달성률 계산 기준입니다. 모수에서 제외된 수강생은 자동 빠집니다.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <input type="range" min="10" max="100" step="5" value={val}
          onChange={e => { const v = parseInt(e.target.value); setVal(v); onChangeKpi(v / 100); }}
          style={{ flex: 1, accentColor: 'var(--brand-primary)' }} />
        <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand-primary)', minWidth: 60, textAlign: 'right' }}>{val}%</span>
      </div>
      <div style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📊 현재 ({window.STUDENT_ROSTER[cohortId].label})</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, fontSize: 13 }}>
          <div><span className="muted">모수</span> <b>{stats.pool_size}명</b></div>
          <div><span className="muted">취업</span> <b>{stats.employed_count}명</b></div>
          <div><span className="muted">취업률</span> <b>{Math.round(stats.employment_rate * 100)}%</b></div>
        </div>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          목표 인원: <b>{Math.ceil(stats.pool_size * (val / 100))}명</b> ({val}%)
        </div>
      </div>
    </div>
  );
}

/* ----------- SyncSettings — 다중 모드(GitHub Gist / Supabase / localStorage) ----------- */
function SyncSettings() {
  const mode = window.STORE_MODE || 'local';
  const [provider, setProvider] = useState(
    mode === 'gist' ? 'gist' : mode === 'supabase' ? 'supabase' : 'gist'
  );

  return (
    <div>
      <div style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 'var(--r-md)', border: '1px solid var(--line)', marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>현재 모드</div>
        <div>
          <span className="pill" style={{
            background: (mode === 'supabase' || mode === 'gist') ? 'var(--alert-fresh-bg)' : 'var(--bg-2)',
            color: (mode === 'supabase' || mode === 'gist') ? 'var(--alert-fresh)' : 'var(--ink-mute)',
            fontSize: 12, padding: '4px 12px'
          }}>
            {mode === 'supabase' ? '🟢 Supabase' : mode === 'gist' ? '🟣 GitHub Gist' : '⚪ localStorage (단일 기기)'}
          </span>
        </div>
        {mode === 'local' && (
          <div className="muted" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
            ⚠ 현재 데이터는 이 브라우저에만 저장됩니다. 어디서나 같은 데이터를 보려면 아래 동기화 옵션 중 하나를 활성화하세요.
          </div>
        )}
      </div>

      {/* 제공자 탭 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, padding: 4, background: 'var(--surface-2)', borderRadius: 'var(--r-md)' }}>
        <button
          className={`btn btn-sm ${provider === 'gist' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ flex: 1 }}
          onClick={() => setProvider('gist')}>
          🟣 GitHub Gist (간편)
        </button>
        <button
          className={`btn btn-sm ${provider === 'supabase' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ flex: 1 }}
          onClick={() => setProvider('supabase')}>
          🟢 Supabase (실시간)
        </button>
      </div>

      {provider === 'gist' ? <GistSettingsForm /> : <SupabaseSettingsForm />}
    </div>
  );
}

function GistSettingsForm() {
  const mode = window.STORE_MODE || 'local';
  const cfg = window.getGistConfig?.() || {};
  const [token, setToken] = useState(cfg.token || '');
  const [gistId, setGistId] = useState(cfg.gistId || '');
  const [busy, setBusy] = useState(false);

  async function createGist() {
    if (!token.trim()) { alert('Personal Access Token을 입력하세요'); return; }
    setBusy(true);
    try {
      const id = await window.createGistForSync(token.trim(), false);
      setGistId(id);
      alert('Gist 생성됨: ' + id + '\n\n저장 후 적용 버튼을 눌러 동기화를 시작하세요.');
    } catch (e) {
      alert('생성 실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  function applyAndReload() {
    if (!token.trim() || !gistId.trim()) { alert('Token과 Gist ID를 모두 입력하세요'); return; }
    window.setGistConfig({ token: token.trim(), gistId: gistId.trim() });
    if (confirm('동기화 설정이 저장되었습니다. 지금 새로고침하여 적용할까요?')) {
      location.reload();
    }
  }
  function disconnect() {
    if (!confirm('Gist 동기화를 해제하고 localStorage 모드로 돌아갈까요? (로컬 데이터는 유지)')) return;
    window.setGistConfig(null);
    location.reload();
  }
  async function forceSync() {
    if (mode !== 'gist') { alert('먼저 [저장 후 적용]을 눌러 활성화하세요'); return; }
    try {
      setBusy(true);
      await window.STORE.forceSync();
      alert('동기화 완료');
    } catch (e) {
      alert('실패: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{
        padding: 12, marginBottom: 14,
        background: 'var(--alert-warn-bg)',
        border: '1px solid color-mix(in oklab, var(--alert-warn) 30%, var(--line))',
        borderRadius: 'var(--r-sm)', fontSize: 12, lineHeight: 1.6
      }}>
        💡 <b>작동 방식</b>: 데이터(JSON)를 비공개 GitHub Gist에 저장. 30초 폴링 + 변경 시 즉시 푸시.<br/>
        ⚠ <b>보안</b>: PAT가 이 브라우저에 저장됩니다. <b>공용 PC에서는 사용하지 마세요.</b><br/>
        🔒 PAT 권한은 <code>gist</code> 스코프 1개만 필요합니다.
      </div>

      <div className="field-label">Personal Access Token (gist scope)</div>
      <input className="input" value={token} onChange={e => setToken(e.target.value)}
        placeholder="github_pat_..." type="password"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 6 }} />
      <div className="muted" style={{ fontSize: 11, marginBottom: 12 }}>
        <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener" style={{ color: 'var(--brand-primary)' }}>
          GitHub에서 토큰 발급 →
        </a> (Fine-grained PAT, Gists Read+Write)
      </div>

      <div className="field-label">Gist ID</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input className="input" value={gistId} onChange={e => setGistId(e.target.value)}
          placeholder="abc123def456..." style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
        <button className="btn btn-secondary btn-sm" onClick={createGist} disabled={busy || !token.trim()}>
          {busy ? '...' : '+ 새 Gist 생성'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" onClick={applyAndReload}>저장 후 적용</button>
        {mode === 'gist' && (
          <>
            <button className="btn btn-secondary btn-sm" onClick={forceSync} disabled={busy}>
              {busy ? '동기화중...' : '🔄 강제 동기화'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={disconnect} style={{ color: 'var(--alert-danger)' }}>
              연결 해제
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SupabaseSettingsForm() {
  const mode = window.STORE_MODE || 'local';
  const cfg = window.getSupabaseConfig?.();
  const [url, setUrl] = useState(cfg?.url || '');
  const [key, setKey] = useState(cfg?.anonKey || '');

  return (
    <div>
      <div className="field-label">Supabase Project URL</div>
      <input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://xxx.supabase.co" style={{ marginBottom: 12 }} />

      <div className="field-label">Anon Key</div>
      <input className="input" value={key} onChange={e => setKey(e.target.value)} placeholder="eyJhbGc..." type="password" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 14 }} />

      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-primary btn-sm" onClick={() => {
          if (!url || !key) { alert('URL과 Key를 모두 입력하세요'); return; }
          window.setSupabaseConfig({ url, anonKey: key });
          if (confirm('저장되었습니다. 새로고침하여 적용할까요?')) location.reload();
        }}>저장 후 적용</button>
        {mode === 'supabase' && (
          <button className="btn btn-secondary btn-sm" onClick={() => {
            if (confirm('연결을 해제하고 localStorage 모드로 돌아갈까요?')) {
              window.setSupabaseConfig(null);
              location.reload();
            }
          }}>연결 해제</button>
        )}
      </div>

      <div className="muted" style={{ fontSize: 11, marginTop: 14 }}>
        📄 supabase-schema.sql 파일을 Supabase SQL Editor에서 실행한 뒤 활성화하세요.
      </div>
    </div>
  );
}

/* ----------- DataManagement ----------- */
function DataManagement({ onReset }) {
  function exportJSON() {
    const data = {
      students: window.STORE.listStudents(),
      timestamp: new Date().toISOString()
    };
    window.STORE.listCohorts({ includeArchived: true }).forEach(({ id: c }) => {
      data['reports_' + c] = window.STORE.listStudents(c).flatMap(s =>
        window.STORE.listReports(s.id).map(r => ({ ...r, student_name: s.name }))
      );
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `develocket-backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div className="field-label">📥 백업 / 내보내기</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>전체 수강생 + 일일 보고를 JSON 파일로 다운로드합니다.</div>
        <button className="btn btn-secondary btn-sm" onClick={exportJSON}>📄 JSON으로 내보내기</button>
      </div>

      <div style={{ padding: 14, background: 'var(--alert-danger-bg)', borderRadius: 'var(--r-md)', border: '1px solid color-mix(in oklab, var(--alert-danger) 30%, var(--line))' }}>
        <div style={{ fontWeight: 700, color: 'var(--alert-danger)', marginBottom: 4 }}>⚠️ 데이터 초기화</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          모든 데이터를 삭제하고 시드 데이터로 되돌립니다. 되돌릴 수 없습니다.
        </div>
        <button className="btn btn-sm" style={{ background: 'var(--alert-danger)', color: 'white' }}
          onClick={() => {
            if (confirm('정말 모든 데이터를 초기화할까요? 되돌릴 수 없습니다.')) {
              window.STORE.resetAll();
              onReset();
              location.reload();
            }
          }}>전체 초기화</button>
      </div>
    </div>
  );
}

/* ----------- CohortsManagement — 기수 활성/아카이브/신규 추가 ----------- */
function CohortsManagement({ onChange }) {
  const [showAdd, setShowAdd] = useState(false);
  const [_, force] = useState(0);

  function refresh() { force(x => x + 1); onChange && onChange(); }

  const active = window.STORE.listCohorts({ includeArchived: false });
  const archived = window.STORE.listCohorts({ onlyArchived: true });

  function handleArchive(c) {
    const studentCount = c.studentCount;
    if (!confirm(
      `${c.label}를 종료(아카이브)하시겠어요?\n` +
      `\n` +
      `· 수강생 ${studentCount}명과 보고/공고/코멘트는 보존되지만 로그인·관리자 화면에 더 이상 노출되지 않습니다.\n` +
      `· 언제든 [아카이브된 기수] 목록에서 복구할 수 있습니다.`
    )) return;
    window.STORE.archiveCohort(c.id);
    refresh();
  }

  function handleRestore(c) {
    if (!confirm(`${c.label}를 복구하시겠어요? 모든 화면에 다시 노출됩니다.`)) return;
    window.STORE.restoreCohort(c.id);
    refresh();
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div className="field-label" style={{ marginBottom: 4 }}>🗂️ 기수 관리</div>
          <div className="muted" style={{ fontSize: 12 }}>운영 중 기수 종료, 신규 기수 추가, 아카이브된 기수 복구</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <Icon.Plus /> 신규 기수
        </button>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>🟢 운영 중 ({active.length})</div>
        {active.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--r-md)' }}>
            운영 중인 기수가 없습니다. 우상단 [신규 기수] 버튼으로 추가하세요.
          </div>
        ) : (
          <div className="manage-list">
            {active.map(c => (
              <CohortRow key={c.id} cohort={c}
                onArchive={() => handleArchive(c)}
                onUpdate={refresh} />
            ))}
          </div>
        )}
      </div>

      {archived.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="field-label" style={{ marginBottom: 6 }}>📦 아카이브 ({archived.length})</div>
          <div className="manage-list">
            {archived.map(c => (
              <CohortRow key={c.id} cohort={c} archived
                onRestore={() => handleRestore(c)}
                onUpdate={refresh} />
            ))}
          </div>
        </div>
      )}

      {showAdd && (
        <AddCohortModal
          onAdd={(payload) => {
            try {
              window.STORE.createCohort(payload);
              setShowAdd(false);
              refresh();
            } catch (e) {
              alert(e.message || '추가 실패');
            }
          }}
          onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
}

function CohortRow({ cohort, archived, onArchive, onRestore, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    label: cohort.label,
    track: cohort.track,
    round: cohort.round,
    color: cohort.color
  });

  function save() {
    window.STORE.updateCohort(cohort.id, draft);
    setEditing(false);
    onUpdate();
  }

  if (!editing) {
    return (
      <div className="manage-row" style={{ alignItems: 'flex-start', opacity: archived ? 0.7 : 1 }}>
        <div style={{
          width: 12, height: 12, borderRadius: 4, marginTop: 4,
          background: cohort.color || '#7C5CFF',
          boxShadow: '0 0 0 3px color-mix(in oklab, ' + (cohort.color || '#7C5CFF') + ' 18%, transparent)'
        }}></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            {cohort.label}
            {archived && <span className="pill" style={{ background: 'var(--bg-2)', color: 'var(--ink-mute)', fontSize: 10 }}>아카이브</span>}
            {cohort.custom && <span className="pill" style={{ background: 'var(--brand-primary-soft)', color: 'var(--brand-primary-deep)', fontSize: 10 }}>신규</span>}
            <span className="pill" style={{ background: 'var(--surface-2)', color: 'var(--ink-soft)', fontSize: 10 }}>{cohort.id}</span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {cohort.track || '—'} · {cohort.round || '—'} · 수강생 <b>{cohort.studentCount}</b>명
          </div>
        </div>
        {!archived && (
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} title="기수 정보 수정">
            <Icon.Edit /> 편집
          </button>
        )}
        {!archived ? (
          <button className="btn btn-ghost btn-sm" onClick={onArchive} title="기수 종료(아카이브)" style={{ color: 'var(--alert-danger)' }}>
            🗂️ 종료
          </button>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={onRestore} title="복구">
            ↺ 복구
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="manage-row editing">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="field-label">기수명</div>
          <input className="input" value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="field-label">트랙(과정명)</div>
          <input className="input" value={draft.track} onChange={e => setDraft({ ...draft, track: e.target.value })} />
        </div>
        <div>
          <div className="field-label">회차</div>
          <input className="input" value={draft.round} onChange={e => setDraft({ ...draft, round: e.target.value })} />
        </div>
        <div>
          <div className="field-label">대표 색상</div>
          <input className="input" type="color" value={draft.color}
            onChange={e => setDraft({ ...draft, color: e.target.value })}
            style={{ padding: 4, height: 36 }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>취소</button>
        <button className="btn btn-primary btn-sm" onClick={save} style={{ marginLeft: 'auto' }}>저장</button>
      </div>
    </div>
  );
}

/* ----------- AddCohortModal ----------- */
function AddCohortModal({ onAdd, onClose }) {
  const [form, setForm] = useState({
    id: '',
    label: '',
    track: '',
    round: '1회차',
    color: '#7C5CFF'
  });
  function up(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function submit() {
    if (!form.id.trim()) { alert('기수 ID는 필수입니다 (예: 기획4기)'); return; }
    if (!form.label.trim()) { alert('기수명은 필수입니다'); return; }
    onAdd(form);
  }
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="drawer-head">
          <div>
            <div className="h2" style={{ margin: 0 }}>🗂️ 신규 기수 추가</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>새 기수를 등록합니다. 이후 [수강생] 탭에서 학생을 추가하세요.</div>
          </div>
          <button className="drawer-close" onClick={onClose}><Icon.X /></button>
        </div>
        <div className="drawer-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="field-label">기수 ID *</div>
            <input className="input" autoFocus value={form.id}
              onChange={e => up('id', e.target.value)}
              placeholder="예: 기획4기, 프로그램4기" />
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>고유 식별자. 변경 불가하므로 신중하게 입력하세요.</div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="field-label">기수명 (표시명) *</div>
            <input className="input" value={form.label}
              onChange={e => up('label', e.target.value)}
              placeholder="예: 기획 4기" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="field-label">트랙(과정명)</div>
            <input className="input" value={form.track}
              onChange={e => up('track', e.target.value)}
              placeholder="예: 생성형 AI를 활용한 게임 기획자 과정" />
          </div>
          <div>
            <div className="field-label">회차</div>
            <input className="input" value={form.round}
              onChange={e => up('round', e.target.value)} placeholder="4회차" />
          </div>
          <div>
            <div className="field-label">대표 색상</div>
            <input type="color" className="input" value={form.color}
              onChange={e => up('color', e.target.value)}
              style={{ padding: 4, height: 36 }} />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>취소</button>
            <button className="btn btn-primary" onClick={submit} style={{ flex: 1 }}>
              <Icon.Plus /> 등록
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  AdminManageButton, AdminManageDrawer, CohortsManagement, AddCohortModal,
  SyncSettings, GistSettingsForm, SupabaseSettingsForm
});
