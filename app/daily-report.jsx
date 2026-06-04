/* ==========================================================================
   일일 보고 탭
   - 오늘 작성 / 수정
   - 주간 목표 (매일 함께 보이고 수정 가능)
   - 일일 목표 (오늘 한 일 / 내일 할 일 / 막힌 부분, 모두 마크다운)
   - 진행상태 (시작전/진행중/완료/막힘)
   - 기분, 첨부(링크/이미지URL)
   - 히스토리 (오른쪽)
   ========================================================================== */
function DailyReportTab({ student }) {
  const todayStr = window.STORE_HELPERS.todayStr;
  const today = todayStr();

  const [draft, setDraft] = useState(null);
  const [history, setHistory] = useState([]);
  const [savedHint, setSavedHint] = useState(false);
  const [submitFlash, setSubmitFlash] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [driveLink, setDriveLink] = useState('');
  const [driveDraft, setDriveDraft] = useState('');
  const [driveEdit, setDriveEdit] = useState(false);
  const [driveFlash, setDriveFlash] = useState(false);
  const saveTimer = useRef(null);

  // load draft (today's report or new shell)
  useEffect(() => {
    const existing = window.STORE.getTodayReport(student.id);
    const goals = window.STORE.getWeeklyGoalsContext(student.id);
    setDraft(existing || {
      student_id: student.id,
      date: today,
      mood: 4,
      today_done: '',
      tomorrow_plan: '',
      blockers: '',
      weekly_goals: goals.length ? goals : [
        { id: window.STORE_HELPERS.uid('wg'), text: '', status: 'not-started' }
      ],
      status: 'in-progress',
      attachments: []
    });
    setHistory(window.STORE.listReports(student.id).filter(r => r.date !== today));
    const cur = window.STORE.getStudent(student.id);
    const link = (cur && cur.drive_link) || student.drive_link || '';
    setDriveLink(link);
    setDriveDraft(link);
    setDriveEdit(!link);
  }, [student.id, today]);

  function save(patch) {
    const next = { ...draft, ...patch };
    setDraft(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      window.STORE.upsertReport(student.id, next);
      setSavedHint(true);
      setTimeout(() => setSavedHint(false), 1500);
    }, 350);
  }
  function saveNow(patch) {
    const next = { ...draft, ...patch };
    setDraft(next);
    window.STORE.upsertReport(student.id, next);
    setSavedHint(true);
    setTimeout(() => setSavedHint(false), 1500);
  }

  /* ---- required-field validation ---- */
  function getErrors(d) {
    const errs = {};
    if (!d) return errs;
    if (!(d.today_done || '').trim()) errs.today_done = '오늘 한 일은 필수 입력입니다';
    if (!(d.tomorrow_plan || '').trim()) errs.tomorrow_plan = '내일 할 일은 필수 입력입니다';
    return errs;
  }
  function submit() {
    const errs = getErrors(draft);
    if (Object.keys(errs).length) {
      setShowErrors(true);
      // scroll to first error
      const id = errs.today_done ? 'fld-today-done' : 'fld-tomorrow-plan';
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    window.STORE.upsertReport(student.id, draft);
    setSubmitFlash(true);
    setShowErrors(false);
    setTimeout(() => setSubmitFlash(false), 2000);
  }

  /* ---- drive link ---- */
  function saveDrive() {
    const v = driveDraft.trim();
    if (v && !/^https?:\/\//i.test(v)) {
      alert('http:// 또는 https:// 로 시작하는 URL을 입력하세요');
      return;
    }
    window.STORE.updateStudentFields(student.id, { drive_link: v });
    setDriveLink(v);
    setDriveEdit(false);
    setDriveFlash(true);
    setTimeout(() => setDriveFlash(false), 1200);
  }
  function clearDrive() {
    if (!confirm('드라이브 링크를 제거할까요?')) return;
    window.STORE.updateStudentFields(student.id, { drive_link: '' });
    setDriveLink('');
    setDriveDraft('');
    setDriveEdit(true);
  }

  if (!draft) return null;

  /* ---- weekly goals helpers ---- */
  function addGoal() {
    saveNow({ weekly_goals: [...draft.weekly_goals, { id: window.STORE_HELPERS.uid('wg'), text: '', status: 'not-started' }] });
  }
  function updateGoal(id, patch) {
    saveNow({ weekly_goals: draft.weekly_goals.map(g => g.id === id ? { ...g, ...patch } : g) });
  }
  function removeGoal(id) {
    saveNow({ weekly_goals: draft.weekly_goals.filter(g => g.id !== id) });
  }

  /* ---- attachments ---- */
  function addAttachment() {
    const url = linkUrl.trim();
    if (!url) return;
    const att = {
      type: /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(url) ? 'image' : 'link',
      url,
      label: linkLabel.trim() || url
    };
    saveNow({ attachments: [...(draft.attachments || []), att] });
    setLinkUrl(''); setLinkLabel('');
  }
  function removeAttachment(i) {
    saveNow({ attachments: draft.attachments.filter((_, idx) => idx !== i) });
  }

  const doneCount = (draft.weekly_goals || []).filter(g => g.status === 'done').length;
  const weeklyPct = draft.weekly_goals.length ? Math.round(doneCount / draft.weekly_goals.length * 100) : 0;
  const errors = getErrors(draft);
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="float-in">
      {/* Header strip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>📝 오늘의 보고</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {today} · 자동 저장 활성 {savedHint && <span style={{ color: 'var(--alert-fresh)', fontWeight: 600 }}>✓ 자동저장됨</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="pill" style={{ background: 'var(--brand-primary-soft)', color: 'var(--brand-primary-deep)' }}>
            {(window.STUDENT_ROSTER[student.cohort] && window.STUDENT_ROSTER[student.cohort].label) || student.cohort}
          </span>
          <StatusPill status={draft.status} />
          <button className="btn btn-primary"
            onClick={submit}
            disabled={hasErrors}
            style={{
              padding: '8px 18px',
              opacity: hasErrors ? 0.5 : 1,
              cursor: hasErrors ? 'not-allowed' : 'pointer'
            }}
            title={hasErrors ? '필수 항목을 모두 입력하세요' : '보고 제출'}>
            💾 저장 {submitFlash && '✓'}
          </button>
        </div>
      </div>

      {/* 📁 드라이브 링크 핀 (고정) */}
      <div className="drive-pin">
        <span className="drive-pin-icon">📁</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="drive-pin-label">
            내 작업 드라이브
            {driveFlash && <span className="pill" style={{ marginLeft: 8, background: 'var(--alert-fresh-bg)', color: 'var(--alert-fresh)', fontSize: 10 }}>✓ 저장됨</span>}
          </div>
          {!driveEdit && driveLink ? (
            <a href={safeHref(driveLink)} target="_blank" rel="noopener" className="drive-pin-url">
              {driveLink} <Icon.External />
            </a>
          ) : (
            <input
              className="input"
              type="url"
              placeholder="https://drive.google.com/drive/folders/..."
              value={driveDraft}
              onChange={e => setDriveDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveDrive(); }}
              style={{ marginTop: 4 }}
            />
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!driveEdit ? (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setDriveEdit(true)}>
                <Icon.Edit /> 수정
              </button>
              {driveLink && (
                <button className="btn btn-ghost btn-sm" onClick={clearDrive} title="링크 제거">
                  <Icon.Trash />
                </button>
              )}
            </>
          ) : (
            <>
              {driveLink && (
                <button className="btn btn-ghost btn-sm"
                  onClick={() => { setDriveDraft(driveLink); setDriveEdit(false); }}>
                  취소
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={saveDrive}>저장</button>
            </>
          )}
        </div>
      </div>

      <CareerPrefCard student={student} />

      <div className="daily-grid">
        {/* LEFT: 작성 */}
        <div>
          {/* 주간 목표 */}
          <div className="card report-card">
            <div className="section-title">
              <span className="dot" style={{ background: 'var(--brand-accent)' }}></span>
              📅 이번 주 목표
              <small>· 매일 함께 보이고 수정 가능</small>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="mono soft" style={{ fontSize: 12 }}>{doneCount}/{draft.weekly_goals.length}</span>
                <span style={{ minWidth: 120 }}><ProgressBar value={weeklyPct} /></span>
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {draft.weekly_goals.map((g, i) => (
                <div key={g.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <button
                    className={`goal-check ${g.status}`}
                    onClick={() => {
                      const next = g.status === 'done' ? 'not-started'
                        : g.status === 'in-progress' ? 'done'
                        : 'in-progress';
                      updateGoal(g.id, { status: next });
                    }}
                    title="클릭으로 상태 전환"
                  >
                    {g.status === 'done' ? '✓' : g.status === 'in-progress' ? '◐' : g.status === 'blocked' ? '!' : '○'}
                  </button>
                  <input className="input"
                    style={{ padding: '8px 12px', flex: 1, textDecoration: g.status === 'done' ? 'line-through' : 'none', color: g.status === 'done' ? 'var(--ink-mute)' : 'inherit' }}
                    value={g.text}
                    placeholder={`주간 목표 ${i + 1}`}
                    onChange={e => updateGoal(g.id, { text: e.target.value })}
                  />
                  <select className="select" style={{ width: 110, padding: '8px 10px' }}
                    value={g.status}
                    onChange={e => updateGoal(g.id, { status: e.target.value })}>
                    <option value="not-started">시작전</option>
                    <option value="in-progress">진행중</option>
                    <option value="done">완료</option>
                    <option value="blocked">막힘</option>
                  </select>
                  <button className="btn btn-ghost btn-icon" onClick={() => removeGoal(g.id)}>
                    <Icon.Trash />
                  </button>
                </div>
              ))}
              <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={addGoal}>
                <Icon.Plus /> 주간 목표 추가
              </button>
            </div>
          </div>

          {/* 일일 보고 본문 */}
          <div className="card report-card">
            <div className="section-title">
              <span className="dot"></span>
              ✏️ 일일 보고
            </div>

            <div className="field-block">
              <div className="field-label">🌤️ 오늘의 컨디션</div>
              <MoodPicker value={draft.mood} onChange={v => saveNow({ mood: v })} />
            </div>

            <div className="field-block">
              <div className="field-label">📊 진행 상태 <span className="hint">(전체 작업)</span></div>
              <StatusPicker value={draft.status} onChange={v => saveNow({ status: v })} />
            </div>

            <div id="fld-today-done"
              className={`field-block ${showErrors && errors.today_done ? 'has-error' : ''}`}>
              <div className="field-label">
                ✅ 오늘 한 일 (회고)
                <span className="required-mark" aria-hidden="true">*</span>
                <span className="hint">필수</span>
              </div>
              <MarkdownEditor
                value={draft.today_done}
                onChange={v => save({ today_done: v })}
                placeholder="오늘 한 일과 배운 점을 적어주세요. 마크다운을 사용할 수 있어요.

예시:
### 학습
- React Hooks 복습
- **useEffect** 의존성 배열 정리

### 작업
- 포트폴리오 페이지 1차 완성"
                rows={6}
              />
              {showErrors && errors.today_done && (
                <div className="field-error">⚠ {errors.today_done}</div>
              )}
            </div>

            <div id="fld-tomorrow-plan"
              className={`field-block ${showErrors && errors.tomorrow_plan ? 'has-error' : ''}`}>
              <div className="field-label">
                🎯 내일 할 일
                <span className="required-mark" aria-hidden="true">*</span>
                <span className="hint">필수</span>
              </div>
              <MarkdownEditor
                value={draft.tomorrow_plan}
                onChange={v => save({ tomorrow_plan: v })}
                placeholder="내일의 우선순위와 계획을 적어주세요"
                rows={4}
              />
              {showErrors && errors.tomorrow_plan && (
                <div className="field-error">⚠ {errors.tomorrow_plan}</div>
              )}
            </div>

            <div className="field-block">
              <div className="field-label">🚧 막힌 부분 / 도움 요청 <span className="hint">(있을 때만)</span></div>
              <MarkdownEditor
                value={draft.blockers}
                onChange={v => save({ blockers: v })}
                placeholder="멘토 / 동료의 도움이 필요한 부분이 있다면 적어주세요"
                rows={3}
              />
            </div>

            <div className="field-block">
              <div className="field-label"><Icon.Link /> 첨부 (링크 / 이미지)</div>
              <div className="attachments">
                {(draft.attachments || []).map((a, i) => (
                  <span key={i} className="attachment-chip">
                    {a.type === 'image' ? '🖼️' : <Icon.Link />}
                    <a href={safeHref(a.url)} target="_blank" rel="noopener">{a.label}</a>
                    <button onClick={() => removeAttachment(i)}><Icon.X /></button>
                  </span>
                ))}
              </div>
              <div className="add-link-row">
                <input className="input" placeholder="라벨 (선택)"
                  value={linkLabel} onChange={e => setLinkLabel(e.target.value)}
                  style={{ flex: '0 0 140px' }} />
                <input className="input" placeholder="https://..."
                  value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addAttachment(); }} />
                <button className="btn btn-secondary btn-sm" onClick={addAttachment}>
                  <Icon.Plus /> 추가
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: 히스토리 + 관리자 코멘트 */}
        <div>
          <AdminFeedbackCard student={student} />
          <SelfPasswordCard student={student} />

          <div className="card report-card">
            <div className="section-title">
              <span className="dot" style={{ background: 'var(--status-in-progress)' }}></span>
              📚 이전 보고
              <small>· 최근 작성한 일일 보고</small>
            </div>
            {history.length === 0 ? (
              <div className="empty">
                <div className="big">✨</div>
                첫 번째 보고를 작성해보세요
              </div>
            ) : (
              <div className="history-list">
                {history.map(r => <HistoryItem key={r.id} report={r} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryItem({ report }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="history-item">
      <div className="history-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="history-date">{report.date}</span>
          <StatusPill status={report.status} />
        </div>
        <span className="history-mood" title={`Lv.${window.normalizeMoodLevel(report.mood)} ${window.getMoodEntry(report.mood).label}`}>
          {window.moodIcon(report.mood)}
        </span>
      </div>
      {!expanded ? (
        <>
          {report.today_done && (
            <div className="history-row" style={{ color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {report.today_done.replace(/[#*`>\-]/g, '').replace(/\n/g, ' ').slice(0, 80)}
            </div>
          )}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, padding: '4px 8px' }}
            onClick={() => setExpanded(true)}>자세히 보기 →</button>
        </>
      ) : (
        <>
          {report.today_done && (
            <div className="history-row"><b>오늘 한 일</b><MarkdownView text={report.today_done} /></div>
          )}
          {report.tomorrow_plan && (
            <div className="history-row" style={{ marginTop: 10 }}><b>내일 할 일</b><MarkdownView text={report.tomorrow_plan} /></div>
          )}
          {report.blockers && (
            <div className="history-row" style={{ marginTop: 10 }}><b>막힌 부분</b><MarkdownView text={report.blockers} /></div>
          )}
          {(report.weekly_goals || []).length > 0 && (
            <div className="history-row" style={{ marginTop: 10 }}>
              <b>주간 목표</b>
              <ul style={{ paddingLeft: 18, margin: '4px 0' }}>
                {report.weekly_goals.map(g => (
                  <li key={g.id} style={{ textDecoration: g.status === 'done' ? 'line-through' : 'none', color: g.status === 'done' ? 'var(--ink-mute)' : 'inherit' }}>
                    {g.text || '(빈 항목)'} <span className="muted" style={{ fontSize: 11 }}>({STATUS_OPTIONS.find(o => o.key === g.status)?.label})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(report.attachments || []).length > 0 && (
            <div className="history-row" style={{ marginTop: 8 }}>
              <b>첨부</b>
              <div className="attachments">
                {report.attachments.map((a, i) => (
                  <span key={i} className="attachment-chip">
                    {a.type === 'image' ? '🖼️' : <Icon.Link />}
                    <a href={safeHref(a.url)} target="_blank" rel="noopener">{a.label}</a>
                  </span>
                ))}
              </div>
            </div>
          )}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, padding: '4px 8px' }}
            onClick={() => setExpanded(false)}>접기</button>
        </>
      )}
    </div>
  );
}

window.DailyReportTab = DailyReportTab;

/* ==========================================================================
   AdminFeedbackCard — 관리자가 이 학생에게 남긴 보이는 코멘트 목록
   학생이 멘토에게 답장도 가능
   ========================================================================== */
function AdminFeedbackCard({ student }) {
  const [comments, setComments] = useState([]);
  const [readState, setReadState] = useState({ admin_read_at: null, student_read_at: null });
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);
  // 각 코멘트별 접힘 상태 + 카드 전체 컴팩트 토글
  const [collapsed, setCollapsed] = useState({});
  const [compactMode, setCompactMode] = useState(false);
  function toggleCollapsed(id) { setCollapsed(s => ({ ...s, [id]: !s[id] })); }

  function reload() {
    // 최신 메시지부터 (역순)
    setComments(window.STORE.listComments(student.id, { viewerRole: 'student', order: 'desc' }));
    setReadState(window.STORE.getCommentReadState(student.id));
  }
  useEffect(() => {
    reload();
    return window.STORE.onChange(reload);
  }, [student.id]);

  // 이 카드를 보는 순간/새 메시지 도착 시 = 학생이 멘토 메시지를 읽음 → 읽음 커서 갱신
  // (deps 로 매 렌더 호출 방지; 마킹 후 unread=0 이라 반복 안 함)
  useEffect(() => {
    if (window.STORE.getUnreadCommentCount(student.id, 'student') > 0) {
      Promise.resolve(window.STORE.markCommentsRead(student.id, 'student')).catch(() => {});
    }
  }, [student.id, comments.length]);

  function sendReply() {
    const text = replyText.trim();
    if (!text) return;
    window.STORE.addComment(student.id, student.name, text, {
      role: 'student',
      visibility: 'both'
    });
    setReplyText('');
    setShowReply(false);
    reload();
  }

  return (
    <div className="card report-card" style={{ marginBottom: 20 }}>
      <div className="section-title" style={{ alignItems: 'center' }}>
        <span className="dot" style={{ background: 'var(--brand-accent)' }}></span>
        💬 멘토 메시지
        <small>· 관리자/멘토와의 양방향 피드백</small>
        {comments.length > 0 && (
          <button className="btn btn-ghost btn-sm"
            style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 10px' }}
            onClick={() => {
              const next = !compactMode;
              setCompactMode(next);
              const all = {};
              comments.forEach(c => { all[c.id] = next; });
              setCollapsed(all);
            }}
            title={compactMode ? '모든 메시지 펼치기' : '모든 메시지 접기'}>
            {compactMode ? '⤵ 모두 펼치기' : '⤴ 모두 접기'}
          </button>
        )}
      </div>

      {comments.length === 0 && (
        <div className="empty" style={{ padding: '24px 12px' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📭</div>
          <div style={{ fontSize: 13 }}>아직 받은 메시지가 없습니다</div>
        </div>
      )}

      <div className="comment-list" style={{ maxHeight: compactMode ? 'none' : 480, overflowY: 'auto' }}>
        {comments.map(c => {
          const isCollapsed = !!collapsed[c.id];
          const preview = (c.text || '').replace(/[#*`>\-]/g, '').replace(/\n+/g, ' ').trim().slice(0, 80);
          const isLong = (c.text || '').length > 80 || (c.text || '').includes('\n');
          return (
            <div key={c.id} className={`comment ${isCollapsed ? 'collapsed' : ''}`} style={{
              background: c.author_role === 'student' ? 'var(--brand-primary-soft)' : 'var(--surface-2)',
              borderColor: c.author_role === 'student'
                ? 'color-mix(in oklab, var(--brand-primary) 25%, var(--line))'
                : 'var(--line-soft)'
            }}>
              <div className="comment-meta" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span className="comment-author">
                  {c.author_role === 'student' ? `${c.author} (나)` : `🎓 ${c.author}`}
                </span>
                <span>·</span>
                <span>{new Date(c.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                {/* 내가(학생) 보낸 메시지를 멘토가 읽었는지 */}
                {c.author_role === 'student' && (
                  <ReadReceipt read={isCommentReadByCounterparty(c, readState)} />
                )}
                {isLong && (
                  <button className="btn btn-ghost btn-sm"
                    style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 8px' }}
                    onClick={() => toggleCollapsed(c.id)}
                    title={isCollapsed ? '펼쳐 보기' : '접기'}>
                    {isCollapsed ? '▶ 펼치기' : '▼ 접기'}
                  </button>
                )}
              </div>
              {isCollapsed ? (
                <div className="comment-preview" style={{
                  marginTop: 6, fontSize: 13, color: 'var(--ink-soft)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>
                  {preview}{(c.text || '').length > 80 ? '…' : ''}
                </div>
              ) : (
                <MarkdownView text={c.text} />
              )}
            </div>
          );
        })}
      </div>

      {!showReply ? (
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 12, width: '100%' }}
          onClick={() => setShowReply(true)}>
          <Icon.Message /> 멘토에게 답장 / 질문
        </button>
      ) : (
        <div style={{ marginTop: 12 }}>
          <MarkdownEditor value={replyText} onChange={setReplyText}
            placeholder="질문이나 답장을 작성하세요 (마크다운 지원)"
            rows={3} minimal />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowReply(false); setReplyText(''); }}>
              취소
            </button>
            <button className="btn btn-primary btn-sm" onClick={sendReply} style={{ flex: 1 }}>
              <Icon.Plus /> 보내기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

window.AdminFeedbackCard = AdminFeedbackCard;

/* ==========================================================================
   SelfPasswordCard — 수강생 본인이 자기 비밀번호를 변경/초기화
   - 변경: 현재 비밀번호 → 새 비밀번호 (4자 이상)
   - 초기화: 현재 비밀번호 확인 후 비밀번호 제거 → 다음 로그인에서 다시 설정
   ========================================================================== */
function SelfPasswordCard({ student }) {
  const [mode, setMode] = useState('idle'); // 'idle' | 'change' | 'reset-confirm' | 'reset-done'
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');

  function cancel() {
    setMode('idle');
    setCurrentPw(''); setNewPw(''); setNewPw2(''); setErr('');
  }
  function changePw() {
    if (!window.STORE.verifyStudentPassword(student.id, currentPw)) {
      setErr('현재 비밀번호가 일치하지 않습니다');
      return;
    }
    if (newPw.length < 4) { setErr('새 비밀번호는 4자 이상이어야 합니다'); return; }
    if (newPw !== newPw2) { setErr('새 비밀번호 확인이 일치하지 않습니다'); return; }
    window.STORE.setStudentPassword(student.id, newPw);
    setFlash('변경되었습니다');
    cancel();
    setTimeout(() => setFlash(''), 2000);
  }
  function resetPw() {
    if (!window.STORE.verifyStudentPassword(student.id, currentPw)) {
      setErr('현재 비밀번호가 일치하지 않습니다');
      return;
    }
    window.STORE.setStudentPassword(student.id, null);
    setMode('reset-done');
    setCurrentPw(''); setErr('');
    setFlash('초기화되었습니다. 다음 로그인부터 새 비밀번호를 설정하세요.');
    setTimeout(() => setFlash(''), 3000);
  }

  return (
    <div className="card report-card" style={{ marginBottom: 20 }}>
      <div className="section-title">
        <span className="dot" style={{ background: 'var(--brand-primary)' }}></span>
        🔐 계정 비밀번호
        <small>· 본인 계정 관리</small>
        {flash && <span className="pill" style={{ marginLeft: 'auto', background: 'var(--alert-fresh-bg)', color: 'var(--alert-fresh)', fontSize: 11 }}>✓ {flash}</span>}
      </div>

      {mode === 'idle' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setMode('change')}>
            <Icon.Edit /> 비밀번호 변경
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setMode('reset-confirm')}
            style={{ color: 'var(--alert-danger)' }}>
            <Icon.Trash /> 비밀번호 초기화
          </button>
          <div className="muted" style={{ fontSize: 11, width: '100%', marginTop: 6 }}>
            💡 초기화하면 다음 로그인 시 최초 입장처럼 새 비밀번호를 설정하게 됩니다.
          </div>
        </div>
      )}

      {mode === 'change' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input type="password" className="input"
            placeholder="현재 비밀번호"
            value={currentPw}
            onChange={e => { setCurrentPw(e.target.value); setErr(''); }}
            autoFocus />
          <input type="password" className="input"
            placeholder="새 비밀번호 (4자 이상)"
            value={newPw}
            onChange={e => { setNewPw(e.target.value); setErr(''); }} />
          <input type="password" className="input"
            placeholder="새 비밀번호 확인"
            value={newPw2}
            onChange={e => { setNewPw2(e.target.value); setErr(''); }}
            onKeyDown={e => { if (e.key === 'Enter') changePw(); }} />
          {err && <div className="field-error">⚠ {err}</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={cancel}>취소</button>
            <button className="btn btn-primary btn-sm" onClick={changePw} style={{ flex: 1 }}>변경</button>
          </div>
        </div>
      )}

      {mode === 'reset-confirm' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{
            padding: 12,
            background: 'var(--alert-warn-bg)',
            border: '1px solid color-mix(in oklab, var(--alert-warn) 35%, var(--line))',
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
            color: 'var(--alert-warn)'
          }}>
            ⚠ 본인 확인을 위해 <b>현재 비밀번호</b>를 입력하세요. 확인 후 비밀번호가 제거됩니다.
          </div>
          <input type="password" className="input"
            placeholder="현재 비밀번호"
            value={currentPw}
            onChange={e => { setCurrentPw(e.target.value); setErr(''); }}
            onKeyDown={e => { if (e.key === 'Enter') resetPw(); }}
            autoFocus />
          {err && <div className="field-error">⚠ {err}</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={cancel}>취소</button>
            <button className="btn btn-sm"
              onClick={resetPw}
              style={{ flex: 1, background: 'var(--alert-danger)', color: 'white' }}>
              초기화 진행
            </button>
          </div>
        </div>
      )}

      {mode === 'reset-done' && (
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
          ✓ 비밀번호가 초기화되었습니다.<br/>
          다음 로그인 시 <b>최초 입장</b> 화면처럼 새 비밀번호를 설정할 수 있어요.
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-primary btn-sm"
              onClick={() => {
                localStorage.removeItem('develocket.last_login');
                location.reload();
              }}>
              지금 로그아웃 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

window.SelfPasswordCard = SelfPasswordCard;

/* ==========================================================================
   📅 StudentMentoringTab — 학생 멘토링 이력 + 사후 기록 작성
   ========================================================================== */
function StudentMentoringTab({ student }) {
  const [_, force] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [draftNotes, setDraftNotes] = useState('');
  const [savedFlash, setSavedFlash] = useState(null);

  useEffect(() => {
    const unsub = window.STORE.onChange(() => force(v => v + 1));
    return unsub;
  }, []);

  const sessions = useMemo(
    () => window.STORE.listMentoring({ studentId: student.id }),
    [student.id, _]
  );

  const now = new Date().toISOString();
  const upcoming = sessions.filter(s => s.status === 'scheduled' && s.scheduled_at >= now);
  const completed = sessions.filter(s => s.status === 'completed');
  const other = sessions.filter(s => !upcoming.includes(s) && !completed.includes(s));
  const pendingNotes = completed.filter(s => !s.student_notes).length;

  function startEdit(s) {
    setEditingId(s.id);
    setDraftNotes(s.student_notes || '');
  }
  async function saveNotes(id) {
    try {
      const r = window.STORE.updateMentoringStudentNotes(id, draftNotes);
      if (r && typeof r.then === 'function') await r;
      setEditingId(null);
      setDraftNotes('');
      setSavedFlash(id);
      setTimeout(() => setSavedFlash(null), 1800);
    } catch (e) {
      alert('저장 실패: ' + e.message);
    }
  }

  return (
    <div className="float-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 className="h2" style={{ margin: 0 }}>📅 멘토링 이력</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {sessions.length}건 · 완료 {completed.length} · 예정 {upcoming.length}
            {pendingNotes > 0 && (
              <span style={{ marginLeft: 8, color: 'var(--alert-warn)', fontWeight: 700 }}>
                · 사후 기록 미작성 {pendingNotes}건
              </span>
            )}
          </div>
        </div>
      </div>

      {sessions.length === 0 && (
        <div className="empty">
          <div className="big">📅</div>
          <div>아직 등록된 멘토링이 없습니다.</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            관리자가 일정을 등록하면 이곳에 표시됩니다.
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div className="section-title">
            <span className="dot" style={{ background: 'var(--brand-accent)' }}></span>
            🗓 예정된 멘토링
            <small>· {upcoming.length}건</small>
          </div>
          {upcoming.map(s => (
            <StudentMentoringRow key={s.id} session={s}
              mode="upcoming"
              editingId={editingId}
              draftNotes={draftNotes}
              setDraftNotes={setDraftNotes}
              savedFlash={savedFlash}
              onStartEdit={startEdit}
              onCancelEdit={() => { setEditingId(null); setDraftNotes(''); }}
              onSaveNotes={saveNotes} />
          ))}
        </section>
      )}

      {completed.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div className="section-title">
            <span className="dot" style={{ background: 'var(--alert-fresh)' }}></span>
            ✅ 완료된 멘토링
            <small>· {completed.length}건 · 사후 기록 작성 가능</small>
          </div>
          {completed.map(s => (
            <StudentMentoringRow key={s.id} session={s}
              mode="completed"
              editingId={editingId}
              draftNotes={draftNotes}
              setDraftNotes={setDraftNotes}
              savedFlash={savedFlash}
              onStartEdit={startEdit}
              onCancelEdit={() => { setEditingId(null); setDraftNotes(''); }}
              onSaveNotes={saveNotes} />
          ))}
        </section>
      )}

      {other.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div className="section-title">
            <span className="dot" style={{ background: 'var(--ink-mute)' }}></span>
            기타 (취소/불참 등)
            <small>· {other.length}건</small>
          </div>
          {other.map(s => (
            <StudentMentoringRow key={s.id} session={s}
              mode="other"
              editingId={editingId}
              draftNotes={draftNotes}
              setDraftNotes={setDraftNotes}
              savedFlash={savedFlash}
              onStartEdit={startEdit}
              onCancelEdit={() => { setEditingId(null); setDraftNotes(''); }}
              onSaveNotes={saveNotes} />
          ))}
        </section>
      )}
    </div>
  );
}

function StudentMentoringRow({ session: s, mode, editingId, draftNotes, setDraftNotes, savedFlash, onStartEdit, onCancelEdit, onSaveNotes }) {
  const dt = s.scheduled_at || '';
  const date = dt.slice(0, 10);
  const time = dt.slice(11, 16);
  const isEditing = editingId === s.id;
  const hasNotes = !!s.student_notes;
  const needsNotes = mode === 'completed' && !hasNotes;
  const statusLabel = {
    scheduled: '예정', completed: '완료', cancelled: '취소', no_show: '불참'
  }[s.status] || s.status;

  return (
    <div className={`student-mentoring-card status-${s.status} ${needsNotes ? 'needs-notes' : ''} ${hasNotes ? 'has-notes' : ''}`}>
      <div className="smc-head">
        <div className="smc-when">
          <div className="smc-date">{date}</div>
          <div className="smc-time">⏰ {time} · {s.duration_min}분</div>
        </div>
        <div className="smc-info">
          <div className="smc-title">
            {s.topic || '(주제 미정)'}
            <span className={`pill status-pill-${s.status}`} style={{ marginLeft: 8 }}>{statusLabel}</span>
            {needsNotes && (
              <span className="pill" style={{ background: 'var(--alert-warn-bg)', color: 'var(--alert-warn)', marginLeft: 6 }}>
                ⚠ 기록 필요
              </span>
            )}
            {hasNotes && (
              <span className="pill" style={{ background: 'var(--alert-fresh-bg)', color: 'var(--alert-fresh)', marginLeft: 6 }}>
                ✓ 기록 완료
              </span>
            )}
            {savedFlash === s.id && (
              <span className="pill" style={{ background: 'var(--alert-fresh-bg)', color: 'var(--alert-fresh)', marginLeft: 6 }}>
                💾 저장됨
              </span>
            )}
          </div>
          <div className="smc-meta">
            {s.mentor && <span>🎓 {s.mentor}</span>}
            {s.location && <span>📍 {s.location}</span>}
          </div>
        </div>
      </div>

      {s.admin_notes && (
        <details className="smc-block" open>
          <summary>📌 멘토 의제</summary>
          <MarkdownView text={s.admin_notes} />
        </details>
      )}

      <div className="smc-block smc-notes-block">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            🧑‍🎓 내 사후 기록
            {hasNotes && s.student_notes_updated_at && (
              <span className="muted" style={{ fontSize: 11, fontWeight: 400, marginLeft: 6 }}>
                · 작성: {new Date(s.student_notes_updated_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          {!isEditing && (
            <button className="btn btn-secondary btn-sm" onClick={() => onStartEdit(s)}>
              <Icon.Edit /> {hasNotes ? '수정' : '작성'}
            </button>
          )}
        </div>
        {isEditing ? (
          <>
            <MarkdownEditor value={draftNotes} onChange={setDraftNotes}
              placeholder="멘토링에서 다룬 내용, 배운 점, 다음 액션 아이템을 정리해 보세요…"
              rows={4} minimal />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={onCancelEdit}>취소</button>
              <button className="btn btn-primary btn-sm" onClick={() => onSaveNotes(s.id)} style={{ flex: 1 }}>
                💾 저장
              </button>
            </div>
          </>
        ) : hasNotes ? (
          <div className="smc-notes-view">
            <MarkdownView text={s.student_notes} />
          </div>
        ) : (
          <div className="smc-notes-empty muted">
            {mode === 'completed' ? '아직 사후 기록을 작성하지 않았어요. 멘토링 내용을 정리해 보세요.' : '아직 사후 기록이 없습니다.'}
          </div>
        )}
      </div>
    </div>
  );
}

window.StudentMentoringTab = StudentMentoringTab;
window.StudentMentoringRow = StudentMentoringRow;
