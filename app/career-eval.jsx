/* ==========================================================================
   희망 직군(지망/승인) + 훈련생 평가 + 취업면담 이력
   - CareerPrefCard      : 학생 — 1·2·3지망 선택(최초 즉시, 변경은 관리자 승인)
   - CareerApprovalRow   : 관리자 — 현재 직군 + 변경요청 승인/반려
   - EvaluationsPanel    : 관리자 전용 — 강사별 목표/평가 (학생 비공개)
   - CounselingPanel     : 관리자 전용 — 취업면담 이력 (학생 비공개)
   ========================================================================== */

const CAREER_CATEGORIES = {
  '기획3기':    ['게임기획', '시스템기획', '콘텐츠기획', '레벨디자인', '내러티브', '밸런스기획', 'QA', '사업/PM', '기타'],
  '프로그램3기': ['클라이언트', '서버', '엔진', '그래픽스', '게임플레이', 'AI', 'XR/VR', 'QA', '기타'],
  _default:     ['게임기획', '클라이언트 개발', '서버 개발', '아트', 'QA', '사업/마케팅', '기타']
};
function careerOptions(cohort) { return CAREER_CATEGORIES[cohort] || CAREER_CATEGORIES._default; }

/* ----------------- 학생: 희망 직군 카드 ----------------- */
function CareerPrefCard({ student }) {
  const [pref, setPref] = useState(null);
  const [pending, setPending] = useState(null);
  const [editing, setEditing] = useState(false);
  const [choices, setChoices] = useState(['', '', '']);
  const [flash, setFlash] = useState('');

  function reload() {
    const p = window.STORE.getCareerPref(student.id);
    setPref(p);
    setPending(window.STORE.listCareerRequests({ studentId: student.id, status: 'pending' })[0] || null);
    if (p && Array.isArray(p.choices)) setChoices([p.choices[0] || '', p.choices[1] || '', p.choices[2] || '']);
  }
  useEffect(() => { reload(); return window.STORE.onChange(reload); }, [student.id]);

  const approved = pref && Array.isArray(pref.choices) && pref.choices.length > 0;
  const opts = careerOptions(student.cohort);

  async function save() {
    const cleaned = choices.map(c => (c || '').trim()).filter(Boolean);
    if (cleaned.length === 0) { setFlash('1지망은 입력해주세요'); return; }
    try {
      const res = await Promise.resolve(window.STORE.setCareerPref(student.id, choices));
      if (res && res.applied) setFlash('✓ 희망 직군이 적용되었습니다');
      else if (res && res.pending) setFlash('변경 요청이 접수되었습니다 — 관리자 승인 후 반영됩니다');
      else if (res && res.error) setFlash('저장에 실패했습니다');
      setEditing(false);
      reload();
    } catch (e) {
      setFlash('저장에 실패했습니다');
    }
    setTimeout(() => setFlash(''), 3500);
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="section-title">
        <span className="dot" style={{ background: 'var(--brand-primary)' }}></span>
        🎯 희망 직군 <small>· 1·2·3지망</small>
      </div>

      {!editing ? (
        <div>
          {approved ? (
            <div className="career-choices">
              {pref.choices.map((c, i) => <span key={i} className="career-chip">{i + 1}지망 · <b>{c}</b></span>)}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>아직 희망 직군을 선택하지 않았습니다.</div>
          )}
          {pending && (
            <div className="career-pending">⏳ 변경 승인 대기 중: {(pending.choices || []).filter(Boolean).join(' → ')}</div>
          )}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
              {approved ? '변경 요청' : '희망 직군 선택'}
            </button>
            {flash && <span className="muted" style={{ fontSize: 12 }}>{flash}</span>}
          </div>
        </div>
      ) : (
        <div>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 48, fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)' }}>{i + 1}지망</span>
              <input className="input" list={`career-opts-${student.id}`} value={choices[i]}
                onChange={e => setChoices(c => c.map((x, j) => j === i ? e.target.value : x))}
                placeholder={i === 0 ? '필수 · 선택 또는 직접 입력' : '선택'} />
            </div>
          ))}
          <datalist id={`career-opts-${student.id}`}>
            {opts.map(o => <option key={o} value={o} />)}
          </datalist>
          <div className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
            {approved ? '변경 사항은 관리자 승인 후 최종 반영됩니다.' : '최초 선택은 즉시 적용됩니다. 이후 변경은 관리자 승인이 필요합니다.'}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); reload(); }}>취소</button>
            <button className="btn btn-primary btn-sm" onClick={save} style={{ flex: 1 }}>저장</button>
          </div>
          {flash && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--alert-warn)' }}>{flash}</div>}
        </div>
      )}
    </div>
  );
}

/* ----------------- 관리자: 희망 직군 + 변경 승인 ----------------- */
function CareerApprovalRow({ student, onUpdate }) {
  const [pref, setPref] = useState(null);
  const [pending, setPending] = useState(null);
  const [err, setErr] = useState('');
  function reload() {
    setPref(window.STORE.getCareerPref(student.id));
    setPending(window.STORE.listCareerRequests({ studentId: student.id, status: 'pending' })[0] || null);
  }
  useEffect(() => { reload(); return window.STORE.onChange(reload); }, [student.id]);

  function decide(approve) {
    if (!pending) return;
    setErr('');
    Promise.resolve(window.STORE.decideCareerRequest(pending.id, approve, '관리자'))
      .then(() => { reload(); onUpdate && onUpdate(); })
      .catch(e => setErr('처리에 실패했습니다: ' + ((e && e.message) || e)));
  }

  const approved = pref && Array.isArray(pref.choices) && pref.choices.length > 0;
  return (
    <div className="career-admin">
      <div className="field-label">🎯 희망 직군 (1·2·3지망)</div>
      {approved ? (
        <div className="career-choices">
          {pref.choices.map((c, i) => <span key={i} className="career-chip">{i + 1}지망 · <b>{c}</b></span>)}
        </div>
      ) : <span className="muted" style={{ fontSize: 13 }}>미선택</span>}
      {pending && (
        <div className="career-pending-admin">
          <div style={{ fontSize: 13, marginBottom: 6 }}>⏳ 변경 요청: <b>{(pending.choices || []).filter(Boolean).join(' → ')}</b></div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-primary" onClick={() => decide(true)}>승인</button>
            <button className="btn btn-sm btn-ghost" onClick={() => decide(false)}>반려</button>
          </div>
          {err && <div style={{ color: 'var(--alert-danger)', fontSize: 12, marginTop: 6 }}>{err}</div>}
        </div>
      )}
    </div>
  );
}

/* ----------------- 관리자 전용: 훈련생 평가 (학생 비공개) ----------------- */
function EvaluationsPanel({ student }) {
  const [list, setList] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ evaluator: '', goal: '', content: '', score: '' });

  function reload() { setList(window.STORE.listEvaluations(student.id)); }
  useEffect(() => { reload(); return window.STORE.onChange(reload); }, [student.id]);

  function save() {
    if (!form.evaluator.trim()) { alert('강사명을 입력하세요'); return; }
    const parsed = form.score ? parseInt(form.score, 10) : null;
    const score = Number.isNaN(parsed) ? null : parsed;
    Promise.resolve(window.STORE.upsertEvaluation({
      student_id: student.id,
      evaluator: form.evaluator.trim(),
      goal: form.goal,
      content: form.content,
      score
    })).then(() => { setForm({ evaluator: '', goal: '', content: '', score: '' }); setAdding(false); reload(); })
      .catch(e => alert('저장에 실패했습니다: ' + ((e && e.message) || e)));
  }
  function remove(id) {
    if (window.confirm('이 평가를 삭제할까요?')) {
      Promise.resolve(window.STORE.deleteEvaluation(id)).then(reload).catch(e => alert('삭제 실패: ' + ((e && e.message) || e)));
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="section-title"><span className="dot" style={{ background: 'var(--alert-warn)' }}></span>📋 훈련생 평가 <small>· 강사별 · 학생 비공개</small></div>
      {list.length === 0 && <div className="muted" style={{ fontSize: 13, padding: '8px 0' }}>등록된 평가가 없습니다.</div>}
      <div className="eval-list">
        {list.map(ev => (
          <div key={ev.id} className="eval-card">
            <div className="eval-head">
              <span className="eval-evaluator">🧑‍🏫 {ev.evaluator}</span>
              {ev.score != null && <span className="eval-score">{ev.score}점</span>}
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', padding: '2px 6px', color: 'var(--alert-danger)' }} onClick={() => remove(ev.id)}><Icon.Trash /></button>
            </div>
            {ev.goal && <div className="eval-goal"><b>목표</b> · {ev.goal}</div>}
            {ev.content && <MarkdownView text={ev.content} />}
          </div>
        ))}
      </div>
      {adding ? (
        <div className="eval-form">
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input className="input" placeholder="강사명 *" value={form.evaluator} onChange={e => setForm(f => ({ ...f, evaluator: e.target.value }))} style={{ flex: 1 }} />
            <input className="input" type="number" min="0" max="100" placeholder="점수(선택)" value={form.score} onChange={e => setForm(f => ({ ...f, score: e.target.value }))} style={{ width: 110 }} />
          </div>
          <input className="input" placeholder="목표(선택)" value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} style={{ width: '100%', marginBottom: 8 }} />
          <MarkdownEditor value={form.content} onChange={v => setForm(f => ({ ...f, content: v }))} placeholder="평가 내용 (마크다운)" rows={4} minimal />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>취소</button>
            <button className="btn btn-primary btn-sm" onClick={save} style={{ flex: 1 }}>저장</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setAdding(true)}><Icon.Plus /> 평가 추가</button>
      )}
    </div>
  );
}

/* ----------------- 관리자 전용: 취업면담 이력 (학생 비공개) ----------------- */
function CounselingPanel({ student }) {
  const today = window.STORE_HELPERS.todayStr();
  const [list, setList] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ date: today, counselor: '', content: '' });

  function reload() { setList(window.STORE.listCounseling(student.id)); }
  useEffect(() => { reload(); return window.STORE.onChange(reload); }, [student.id]);

  function save() {
    if (!form.counselor.trim()) { alert('상담자를 입력하세요'); return; }
    Promise.resolve(window.STORE.addCounseling({
      student_id: student.id, date: form.date || today, counselor: form.counselor.trim(), content: form.content
    })).then(() => { setForm({ date: today, counselor: '', content: '' }); setAdding(false); reload(); })
      .catch(e => alert('저장에 실패했습니다: ' + ((e && e.message) || e)));
  }
  function remove(id) {
    if (window.confirm('이 면담 기록을 삭제할까요?')) {
      Promise.resolve(window.STORE.deleteCounseling(id)).then(reload).catch(e => alert('삭제 실패: ' + ((e && e.message) || e)));
    }
  }

  return (
    <div>
      <div className="section-title"><span className="dot" style={{ background: 'var(--brand-accent)' }}></span>💼 취업면담 이력 <small>· 학생 비공개</small></div>
      {list.length === 0 && <div className="muted" style={{ fontSize: 13, padding: '8px 0' }}>등록된 면담 이력이 없습니다.</div>}
      <div className="counsel-list">
        {list.map(c => (
          <div key={c.id} className="counsel-card">
            <div className="counsel-head">
              <span className="counsel-date">📅 {c.date}</span>
              <span className="counsel-by">· {c.counselor}</span>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', padding: '2px 6px', color: 'var(--alert-danger)' }} onClick={() => remove(c.id)}><Icon.Trash /></button>
            </div>
            {c.content && <MarkdownView text={c.content} />}
          </div>
        ))}
      </div>
      {adding ? (
        <div className="counsel-form">
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input className="input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ width: 150 }} />
            <input className="input" placeholder="상담자 *" value={form.counselor} onChange={e => setForm(f => ({ ...f, counselor: e.target.value }))} style={{ flex: 1 }} />
          </div>
          <MarkdownEditor value={form.content} onChange={v => setForm(f => ({ ...f, content: v }))} placeholder="면담 내용 (마크다운)" rows={4} minimal />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>취소</button>
            <button className="btn btn-primary btn-sm" onClick={save} style={{ flex: 1 }}>저장</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setAdding(true)}><Icon.Plus /> 면담 기록 추가</button>
      )}
    </div>
  );
}

Object.assign(window, { CareerPrefCard, CareerApprovalRow, EvaluationsPanel, CounselingPanel, careerOptions, CAREER_CATEGORIES });
