/* ==========================================================================
   공용 컴포넌트 — Avatar, MarkdownEditor, StatusPicker, MoodPicker, Drawer, Icons
   ========================================================================== */
const { useState, useEffect, useRef, useMemo } = React;

/* ----------- Avatar ----------- */
const AVATAR_COLORS = [
  '#7C5CFF', '#FF8A3D', '#10B981', '#3B82F6', '#EF4444',
  '#8B5CF6', '#F59E0B', '#06B6D4', '#EC4899', '#84CC16'
];
function hashName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function Avatar({ name, size = 28 }) {
  const color = AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
  const initial = name ? name.slice(-2) : '?';
  return (
    <div className="avatar" style={{
      background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 70%, #000))`,
      width: size, height: size, fontSize: size * 0.4
    }}>{initial}</div>
  );
}

/* ----------- Icons (minimal) ----------- */
const Icon = {
  Search: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  Plus: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M12 5v14"/></svg>,
  X: (p) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  Logout: (p) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Trash: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  Link: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  Eye: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
  Edit: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>,
  Rocket: (p) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>,
  Grid: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  List: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  Columns: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="6" height="18" rx="1"/><rect x="11" y="3" width="6" height="18" rx="1"/><rect x="19" y="3" width="2" height="18" rx="1"/></svg>,
  External: (p) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  Message: (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/></svg>,
};

/* ----------- MarkdownEditor — textarea + preview toggle ----------- */
function MarkdownEditor({ value, onChange, placeholder, rows = 5, minimal = false }) {
  const [mode, setMode] = useState('edit'); // edit | preview
  return (
    <div className="md-editor">
      {!minimal && (
        <div className="md-toolbar">
          <button type="button"
            className={`md-tab ${mode === 'edit' ? 'active' : ''}`}
            onClick={() => setMode('edit')}>
            <Icon.Edit /> 작성
          </button>
          <button type="button"
            className={`md-tab ${mode === 'preview' ? 'active' : ''}`}
            onClick={() => setMode('preview')}>
            <Icon.Eye /> 미리보기
          </button>
          <span className="md-hint">마크다운 지원: **굵게** *기울임* `코드` # 제목 - 목록 [링크](url)</span>
        </div>
      )}
      {mode === 'edit' || minimal ? (
        <textarea
          className="textarea md-input"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
        />
      ) : (
        <div className="md-preview"
          dangerouslySetInnerHTML={{ __html: value ? window.renderMD(value) : '<p class="muted">(비어있음)</p>' }}
        />
      )}
    </div>
  );
}

/* ----------- MarkdownView — render-only ----------- */
function MarkdownView({ text, className = '' }) {
  if (!text) return null;
  return (
    <div className={`md-preview ${className}`}
      dangerouslySetInnerHTML={{ __html: window.renderMD(text) }}
    />
  );
}

/* ----------- StatusPicker ----------- */
const STATUS_OPTIONS = [
  { key: 'not-started', label: '시작전' },
  { key: 'in-progress', label: '진행중' },
  { key: 'done', label: '완료' },
  { key: 'blocked', label: '막힘' }
];
function StatusPicker({ value, onChange }) {
  return (
    <div className="status-row">
      {STATUS_OPTIONS.map(o => (
        <button key={o.key}
          type="button"
          data-key={o.key}
          className={`status-pick ${value === o.key ? 'active' : ''}`}
          onClick={() => onChange(o.key)}>
          <span className="dot"></span>{o.label}
        </button>
      ))}
    </div>
  );
}
function StatusPill({ status }) {
  const opt = STATUS_OPTIONS.find(o => o.key === status) || STATUS_OPTIONS[0];
  return <span className={`pill pill-status ${status}`}>● {opt.label}</span>;
}

/* ----------- MoodPicker (10단계: 좌=좋음, 우=안좋음) -----------
   - 각 단계는 1~10 정수로 저장됨
   - 표시는 이모지 + 색 그라데이션 (초록 → 노랑 → 빨강)
   - 기존 이모지 값 자동 매핑 (마이그레이션)
*/
const MOOD_SCALE = [
  { lv: 1,  icon: '🤩', label: '최고로 좋음',  color: '#10B981' },
  { lv: 2,  icon: '😄', label: '아주 좋음',    color: '#22C55E' },
  { lv: 3,  icon: '😊', label: '좋음',         color: '#65A30D' },
  { lv: 4,  icon: '🙂', label: '괜찮음',       color: '#A3A300' },
  { lv: 5,  icon: '😐', label: '보통',         color: '#CA8A04' },
  { lv: 6,  icon: '😕', label: '약간 안좋음',  color: '#F59E0B' },
  { lv: 7,  icon: '😣', label: '안좋음',       color: '#F97316' },
  { lv: 8,  icon: '😩', label: '많이 안좋음',  color: '#EF4444' },
  { lv: 9,  icon: '😢', label: '힘듦',         color: '#DC2626' },
  { lv: 10, icon: '😭', label: '매우 힘듦',    color: '#B91C1C' }
];
const LEGACY_MOOD_MAP = {
  '😀': 2, '🙂': 4, '😐': 5, '😅': 6, '😴': 7,
  '🔥': 1, '😤': 8, '🥱': 7, '🤔': 5, '💪': 2
};
function normalizeMoodLevel(v) {
  if (typeof v === 'number') {
    const n = Math.round(v);
    if (n >= 1 && n <= 10) return n;
  }
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    if (!isNaN(n) && n >= 1 && n <= 10) return n;
    if (LEGACY_MOOD_MAP[v]) return LEGACY_MOOD_MAP[v];
  }
  return 5;
}
function getMoodEntry(v) { return MOOD_SCALE[normalizeMoodLevel(v) - 1]; }
function moodIcon(v) { return getMoodEntry(v).icon; }
const MOODS = MOOD_SCALE.map(m => m.icon); // 하위 호환 (legacy 코드에서 사용)

function MoodPicker({ value, onChange }) {
  const cur = normalizeMoodLevel(value);
  const curEntry = MOOD_SCALE[cur - 1];
  return (
    <div className="mood-scale">
      <div className="mood-scale-head">
        <span className="mood-scale-end good">좋음 →</span>
        <span className="mood-scale-current" style={{ color: curEntry.color }}>
          <span className="mood-scale-icon">{curEntry.icon}</span>
          <span className="mood-scale-label">{curEntry.label}</span>
          <span className="mood-scale-lv">Lv.{cur}/10</span>
        </span>
        <span className="mood-scale-end bad">← 안좋음</span>
      </div>
      <div className="mood-scale-row" role="radiogroup" aria-label="오늘의 컨디션 (1~10)">
        {MOOD_SCALE.map(m => (
          <button key={m.lv}
            type="button"
            role="radio"
            aria-checked={cur === m.lv}
            className={`mood-step ${cur === m.lv ? 'active' : ''}`}
            style={{
              borderColor: m.color,
              background: cur === m.lv ? m.color : `color-mix(in oklab, ${m.color} 12%, var(--surface))`,
              color: cur === m.lv ? 'white' : m.color
            }}
            onClick={() => onChange(m.lv)}
            title={`${m.lv}. ${m.label}`}>
            <span className="mood-step-icon">{m.icon}</span>
            <span className="mood-step-lv">{m.lv}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ----------- ElapsedBadge ----------- */
function elapsedTier(days, threshold) {
  if (days === null || days === undefined) return 'never';
  if (days <= 1) return 'fresh';
  if (days < threshold) return 'warn';
  return 'danger';
}
function ElapsedBadge({ days, threshold = 3 }) {
  if (days === null || days === undefined) {
    return <span className="elapsed-badge danger">미입력</span>;
  }
  const tier = elapsedTier(days, threshold);
  const label = days === 0 ? '오늘' : days === 1 ? '어제' : `${days}일 전`;
  return <span className={`elapsed-badge ${tier}`}>{label}</span>;
}

/* ----------- Drawer ----------- */
function Drawer({ open, onClose, children, width = 520 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="drawer-overlay" onClick={onClose}></div>
      <div className="drawer" style={{ width }}>
        {children}
      </div>
    </>
  );
}

/* ----------- ProgressBar ----------- */
function ProgressBar({ value }) {
  const v = Math.min(100, Math.max(0, value || 0));
  return (
    <div className="progress-bar">
      <div className="progress-fill" style={{ width: `${v}%` }}></div>
    </div>
  );
}

/* ----------- 안전한 href (javascript:/vbscript:/data:text/html 차단) -----------
   사용자 입력(문서 링크, 첨부 등)을 <a href>로 렌더링하기 전 allowlist 검증.
   허용: http(s):// , data:application/pdf;base64, , data:image/(png|jpe?g|gif|webp);base64 */
function safeHref(url) {
  if (!url || typeof url !== 'string') return '#';
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^data:application\/pdf;base64,/i.test(u)) return u;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(u)) return u;
  return '#';
}

/* ----------- 코멘트 읽음 표시 (양방향 read receipt) -----------
   relative to the comment's author, has the *counterparty* read it?
   - 학생이 쓴 코멘트  → 관리자(admin_read_at) 가 읽었는가
   - 관리자가 쓴 코멘트 → 학생(student_read_at) 가 읽었는가
   readState = STORE.getCommentReadState(studentId) = { admin_read_at, student_read_at }
*/
function isCommentReadByCounterparty(comment, readState) {
  if (!readState) return false;
  const cursor = comment.author_role === 'student' ? readState.admin_read_at : readState.student_read_at;
  return !!(cursor && comment.created_at <= cursor);
}
/* 내가 보낸 메시지에 붙는 읽음/안읽음 뱃지 */
function ReadReceipt({ read }) {
  return (
    <span className={'read-receipt ' + (read ? 'is-read' : 'is-unread')}>
      {read ? '✓✓ 읽음' : '✓ 안읽음'}
    </span>
  );
}

Object.assign(window, {
  Avatar, Icon, MarkdownEditor, MarkdownView,
  StatusPicker, StatusPill, MoodPicker,
  ElapsedBadge, elapsedTier, Drawer, ProgressBar,
  ReadReceipt, isCommentReadByCounterparty, safeHref,
  STATUS_OPTIONS, MOODS, MOOD_SCALE,
  normalizeMoodLevel, moodIcon, getMoodEntry
});
