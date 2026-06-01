/* ==========================================================================
   DocumentsPanel — 이력서 / 자소서 / 포폴 문서 관리 (학생·관리자 공용)
   - viewerRole: 'student' | 'admin'
   - 첨부: 구글드라이브 등 링크 또는 PDF(≤1.5MB) 업로드
   - 상태 워크플로우:
       학생 설정  : 수정중(editing) / 검토요청(review_requested)
       관리자 설정: 수정요(revision) / 완료(complete)
   - 세부 피드백은 기존 💬 코멘트(멘토 메시지) 채널 활용
   ========================================================================== */

const DOC_KINDS = [
  { key: 'resume',       label: '이력서', icon: '📄' },
  { key: 'cover_letter', label: '자소서', icon: '✍️' },
  { key: 'portfolio',    label: '포폴',   icon: '🎨' }
];
const DOC_KIND_MAP = {};
DOC_KINDS.forEach(k => { DOC_KIND_MAP[k.key] = k; });
function docKindLabel(k) { return (DOC_KIND_MAP[k] && DOC_KIND_MAP[k].label) || k || '문서'; }
function docKindIcon(k) { return (DOC_KIND_MAP[k] && DOC_KIND_MAP[k].icon) || '📁'; }

const DOC_STATUS_META = {
  none:             { label: '대기',        bg: 'var(--surface-3, #eee)',          fg: 'var(--ink-mute, #888)' },
  editing:          { label: '✏️ 수정중',   bg: 'var(--alert-warn-bg, #fef3cd)',    fg: 'var(--alert-warn, #9a6700)' },
  review_requested: { label: '🔍 검토요청', bg: 'var(--brand-primary-soft, #eee6ff)', fg: 'var(--brand-primary, #7C5CFF)' },
  revision:         { label: '⚠️ 수정요',   bg: 'var(--alert-danger-bg, #fde2e1)',  fg: 'var(--alert-danger, #c0392b)' },
  complete:         { label: '✅ 완료',     bg: 'var(--alert-fresh-bg, #e6f4ea)',   fg: 'var(--alert-fresh, #1a7f37)' }
};
const STUDENT_STATUS_SET = ['editing', 'review_requested'];
const ADMIN_STATUS_SET = ['revision', 'complete'];

function DocStatusBadge({ status }) {
  const m = DOC_STATUS_META[status] || DOC_STATUS_META.none;
  return <span className="doc-status-badge" style={{ background: m.bg, color: m.fg }}>{m.label}</span>;
}

/* ----------------- 개별 문서 카드 ----------------- */
function DocCard({ doc, isAdmin, onStatus, onRemove }) {
  const statuses = isAdmin ? ADMIN_STATUS_SET : STUDENT_STATUS_SET;
  const hasFile = !!doc.file_url;
  const hasLink = !!doc.link;
  return (
    <div className="doc-card">
      <div className="doc-card-head">
        <span className="doc-kind-pill">{docKindIcon(doc.kind)} {docKindLabel(doc.kind)}</span>
        <span className="doc-title" title={doc.title}>{doc.title || '(제목 없음)'}</span>
        <DocStatusBadge status={doc.status} />
        <button className="btn btn-ghost btn-sm doc-del" onClick={() => onRemove(doc)} title="삭제">
          <Icon.Trash />
        </button>
      </div>
      <div className="doc-card-body">
        {hasLink && (
          <a className="btn btn-ghost btn-sm" href={safeHref(doc.link)} target="_blank" rel="noreferrer">
            <Icon.Link /> 링크 열기
          </a>
        )}
        {hasFile && (
          <a className="btn btn-ghost btn-sm" href={safeHref(doc.file_url)} target="_blank" rel="noreferrer" download={doc.file_name || 'document.pdf'}>
            <Icon.External /> {doc.file_name || 'PDF'}
          </a>
        )}
        {!hasLink && !hasFile && <span className="muted" style={{ fontSize: 12 }}>첨부 없음</span>}
      </div>
      <div className="doc-card-actions">
        <span className="muted" style={{ fontSize: 11 }}>{isAdmin ? '관리자 상태:' : '내 상태:'}</span>
        {statuses.map(st => (
          <button key={st}
            className={`btn btn-sm ${doc.status === st ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => onStatus(doc, st)}>
            {DOC_STATUS_META[st].label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ----------------- 문서 추가 폼 ----------------- */
function DocAddForm({ student, onDone, onCancel }) {
  const [kind, setKind] = useState('resume');
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  async function save() {
    setErr('');
    const file = fileRef.current && fileRef.current.files && fileRef.current.files[0];
    if (!link.trim() && !file) { setErr('구글드라이브 링크 또는 PDF 파일 중 하나는 필요합니다'); return; }
    setBusy(true);
    try {
      let file_url = '', file_name = '';
      if (file) {
        const up = await window.STORE.uploadDocumentFile(student.id, file);
        file_url = up.file_url; file_name = up.file_name;
      }
      await window.STORE.upsertDocument({
        student_id: student.id,
        kind,
        title: title.trim() || file_name || docKindLabel(kind),
        link: link.trim(),
        file_url,
        file_name,
        status: 'editing'
      });
      onDone();
    } catch (e) {
      setErr((e && e.message) || '저장에 실패했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="doc-add-form">
      <div className="field-label" style={{ marginBottom: 8 }}>＋ 문서 추가</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <select className="input" value={kind} onChange={e => setKind(e.target.value)} style={{ maxWidth: 140 }}>
          {DOC_KINDS.map(k => <option key={k.key} value={k.key}>{k.icon} {k.label}</option>)}
        </select>
        <input className="input" placeholder="제목 (선택)" value={title}
          onChange={e => setTitle(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
      </div>
      <input className="input" placeholder="구글드라이브 등 링크 (또는 아래 PDF 업로드)" value={link}
        onChange={e => setLink(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ fontSize: 12 }} />
        <span className="muted" style={{ fontSize: 11 }}>PDF ≤ 1.5MB (큰 파일은 링크 권장)</span>
      </div>
      {err && <div style={{ color: 'var(--alert-danger)', fontSize: 12, marginBottom: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>취소</button>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy} style={{ flex: 1 }}>
          {busy ? '저장 중…' : '추가'}
        </button>
      </div>
    </div>
  );
}

/* ----------------- 패널 ----------------- */
function DocumentsPanel({ student, viewerRole }) {
  const isAdmin = viewerRole === 'admin';
  const [docs, setDocs] = useState([]);
  const [adding, setAdding] = useState(false);

  function reload() { setDocs(window.STORE.listDocuments(student.id)); }
  useEffect(() => {
    reload();
    return window.STORE.onChange(reload);
  }, [student.id]);

  function changeStatus(doc, status) {
    Promise.resolve(window.STORE.setDocumentStatus(doc.id, status)).then(reload).catch(() => {});
  }
  function remove(doc) {
    if (!window.confirm(`'${doc.title || docKindLabel(doc.kind)}' 문서를 삭제할까요?`)) return;
    Promise.resolve(window.STORE.deleteDocument(doc.id)).then(reload).catch(() => {});
  }

  return (
    <div className="docs-panel">
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        📁 이력서·자소서·포트폴리오 — 드라이브 링크나 PDF를 올리고 상태로 진행을 공유하세요.
        세부 피드백은 💬 코멘트를 활용하세요.
      </div>

      {docs.length === 0 && !adding && (
        <div className="empty" style={{ padding: '20px 12px' }}>
          <div style={{ fontSize: 26, marginBottom: 6 }}>📭</div>
          <div style={{ fontSize: 13 }}>아직 등록된 문서가 없습니다</div>
        </div>
      )}

      <div className="docs-list">
        {docs.map(d => (
          <DocCard key={d.id} doc={d} isAdmin={isAdmin} onStatus={changeStatus} onRemove={remove} />
        ))}
      </div>

      {adding ? (
        <DocAddForm student={student} onDone={() => { setAdding(false); reload(); }} onCancel={() => setAdding(false)} />
      ) : (
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={() => setAdding(true)}>
          <Icon.Plus /> 문서 추가
        </button>
      )}
    </div>
  );
}

Object.assign(window, { DocumentsPanel, DocStatusBadge, DOC_KINDS, docKindLabel, docKindIcon, DOC_STATUS_META });
