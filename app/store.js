/* ==========================================================================
   디벨로켓 통합 스토어 (Supabase-ready abstraction)
   - 모든 데이터 R/W가 이 레이어를 통해 일어남
   - 현재 어댑터: localStorage (디바이스 단위 영속)
   - 추후 어댑터: Supabase (현재는 placeholder)
   - 이름은 Supabase 테이블/컬럼 명명과 1:1 매칭 → 마이그레이션 용이
     tables: students, daily_reports, jobs, comments, admin_meta
   ========================================================================== */
(function (global) {
  const KEY = 'develocket.v1';
  const ROSTER = global.STUDENT_ROSTER;

  /* ---------------- util ---------------- */
  const todayStr = (d = new Date()) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  /* ========================================================================
     공고 정렬 우선순위 (지난/탈락 공고 후순위)
     0순위(최우선): 활성 — 면접, 지원완료, 미지원 (단, 마감 전)
     1순위: 마감 임박/지남 활성 공고
     2순위: 합격 (완료된 좋은 결과)
     3순위(후순위): 불합격, 채용시 마감, 마감 후 미지원
     동순위 내부: 등록일 최신순
     ======================================================================== */
  function jobBucketOf(job) {
    const status = job.status || '미지원';
    const due = job.due_date;
    const today = todayStr();
    const isOverdue = due && due < today;

    // 후순위 (3): 명시적으로 종료/탈락된 공고
    if (status === '불합격' || status === '채용시 마감') return 3;
    // 후순위 (3): 마감 지났는데 아직 지원 안 한 공고
    if (isOverdue && status === '미지원') return 3;
    // 합격은 자랑하되 끝난 공고이므로 (2)
    if (status === '합격') return 2;
    // 마감 지났지만 진행 중(지원완료/면접)인 공고는 활성으로 유지 (1)
    if (isOverdue) return 1;
    // 활성 공고 (0)
    return 0;
  }
  function jobsSortByPriority(a, b) {
    const ba = jobBucketOf(a), bb = jobBucketOf(b);
    if (ba !== bb) return ba - bb;
    // 동순위: 등록일 최신순
    return (b.registered_at || '').localeCompare(a.registered_at || '');
  }
  const weekKey = (dateStr) => {
    // ISO-ish week key based on Monday start. Returns 'YYYY-Www'
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    // shift Sunday=0 to 7
    const day = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - day);
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
  };
  const daysBetween = (a, b) => {
    const A = new Date(a + 'T00:00:00'); const B = new Date(b + 'T00:00:00');
    return Math.round((B - A) / 86400000);
  };
  // 문서 종류 라벨 (알림 메시지 등에서 사용)
  const DOC_KIND_LABELS = { resume: '이력서', cover_letter: '자소서', portfolio: '포폴' };
  const docKindLabel = (k) => DOC_KIND_LABELS[k] || k || '문서';
  // 문서 상태 허용값 (학생: editing/review_requested, 관리자: revision/complete, 초기: none)
  const DOC_STATUSES = ['none', 'editing', 'review_requested', 'revision', 'complete'];

  /* ---------------- LocalStorage Adapter ---------------- */
  class LocalAdapter {
    constructor() {
      this._listeners = new Set();
      const raw = localStorage.getItem(KEY);
      let initial;
      try { initial = raw ? JSON.parse(raw) : null; } catch (e) { initial = null; }
      // Schema version check — 가능한 한 비파괴 마이그레이션, 불가 시에만 re-seed
      const CURRENT_VERSION = 6;
      if (initial && (!initial.admin_meta || initial.admin_meta.version !== CURRENT_VERSION)) {
        const v = (initial.admin_meta && initial.admin_meta.version) || 0;
        if (v >= 4) {
          // forward-only 마이그레이션: v4 이상은 기존 데이터 100% 보존하며 누적 적용
          // v4 -> v5: cohort_meta 보강
          if (v === 4) {
            initial.cohort_meta = initial.cohort_meta || {};
            Object.keys(ROSTER).forEach(id => {
              if (!initial.cohort_meta[id]) {
                initial.cohort_meta[id] = { archived_at: null, custom: false };
              }
            });
          }
          // v4/v5 -> v6: 건의사항 신규 컬렉션 보강
          if (v < 6) {
            initial.documents        = initial.documents        || [];
            initial.career_requests  = initial.career_requests  || [];
            initial.evaluations      = initial.evaluations      || [];
            initial.counseling       = initial.counseling       || [];
            initial.comment_reads    = initial.comment_reads    || [];
            initial.notif_dismissals = initial.notif_dismissals || [];
          }
          initial.admin_meta.version = CURRENT_VERSION;
        } else {
          // v<4 또는 admin_meta 없음: 안전 복구 불가 → 재시드 (기존 동작 유지)
          initial = null;
        }
      }
      this.db = initial || this._seed();
      this._syncRoster();
      this._save();
    }
    _writeLocal() {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.db));
        return true;
      } catch (e) {
        // QuotaExceededError: 대용량 base64 첨부(PDF) 등으로 5MB 한도 초과
        if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
          console.error('[store] localStorage 용량 초과 — 변경이 저장되지 않았습니다. 큰 첨부는 링크로 대체하세요.', e);
          if (typeof global.alert === 'function') {
            global.alert('저장 공간이 가득 찼습니다. 업로드한 파일이 너무 큽니다.\n큰 파일(PDF)은 구글드라이브 링크로 첨부해 주세요.');
          }
          return false;
        }
        throw e;
      }
    }
    _save() { this._writeLocal(); this._notify(); }
    _notify() { this._listeners.forEach(fn => { try { fn(); } catch (e) {} }); }
    onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
    _seed() {
      // Build initial students table from roster
      const students = [];
      Object.entries(ROSTER).forEach(([cohortId, c]) => {
        c.students.forEach(s => {
          students.push({
            id: uid('std'),
            cohort: cohortId,
            // Defaults for admin fields (in case roster doesn't have them)
            grade: '',
            career_goal: '',
            alt_employment: false,
            employment_status: '구직중',
            excluded_from_pool: false,
            drive_link: '',
            ...s
          });
        });
      });

      // Attendance seed: study_room + lectures
      const attendance = [];
      const seedAtt = global.ATTENDANCE_SEED || { study_room: {}, lectures: {} };
      ['study_room', 'lectures'].forEach(type => {
        Object.entries(seedAtt[type] || {}).forEach(([cohort, perStudent]) => {
          Object.entries(perStudent || {}).forEach(([name, dates]) => {
            const s = students.find(x => x.cohort === cohort && x.name === name);
            if (!s) return;
            (dates || []).forEach(date => {
              attendance.push({
                id: uid('att'),
                student_id: s.id,
                type,
                date,
                attended: true,
                memo: ''
              });
            });
          });
        });
      });

      // Sample daily reports — sprinkle activity so admin dashboard has signal
      const daily_reports = [];
      const today = new Date();
      const sample = (() => {
        // Pick ~60% of students to have at least one report.
        // Distribute "days since last report" so green/yellow/red all show.
        const distribute = (idx) => {
          // 0 days (today): every 5th, 1-2d: some, 3-5d: warn, 7-14d: danger, no entries: ~20%
          const r = (idx * 31) % 100;
          if (r < 35) return 0;          // today
          if (r < 55) return 1;          // yesterday
          if (r < 70) return 3;          // 3 days
          if (r < 85) return 7;          // a week
          if (r < 92) return 14;         // 2 weeks
          return null;                   // no reports
        };
        return distribute;
      })();

      const moods = ['😀', '🙂', '😐', '😅', '😴', '🔥', '😤', '🥱'];
      const goalSamples = {
        '기획3기': [
          ['포트폴리오 1차 시안 완성', '관심 회사 5개 공고 정리', '면접 답변 10개 작성'],
          ['게임 기획서 v2 마무리', '레퍼런스 게임 3개 분석', '자기소개서 다듬기']
        ],
        '프로그램3기': [
          ['Unity XR 인터랙션 프로토타입', '포트폴리오 README 정리', '알고리즘 5문제'],
          ['VR 인벤토리 시스템 구현', 'GitHub 커밋 매일 1개', '기술 면접 대비 30분/일']
        ]
      };

      students.forEach((s, i) => {
        const lastOffset = sample(i);
        if (lastOffset === null) return;

        const goals = goalSamples[s.cohort][i % goalSamples[s.cohort].length];
        // Create 1-3 historical reports leading up to lastOffset
        const count = Math.min(3, Math.floor((i % 4)) + 1);
        for (let k = 0; k < count; k++) {
          const d = new Date(today);
          d.setDate(d.getDate() - (lastOffset + k));
          const dateStr = todayStr(d);
          const statuses = ['in-progress', 'in-progress', 'done', 'not-started', 'blocked'];
          daily_reports.push({
            id: uid('rep'),
            student_id: s.id,
            date: dateStr,
            week_key: weekKey(dateStr),
            mood: moods[(i + k) % moods.length],
            today_done:    `### 오늘 한 일\n- ${goals[k % goals.length]} 관련 작업 진행\n- 강의 복습 및 노트 정리`,
            tomorrow_plan: `### 내일 할 일\n- ${goals[(k + 1) % goals.length]} 이어서 진행\n- 코드 리뷰 받기`,
            blockers:      k === 1 ? `**막힌 부분**: ${goals[2]} 에서 *기준점 잡기*가 어려움. 멘토님 도움 요청합니다 🙏` : '',
            weekly_goals:  goals.map((g, gi) => ({
              id: uid('wg'),
              text: g,
              status: ['in-progress', 'done', 'not-started'][(gi + k) % 3]
            })),
            status: statuses[(i + k) % statuses.length],
            attachments: k === 0 ? [
              { type: 'link', url: 'https://github.com/example/portfolio', label: 'GitHub' }
            ] : [],
            created_at: d.toISOString()
          });
        }
      });

      // Sample jobs per student (1-4)
      const jobs = [];
      const jobTitles = {
        '기획3기': [
          { title: '[여름 인턴십] 게임디자인(게임기획)', company: 'Pearl Abyss', role: '게임 기획 전반' },
          { title: '[Palworld Mobile] Contents Designer (경력 무관)', company: '크래프톤', role: '콘텐츠' },
          { title: '[트릭컬 리바이브] 시스템 및 콘텐츠 기획자 추가 채용', company: '에피드게임즈', role: '시스템, 콘텐츠' },
          { title: '[컴투스] 2026 컴투스그룹 인턴십 GENIUS 8th', company: '컴투스', role: '게임 기획 전반' },
          { title: '[ROUND8 스튜디오] P의 거짓 차기작 부문별 채용', company: '네오위즈', role: '게임 기획 전반' },
          { title: '[트릭컬 리바이브] 전투 및 밸런스 기획자 추가 채용', company: '에피드게임즈', role: '전투, 밸런스' },
          { title: '[넥슨] 메이플스토리 콘텐츠 기획자', company: '넥슨', role: '콘텐츠 기획' },
          { title: '[엔씨소프트] 신규 모바일 RPG 시스템 기획', company: 'NCSOFT', role: '시스템 기획' }
        ],
        '프로그램3기': [
          { title: '[Unity 개발자] XR 콘텐츠 인턴십', company: '스마일게이트', role: 'Unity / XR' },
          { title: '[엔진 프로그래머] 신입 채용', company: '크래프톤', role: '엔진 / 그래픽스' },
          { title: '[Unreal 5] 게임플레이 프로그래머', company: '넥슨', role: 'Unreal / Gameplay' },
          { title: '[VR 개발자] 콘텐츠 개발 인턴', company: '맥스트', role: 'XR / VR' },
          { title: '[클라이언트] 모바일 RPG 클라이언트 개발', company: '컴투스', role: 'Client' },
          { title: '[서버] 신작 MMORPG 서버 프로그래머', company: '엔씨소프트', role: 'Server' },
          { title: '[엔진] 자체 엔진 그래픽스 프로그래머', company: '데브시스터즈', role: 'Engine / GFX' },
          { title: '[Unity 클라이언트] 신입 공채', company: '카카오게임즈', role: 'Client' }
        ]
      };

      students.forEach((s, i) => {
        const list = jobTitles[s.cohort];
        const n = ((i * 7) % 4) + 1;
        const statuses = ['미지원', '지원완료', '면접', '미지원', '미지원', '지원완료', '채용시 마감'];
        for (let k = 0; k < n; k++) {
          const item = list[(i + k) % list.length];
          const regOffset = ((i + k) % 30) + 5;
          const regDate = new Date(today); regDate.setDate(regDate.getDate() - regOffset);
          const dueDate = new Date(regDate); dueDate.setDate(dueDate.getDate() + 14 + (k * 3));
          // 지원 예정일: 등록일 ~ 마감일 사이 임의 시점
          const planned = new Date(regDate); planned.setDate(planned.getDate() + 3 + ((i + k) % 7));
          jobs.push({
            id: uid('job'),
            student_id: s.id,
            title: item.title,
            company: item.company,
            role: item.role,
            status: statuses[(i + k) % statuses.length],
            interest: ((i + k * 3) % 10) + 1,
            registered_at: todayStr(regDate),
            updated_at: todayStr(regDate),
            planned_apply_date: todayStr(planned),
            due_date: todayStr(dueDate),
            keywords: [],
            portfolio_direction: '',
            url: '#',
            memo: ''
          });
        }
      });

      // Sample admin-to-student comments (for demo of bidirectional feedback)
      const comments = [];
      const sampleNotes = [
        { text: '## 🎉 잘하고 있어요!\n포트폴리오 방향성이 좋습니다. 다음 주에는 **구체 사례 2개**를 더 추가해보세요.', vis: 'both' },
        { text: '면접 답변 연습 영상 공유 부탁드려요. STAR 기법 위주로 다듬어 봅시다.', vis: 'both' },
        { text: '_지원한 회사 중 우선순위 정리해보면 좋겠어요._ 면접 대비 시간 분배에 도움이 됩니다.', vis: 'both' },
        { text: '내부 메모: 최근 출석률이 떨어짐. 1:1 면담 필요.', vis: 'admin-only' },
        { text: '> 막힌 부분 잘 정리해주셨어요.\n\n해당 부분은 멘토링 시간에 같이 봅시다 👍', vis: 'both' }
      ];
      students.forEach((s, i) => {
        // ~30% of students get a comment
        if ((i * 13) % 100 < 30) {
          const note = sampleNotes[i % sampleNotes.length];
          const offset = ((i * 3) % 7) + 1;
          const d = new Date(today); d.setDate(d.getDate() - offset);
          comments.push({
            id: uid('cm'),
            student_id: s.id,
            author: '관리자',
            author_role: 'admin',
            visibility: note.vis,
            text: note.text,
            parent_id: null,
            created_at: d.toISOString()
          });
        }
      });

      const cohort_meta = {};
      Object.keys(ROSTER).forEach(id => {
        cohort_meta[id] = { archived_at: null, custom: false };
      });

      return {
        students,
        daily_reports,
        jobs,
        comments,
        attendance,
        documents: [],
        career_requests: [],
        evaluations: [],
        counseling: [],
        comment_reads: [],
        notif_dismissals: [],
        mentoring_sessions: [],
        cohort_meta,
        admin_meta: { version: 6 }
      };
    }

    /* ===== cohorts =====
       기수 정보는 두 곳에서 옵니다:
       1) ROSTER (시드): 기존 정의된 기수 — 메타데이터는 ROSTER에 보존
       2) cohort_meta (런타임): archived_at, custom 신규 기수 정보
       3) custom 기수는 cohort_meta 안에 label/track/round/color 까지 같이 보관
    */
    _syncRoster() {
      // custom cohort → window.STUDENT_ROSTER 에 주입 (UI 호환 유지)
      const meta = this.db.cohort_meta || {};
      Object.entries(meta).forEach(([id, m]) => {
        if (m.custom && !global.STUDENT_ROSTER[id]) {
          global.STUDENT_ROSTER[id] = {
            label: m.label,
            track: m.track,
            round: m.round,
            color: m.color || '#7C5CFF',
            students: []
          };
        }
      });
    }
    listCohorts(opts = {}) {
      const includeArchived = !!opts.includeArchived;
      const onlyArchived = !!opts.onlyArchived;
      const includeHidden = opts.includeHidden !== false; // 기본 true (관리 화면)
      const meta = this.db.cohort_meta || {};
      const ids = new Set([...Object.keys(global.STUDENT_ROSTER), ...Object.keys(meta)]);
      const out = [];
      ids.forEach(id => {
        const m = meta[id] || { archived_at: null, custom: false, hidden: false, sort_order: 100 };
        const archived = !!m.archived_at;
        const hidden = !!m.hidden;
        if (onlyArchived && !archived) return;
        if (!includeArchived && !onlyArchived && archived) return;
        if (!includeHidden && hidden) return;
        const r = global.STUDENT_ROSTER[id];
        if (!r) return;
        out.push({
          id,
          label: r.label,
          track: r.track,
          round: r.round,
          color: r.color,
          archived_at: m.archived_at || null,
          custom: !!m.custom,
          hidden,
          sort_order: typeof m.sort_order === 'number' ? m.sort_order : 100,
          studentCount: this.db.students.filter(s => s.cohort === id).length
        });
      });
      // sort_order 오름차순 → 동일하면 label 기준
      out.sort((a, b) => (a.sort_order - b.sort_order) || a.label.localeCompare(b.label, 'ko'));
      return out;
    }
    getCohort(id) {
      const r = global.STUDENT_ROSTER[id];
      if (!r) return null;
      const m = (this.db.cohort_meta || {})[id] || {};
      return {
        id,
        label: r.label,
        track: r.track,
        round: r.round,
        color: r.color,
        archived_at: m.archived_at || null,
        custom: !!m.custom
      };
    }
    archiveCohort(id) {
      if (!this.db.cohort_meta) this.db.cohort_meta = {};
      if (!this.db.cohort_meta[id]) this.db.cohort_meta[id] = { custom: false };
      this.db.cohort_meta[id].archived_at = new Date().toISOString();
      this._save();
    }
    restoreCohort(id) {
      if (!this.db.cohort_meta) this.db.cohort_meta = {};
      if (!this.db.cohort_meta[id]) this.db.cohort_meta[id] = { custom: false };
      this.db.cohort_meta[id].archived_at = null;
      this._save();
    }
    createCohort(payload) {
      const id = (payload.id || '').trim();
      if (!id) throw new Error('기수 ID가 필요합니다');
      if (global.STUDENT_ROSTER[id]) throw new Error('이미 존재하는 기수 ID 입니다');
      const cohort = {
        label: payload.label || id,
        track: payload.track || '',
        round: payload.round || '',
        color: payload.color || '#7C5CFF',
        students: []
      };
      global.STUDENT_ROSTER[id] = cohort;
      if (!this.db.cohort_meta) this.db.cohort_meta = {};
      // 새 기수는 가장 뒤로 배치 (현재 최대 sort_order + 10)
      const allOrders = Object.values(this.db.cohort_meta).map(m => m.sort_order || 0);
      const nextOrder = (allOrders.length ? Math.max(...allOrders) : 0) + 10;
      this.db.cohort_meta[id] = {
        archived_at: null,
        custom: true,
        label: cohort.label,
        track: cohort.track,
        round: cohort.round,
        color: cohort.color,
        sort_order: nextOrder,
        hidden: false,
        created_at: new Date().toISOString()
      };
      this._save();
      return { id, ...cohort };
    }
    updateCohort(id, patch) {
      const r = global.STUDENT_ROSTER[id];
      if (!r) return;
      ['label', 'track', 'round', 'color'].forEach(k => {
        if (k in patch) r[k] = patch[k];
      });
      if (!this.db.cohort_meta) this.db.cohort_meta = {};
      if (!this.db.cohort_meta[id]) this.db.cohort_meta[id] = { archived_at: null, custom: false };
      ['label', 'track', 'round', 'color'].forEach(k => {
        if (k in patch && this.db.cohort_meta[id].custom) this.db.cohort_meta[id][k] = patch[k];
      });
      this._save();
    }
    /* ===== 노출 여부 토글 (archived와 별개) ===== */
    setCohortHidden(id, hidden) {
      if (!this.db.cohort_meta) this.db.cohort_meta = {};
      if (!this.db.cohort_meta[id]) this.db.cohort_meta[id] = { archived_at: null, custom: false };
      this.db.cohort_meta[id].hidden = !!hidden;
      this._save();
    }
    /* ===== 순서 변경 ===== */
    setCohortOrder(id, sortOrder) {
      if (!this.db.cohort_meta) this.db.cohort_meta = {};
      if (!this.db.cohort_meta[id]) this.db.cohort_meta[id] = { archived_at: null, custom: false };
      this.db.cohort_meta[id].sort_order = sortOrder;
      this._save();
    }
    /* 현재 활성 기수들 사이에서 한 기수를 위/아래로 한 칸 이동 (Supabase / LocalStorage 공통 로직) */
    moveCohort(id, direction) {
      const list = this.listCohorts({ includeArchived: false, includeHidden: true });
      const idx = list.findIndex(c => c.id === id);
      if (idx < 0) return null;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= list.length) return null;
      const me = list[idx];
      const other = list[targetIdx];
      // swap sort_order
      const myOrder = me.sort_order;
      const otherOrder = other.sort_order;
      this.setCohortOrder(me.id, otherOrder);
      this.setCohortOrder(other.id, myOrder);
      return { moved: me.id, swappedWith: other.id, newOrder: otherOrder, otherNewOrder: myOrder };
    }

    /* ===== students ===== */
    listStudents(cohort) {
      const all = this.db.students.slice();
      const list = cohort ? all.filter(s => s.cohort === cohort) : all;
      return list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    }
    getStudent(id) { return this.db.students.find(s => s.id === id); }
    getStudentByCohortName(cohort, name) {
      return this.db.students.find(s => s.cohort === cohort && s.name === name);
    }

    /* ===== student passwords =====
       PoC: 평문 저장. 운영 시 Supabase Auth 또는 bcrypt 사용 권장
    */
    hasStudentPassword(studentId) {
      const s = this.getStudent(studentId);
      return !!(s && s.password);
    }
    getStudentPassword(studentId) {
      const s = this.getStudent(studentId);
      return s ? (s.password || null) : null;
    }
    verifyStudentPassword(studentId, password) {
      const s = this.getStudent(studentId);
      if (!s) return false;
      return s.password === password;
    }
    setStudentPassword(studentId, password) {
      const s = this.getStudent(studentId);
      if (!s) return false;
      s.password = password;
      s.password_updated_at = new Date().toISOString();
      this._save();
      return true;
    }

    /* ===== daily reports ===== */
    listReports(studentId) {
      return this.db.daily_reports
        .filter(r => r.student_id === studentId)
        .sort((a, b) => b.date.localeCompare(a.date));
    }
    getTodayReport(studentId) {
      const today = todayStr();
      return this.db.daily_reports.find(r => r.student_id === studentId && r.date === today);
    }
    upsertReport(studentId, patch) {
      const date = patch.date || todayStr();
      let existing = this.db.daily_reports.find(r => r.student_id === studentId && r.date === date);
      if (existing) {
        Object.assign(existing, patch, { updated_at: new Date().toISOString() });
      } else {
        existing = {
          id: uid('rep'),
          student_id: studentId,
          date,
          week_key: weekKey(date),
          mood: '🙂',
          today_done: '',
          tomorrow_plan: '',
          blockers: '',
          weekly_goals: [],
          status: 'in-progress',
          attachments: [],
          created_at: new Date().toISOString(),
          ...patch
        };
        this.db.daily_reports.push(existing);
      }
      this._save();
      return existing;
    }
    deleteReport(reportId) {
      this.db.daily_reports = this.db.daily_reports.filter(r => r.id !== reportId);
      this._save();
    }

    /* Find weekly goals for a student in a given week (carries forward from latest report in that week, fallback to most-recent in last week) */
    getWeeklyGoalsContext(studentId, dateStr = todayStr()) {
      const wk = weekKey(dateStr);
      const inWeek = this.db.daily_reports
        .filter(r => r.student_id === studentId && r.week_key === wk)
        .sort((a, b) => b.date.localeCompare(a.date));
      if (inWeek.length && inWeek[0].weekly_goals?.length) return inWeek[0].weekly_goals;
      // fallback: latest report's goals
      const latest = this.listReports(studentId)[0];
      return latest?.weekly_goals ? latest.weekly_goals.map(g => ({ ...g, status: 'not-started' })) : [];
    }

    /* ===== jobs ===== */
    listJobs(studentId) {
      return this.db.jobs
        .filter(j => j.student_id === studentId)
        .sort(jobsSortByPriority);
    }
    upsertJob(job) {
      let existing = this.db.jobs.find(j => j.id === job.id);
      if (existing) {
        const updated = { ...existing, ...job, updated_at: todayStr() };
        const idx = this.db.jobs.findIndex(j => j.id === existing.id);
        this.db.jobs = [...this.db.jobs.slice(0, idx), updated, ...this.db.jobs.slice(idx + 1)];
      } else {
        this.db.jobs = [...this.db.jobs, {
          id: uid('job'),
          updated_at: todayStr(),
          keywords: [],
          portfolio_direction: '',
          ...job
        }];
      }
      this._save();
    }
    deleteJob(jobId) {
      this.db.jobs = this.db.jobs.filter(j => j.id !== jobId);
      this._save();
    }

    /* ===== comments (visibility: 'admin-only' | 'student-only' | 'both') ===== */
    listComments(studentId, opts = {}) {
      let all = this.db.comments
        .filter(c => c.student_id === studentId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      if (opts.viewerRole === 'student') {
        all = all.filter(c => c.visibility === 'both' || c.visibility === 'student-only');
      }
      if (opts.order === 'desc') all = all.slice().reverse();   // 최신순
      return all;
    }
    addComment(studentId, author, text, opts = {}) {
      const c = {
        id: uid('cm'),
        student_id: studentId,
        author,
        author_role: opts.role || 'admin',
        visibility: opts.visibility || 'both',
        text,
        parent_id: opts.parentId || null,
        created_at: new Date().toISOString()
      };
      this.db.comments.push(c);
      this._save();
      return c;
    }
    updateComment(id, patch) {
      const c = this.db.comments.find(x => x.id === id);
      if (c) Object.assign(c, patch);
      this._save();
    }
    deleteComment(id) {
      this.db.comments = this.db.comments.filter(c => c.id !== id);
      this._save();
    }

    /* ===== [D] comment read receipts (양방향 읽음) ===== */
    getCommentReadState(studentId) {
      const r = (this.db.comment_reads || []).find(x => x.student_id === studentId);
      // 내부 참조 노출 방지 — 복사본 반환
      return r ? { ...r } : { student_id: studentId, admin_read_at: null, student_read_at: null };
    }
    markCommentsRead(studentId, role) {
      if (!this.db.comment_reads) this.db.comment_reads = [];
      let r = this.db.comment_reads.find(x => x.student_id === studentId);
      if (!r) { r = { student_id: studentId, admin_read_at: null, student_read_at: null }; this.db.comment_reads.push(r); }
      const now = new Date().toISOString();
      if (role === 'admin') r.admin_read_at = now; else r.student_read_at = now;
      this._save();
      return r;
    }
    getUnreadCommentCount(studentId, role) {
      const state = this.getCommentReadState(studentId);
      const otherRole = role === 'admin' ? 'student' : 'admin';
      const cursor = role === 'admin' ? state.admin_read_at : state.student_read_at;
      return (this.db.comments || []).filter(c =>
        c.student_id === studentId &&
        c.author_role === otherRole &&
        (!cursor || c.created_at > cursor) &&
        (role === 'admin' || c.visibility === 'both' || c.visibility === 'student-only')
      ).length;
    }

    /* ===== [A] documents (이력서/자소서/포폴) ===== */
    listDocuments(studentId) {
      return (this.db.documents || [])
        .filter(d => d.student_id === studentId)
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    }
    upsertDocument(doc) {
      if (!this.db.documents) this.db.documents = [];
      const now = new Date().toISOString();
      const existing = doc.id ? this.db.documents.find(d => d.id === doc.id) : null;
      if (existing) {
        Object.assign(existing, doc, { updated_at: now });
        this._save();
        return existing;
      }
      const created = {
        id: doc.id || uid('doc'),
        student_id: doc.student_id,
        kind: doc.kind || 'resume',
        title: doc.title || '',
        link: doc.link || '',
        file_url: doc.file_url || '',
        file_name: doc.file_name || '',
        status: DOC_STATUSES.includes(doc.status) ? doc.status : 'none',
        created_at: now,
        updated_at: now
      };
      this.db.documents.push(created);
      this._save();
      return created;
    }
    deleteDocument(id) {
      this.db.documents = (this.db.documents || []).filter(d => d.id !== id);
      this._save();
    }
    setDocumentStatus(id, status) {
      if (!DOC_STATUSES.includes(status)) return;   // 허용된 상태값만(가비지/우회 방지)
      const d = (this.db.documents || []).find(x => x.id === id);
      if (d) { d.status = status; d.updated_at = new Date().toISOString(); this._save(); }
      return d;
    }
    // Local/Gist: 파일을 base64 dataURL 로 인라인 저장 (≤1.5MB, 초과 시 throw → 링크 유도)
    async uploadDocumentFile(studentId, file) {
      const MAX = 1.5 * 1024 * 1024;
      if (file.size > MAX) {
        throw new Error(`파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). 1.5MB 이하만 업로드 가능합니다. 큰 파일은 구글드라이브 링크를 사용하세요.`);
      }
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(new Error('파일을 읽을 수 없습니다'));
        fr.readAsDataURL(file);
      });
      return { file_url: dataUrl, file_name: file.name };
    }

    /* ===== [A] admin notifications (derive — 저장하지 않음) ===== */
    getAdminNotifications() {
      const dismissed = new Set((this.db.notif_dismissals || []).map(d => d.id));
      const nameOf = (id) => { const s = this.getStudent(id); return s ? s.name : '(알 수 없음)'; };
      const readMap = {};
      (this.db.comment_reads || []).forEach(r => { readMap[r.student_id] = r; });
      const out = [];
      // 1) 미읽음 학생 코멘트
      (this.db.comments || []).forEach(c => {
        if (c.author_role !== 'student') return;
        const cur = readMap[c.student_id];
        if (cur && cur.admin_read_at && c.created_at <= cur.admin_read_at) return;
        const id = `comment:${c.id}`;
        if (dismissed.has(id)) return;
        out.push({ id, type: 'comment', student_id: c.student_id, student_name: nameOf(c.student_id), message: c.text, created_at: c.created_at });
      });
      // 2) 검토요청 문서
      (this.db.documents || []).forEach(d => {
        if (d.status !== 'review_requested') return;
        const id = `doc_review:${d.id}:${d.updated_at || ''}`;
        if (dismissed.has(id)) return;
        out.push({ id, type: 'doc_review', student_id: d.student_id, student_name: nameOf(d.student_id), message: `${docKindLabel(d.kind)} 검토 요청: ${d.title || ''}`, created_at: d.updated_at || d.created_at });
      });
      // 3) pending 희망직군 변경 요청
      (this.db.career_requests || []).forEach(r => {
        if (r.status !== 'pending') return;
        const id = `career_change:${r.id}`;
        if (dismissed.has(id)) return;
        out.push({ id, type: 'career_change', student_id: r.student_id, student_name: nameOf(r.student_id), message: `희망직군 변경 승인 요청: ${(r.choices || []).filter(Boolean).join(' → ')}`, created_at: r.requested_at });
      });
      out.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      return out;
    }
    dismissNotification(synthId) {
      if (!this.db.notif_dismissals) this.db.notif_dismissals = [];
      if (!this.db.notif_dismissals.some(d => d.id === synthId)) {
        this.db.notif_dismissals.push({ id: synthId, dismissed_at: new Date().toISOString() });
        this._save();
      }
    }

    /* ===== [B] career preference (희망직군 지망 + 승인) ===== */
    getCareerPref(studentId) {
      const s = this.getStudent(studentId);
      // 내부 참조 노출 방지 — 복사본 반환
      return (s && s.job_pref) ? { ...s.job_pref } : null;
    }
    setCareerPref(studentId, choices) {
      const s = this.getStudent(studentId);
      if (!s) return { error: 'no-student' };
      const clean = (choices || []).map(c => (c || '').trim()).filter(Boolean);
      const now = new Date().toISOString();
      // 최초 선택(승인된 값 없음) → 즉시 적용
      if (!s.job_pref || !Array.isArray(s.job_pref.choices) || s.job_pref.choices.length === 0) {
        s.job_pref = { choices: clean, approved_at: now };
        this._save();
        return { applied: true };
      }
      // 변경 → pending 요청 (기존 pending 대체)
      if (!this.db.career_requests) this.db.career_requests = [];
      this.db.career_requests = this.db.career_requests.filter(r => !(r.student_id === studentId && r.status === 'pending'));
      this.db.career_requests.push({ id: uid('ccr'), student_id: studentId, choices: clean, status: 'pending', requested_at: now, decided_at: null, decided_by: null });
      this._save();
      return { pending: true };
    }
    listCareerRequests(opts = {}) {
      let list = (this.db.career_requests || []).slice();
      if (opts.status) list = list.filter(r => r.status === opts.status);
      if (opts.studentId) list = list.filter(r => r.student_id === opts.studentId);
      return list.sort((a, b) => (b.requested_at || '').localeCompare(a.requested_at || ''));
    }
    decideCareerRequest(reqId, approve, decidedBy = '관리자') {
      const r = (this.db.career_requests || []).find(x => x.id === reqId);
      if (!r) return;
      r.status = approve ? 'approved' : 'rejected';
      r.decided_at = new Date().toISOString();
      r.decided_by = decidedBy;
      if (approve) {
        const s = this.getStudent(r.student_id);
        if (s) s.job_pref = { choices: r.choices, approved_at: r.decided_at };
      }
      this._save();
      return r;
    }

    /* ===== [B] evaluations (훈련생 평가 — 관리자 전용, 학생 비공개) ===== */
    listEvaluations(studentId) {
      return (this.db.evaluations || [])
        .filter(e => e.student_id === studentId)
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    }
    upsertEvaluation(ev) {
      if (!this.db.evaluations) this.db.evaluations = [];
      const now = new Date().toISOString();
      const existing = ev.id ? this.db.evaluations.find(e => e.id === ev.id) : null;
      if (existing) { Object.assign(existing, ev, { updated_at: now }); this._save(); return existing; }
      const created = { id: uid('eval'), student_id: ev.student_id, evaluator: ev.evaluator || '', goal: ev.goal || '', content: ev.content || '', score: ev.score ?? null, created_at: now, updated_at: now };
      this.db.evaluations.push(created);
      this._save();
      return created;
    }
    deleteEvaluation(id) {
      this.db.evaluations = (this.db.evaluations || []).filter(e => e.id !== id);
      this._save();
    }

    /* ===== [B] counseling (취업면담 이력 — 관리자 전용, 학생 비공개) ===== */
    listCounseling(studentId) {
      return (this.db.counseling || [])
        .filter(c => c.student_id === studentId)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }
    addCounseling(c) {
      if (!this.db.counseling) this.db.counseling = [];
      const created = { id: uid('cns'), student_id: c.student_id, date: c.date || todayStr(), counselor: c.counselor || '', content: c.content || '', created_at: new Date().toISOString() };
      this.db.counseling.push(created);
      this._save();
      return created;
    }
    deleteCounseling(id) {
      this.db.counseling = (this.db.counseling || []).filter(c => c.id !== id);
      this._save();
    }

    /* ===== [C] interview rounds + funnel ===== */
    setInterviewRound(jobId, round) {
      const j = this.db.jobs.find(x => x.id === jobId);
      if (!j) return;
      if (!Array.isArray(j.interview_rounds)) j.interview_rounds = [];
      const entry = { round: round.round, date: round.date || '', status: round.status || '대기', memo: round.memo || '' };
      const i = j.interview_rounds.findIndex(r => r.round === round.round);
      if (i >= 0) j.interview_rounds[i] = entry; else j.interview_rounds.push(entry);
      j.updated_at = todayStr();
      this._save();
      return j;
    }
    removeInterviewRound(jobId, roundKey) {
      const j = this.db.jobs.find(x => x.id === jobId);
      if (!j || !Array.isArray(j.interview_rounds)) return;
      j.interview_rounds = j.interview_rounds.filter(r => r.round !== roundKey);
      j.updated_at = todayStr();
      this._save();
      return j;
    }
    listInterviewJobs(cohort) {
      const ids = new Set(this.listStudents(cohort).map(s => s.id));
      return this.db.jobs.filter(j =>
        ids.has(j.student_id) &&
        ((Array.isArray(j.interview_rounds) && j.interview_rounds.length > 0) || j.status === '면접' || j.pipeline_stage === '면접')
      );
    }
    getJobFunnel(cohort) {
      const ids = new Set(this.listStudents(cohort).map(s => s.id));
      const jobs = this.db.jobs.filter(j => ids.has(j.student_id));
      const hasRounds = (j) => Array.isArray(j.interview_rounds) && j.interview_rounds.length > 0;
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

    /* ===== admin computed views ===== */
    getDashboardRows(cohort) {
      const students = this.listStudents(cohort);
      const today = todayStr();
      return students.map(s => {
        const reports = this.listReports(s.id);
        const last = reports[0];
        const elapsed = last ? daysBetween(last.date, today) : null;
        const todayDone = last && last.date === today;
        const goals = this.getWeeklyGoalsContext(s.id);
        const done = goals.filter(g => g.status === 'done').length;
        const goalPct = goals.length ? Math.round((done / goals.length) * 100) : 0;
        const jobs = this.listJobs(s.id);
        const applied = jobs.filter(j => j.status === '지원완료' || j.status === '면접').length;
        const interviewing = jobs.filter(j => j.status === '면접').length;
        // 지원 예정일이 지났는데 아직 미지원 상태인 공고
        const overduePlanned = jobs.filter(j =>
          j.planned_apply_date &&
          j.status === '미지원' &&
          daysBetween(today, j.planned_apply_date) < 0
        );
        const upcomingPlanned = jobs.filter(j =>
          j.planned_apply_date &&
          j.status === '미지원' &&
          daysBetween(today, j.planned_apply_date) >= 0 &&
          daysBetween(today, j.planned_apply_date) <= 3
        );
        return {
          student: s,
          lastReportDate: last?.date || null,
          lastStatus: last?.status || null,
          lastMood: last?.mood || null,
          elapsed,
          todayDone,
          weeklyGoals: goals,
          weeklyGoalPct: goalPct,
          jobCount: jobs.length,
          appliedCount: applied,
          interviewingCount: interviewing,
          overduePlannedCount: overduePlanned.length,
          overduePlanned,
          upcomingPlannedCount: upcomingPlanned.length,
          commentCount: this.listComments(s.id).length
        };
      });
    }

    /* ===== student admin fields (등급, 진로, 취업 등) ===== */
    updateStudentFields(id, patch) {
      const s = this.getStudent(id);
      if (!s) return;
      const allowed = ['grade', 'career_goal', 'alt_employment', 'employment_status', 'excluded_from_pool', 'drive_link'];
      allowed.forEach(k => { if (k in patch) s[k] = patch[k]; });
      this._save();
    }

    /* ===== students: 추가 / 수정 / 삭제 (관리자 전용) ===== */
    addStudent(cohort, payload) {
      const s = {
        id: uid('std'),
        cohort,
        name: '',
        age: null,
        gender: 'M',
        birthDate: '',
        phone: '',
        addr1: '',
        addr2: '',
        email: '',
        course: ROSTER[cohort]?.track || '',
        education: '',
        grade: '',
        career_goal: '',
        alt_employment: false,
        employment_status: '구직중',
        excluded_from_pool: false,
        drive_link: '',
        ...payload
      };
      this.db.students.push(s);
      this._save();
      return s;
    }
    updateStudent(id, patch) {
      const s = this.getStudent(id);
      if (!s) return;
      // Don't allow id change
      const { id: _, ...rest } = patch;
      Object.assign(s, rest);
      this._save();
    }
    deleteStudent(id) {
      // 연관 데이터까지 함께 삭제
      this.db.students = this.db.students.filter(s => s.id !== id);
      this.db.daily_reports = this.db.daily_reports.filter(r => r.student_id !== id);
      this.db.jobs = this.db.jobs.filter(j => j.student_id !== id);
      this.db.comments = this.db.comments.filter(c => c.student_id !== id);
      if (this.db.attendance) {
        this.db.attendance = this.db.attendance.filter(a => a.student_id !== id);
      }
      // 2026-06 신규 컬렉션도 정리
      this.db.documents       = (this.db.documents || []).filter(d => d.student_id !== id);
      this.db.career_requests = (this.db.career_requests || []).filter(r => r.student_id !== id);
      this.db.evaluations     = (this.db.evaluations || []).filter(e => e.student_id !== id);
      this.db.counseling      = (this.db.counseling || []).filter(c => c.student_id !== id);
      this.db.comment_reads   = (this.db.comment_reads || []).filter(r => r.student_id !== id);
      this._save();
    }

    /* ===== attendance (자습실 + 특강) ===== */
    listAttendance(opts = {}) {
      let list = this.db.attendance || [];
      if (opts.studentId) list = list.filter(a => a.student_id === opts.studentId);
      if (opts.type) list = list.filter(a => a.type === opts.type);
      if (opts.cohort) {
        const ids = new Set(this.listStudents(opts.cohort).map(s => s.id));
        list = list.filter(a => ids.has(a.student_id));
      }
      if (opts.date) list = list.filter(a => a.date === opts.date);
      return list.slice();
    }
    getAttendance(studentId, type, date) {
      return (this.db.attendance || []).find(a =>
        a.student_id === studentId && a.type === type && a.date === date
      );
    }
    setAttendance(studentId, type, date, attended, memo = '') {
      if (!this.db.attendance) this.db.attendance = [];
      const existing = this.getAttendance(studentId, type, date);
      if (attended === false || attended === null) {
        // remove
        if (existing) this.db.attendance = this.db.attendance.filter(a => a.id !== existing.id);
      } else if (existing) {
        existing.attended = attended;
        existing.memo = memo;
      } else {
        this.db.attendance.push({
          id: uid('att'),
          student_id: studentId,
          type, date,
          attended: true,
          memo
        });
      }
      this._save();
    }
    countAttendance(studentId, type) {
      return (this.db.attendance || []).filter(a =>
        a.student_id === studentId && a.type === type && a.attended
      ).length;
    }

    /* ===== 멘토링 세션 (캘린더 기반) ===== */
    listMentoring(opts = {}) {
      let list = (this.db.mentoring_sessions || []).slice();
      if (opts.studentId) list = list.filter(m => m.student_id === opts.studentId);
      if (opts.cohort) {
        const ids = new Set(this.listStudents(opts.cohort).map(s => s.id));
        list = list.filter(m => ids.has(m.student_id));
      }
      if (opts.from) list = list.filter(m => m.scheduled_at >= opts.from);
      if (opts.to) list = list.filter(m => m.scheduled_at <= opts.to);
      if (opts.status) list = list.filter(m => m.status === opts.status);
      list.sort((a, b) => (a.scheduled_at || '').localeCompare(b.scheduled_at || ''));
      return list;
    }
    upsertMentoring(payload) {
      if (!this.db.mentoring_sessions) this.db.mentoring_sessions = [];
      const id = payload.id || uid('mt');
      const idx = this.db.mentoring_sessions.findIndex(m => m.id === id);
      const row = {
        id,
        student_id: payload.student_id,
        scheduled_at: payload.scheduled_at,
        duration_min: payload.duration_min ?? 30,
        topic: payload.topic || '',
        location: payload.location || '',
        mentor: payload.mentor || '관리자',
        status: payload.status || 'scheduled',
        admin_notes: payload.admin_notes || '',
        student_notes: payload.student_notes || '',
        student_notes_updated_at: payload.student_notes_updated_at || null,
        created_by: payload.created_by || 'admin',
        created_at: payload.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      if (idx >= 0) this.db.mentoring_sessions[idx] = row;
      else this.db.mentoring_sessions.push(row);
      this._save();
      return row;
    }
    deleteMentoring(id) {
      if (!this.db.mentoring_sessions) return;
      this.db.mentoring_sessions = this.db.mentoring_sessions.filter(m => m.id !== id);
      this._save();
    }
    updateMentoringStudentNotes(id, notes) {
      if (!this.db.mentoring_sessions) return;
      const m = this.db.mentoring_sessions.find(x => x.id === id);
      if (!m) return;
      m.student_notes = notes || '';
      m.student_notes_updated_at = new Date().toISOString();
      m.updated_at = m.student_notes_updated_at;
      this._save();
    }

    /* ===== KPI computations ===== */
    getEmploymentStats(cohort) {
      // 모수: cohort 학생 중 excluded_from_pool=false
      const all = this.listStudents(cohort);
      const pool = all.filter(s => !s.excluded_from_pool);
      const employed = pool.filter(s =>
        s.employment_status && ['직종 취업', '알바', '창업'].includes(s.employment_status)
      );
      // 등급 분포 (관리자 전용)
      const gradeDist = {};
      ['A','B','C','D','조기수료','미분류'].forEach(g => { gradeDist[g] = 0; });
      pool.forEach(s => {
        const g = s.grade || '미분류';
        gradeDist[g] = (gradeDist[g] || 0) + 1;
      });
      // 취업 형태 분포
      const empDist = {};
      ['구직중','직종 취업','알바','창업','미응시','연락두절','기타'].forEach(e => { empDist[e] = 0; });
      pool.forEach(s => {
        const e = s.employment_status || '구직중';
        empDist[e] = (empDist[e] || 0) + 1;
      });
      return {
        total: all.length,
        pool_size: pool.length,
        excluded: all.length - pool.length,
        employed_count: employed.length,
        employment_rate: pool.length === 0 ? 0 : (employed.length / pool.length),
        grade_dist: gradeDist,
        emp_dist: empDist
      };
    }

    /* ===== reset (debug) ===== */
    resetAll() {
      localStorage.removeItem(KEY);
      this.db = this._seed();
      this._save();
    }
  }

  /* ---------------- Supabase Adapter ----------------
     dl_ 접두사 테이블 사용:
     - dl_cohorts, dl_students, dl_daily_reports, dl_jobs, dl_comments, dl_attendance
     컬럼 매핑: birth_date <-> birthDate (UI 호환)
  ------------------------------------------------- */
  const SB_TABLES = {
    cohorts: 'dl_cohorts',
    students: 'dl_students',
    daily_reports: 'dl_daily_reports',
    jobs: 'dl_jobs',
    comments: 'dl_comments',
    attendance: 'dl_attendance',
    // 2026-06 건의사항 신규 테이블
    documents: 'dl_documents',
    career_requests: 'dl_career_change_requests',
    evaluations: 'dl_evaluations',
    counseling: 'dl_counseling',
    comment_reads: 'dl_comment_reads',
    notif_dismissals: 'dl_notification_dismissals',
    // 캘린더 기반 멘토링 (신규)
    mentoring_sessions: 'dl_mentoring_sessions'
  };
  // DB row → UI student
  function fromDbStudent(r) {
    if (!r) return r;
    return {
      ...r,
      birthDate: r.birth_date || ''  // UI alias
    };
  }
  function toDbStudent(s) {
    const out = { ...s };
    if ('birthDate' in out) {
      out.birth_date = out.birthDate;
      delete out.birthDate;
    }
    return out;
  }

  class SupabaseAdapter {
    constructor(client) {
      this.client = client;
      this._listeners = new Set();
      this.db = {
        students: [], daily_reports: [], jobs: [], comments: [],
        attendance: [],
        // 2026-06 건의사항 신규 컬렉션
        documents: [], career_requests: [], evaluations: [],
        counseling: [], comment_reads: [], notif_dismissals: [],
        mentoring_sessions: [],
        cohort_meta: {}, admin_meta: {}
      };
      this.ready = this._bootstrap();
    }
    async _bootstrap() {
      const [cohorts, students, reports, jobs, comments, attendance,
             documents, careerReqs, evaluations, counseling, commentReads, notifDismissals,
             mentoring] = await Promise.all([
        this.client.from(SB_TABLES.cohorts).select('*'),
        this.client.from(SB_TABLES.students).select('*'),
        this.client.from(SB_TABLES.daily_reports).select('*'),
        this.client.from(SB_TABLES.jobs).select('*'),
        this.client.from(SB_TABLES.comments).select('*'),
        this.client.from(SB_TABLES.attendance).select('*'),
        // 2026-06 건의사항 신규 테이블 (마이그레이션 전이면 error → 빈 배열로 graceful)
        this.client.from(SB_TABLES.documents).select('*'),
        this.client.from(SB_TABLES.career_requests).select('*'),
        this.client.from(SB_TABLES.evaluations).select('*'),
        this.client.from(SB_TABLES.counseling).select('*'),
        this.client.from(SB_TABLES.comment_reads).select('*'),
        this.client.from(SB_TABLES.notif_dismissals).select('*'),
        // 캘린더 기반 멘토링 (신규)
        this.client.from(SB_TABLES.mentoring_sessions).select('*')
      ]);
      this.db.students      = (students.data || []).map(fromDbStudent);
      this.db.daily_reports = reports.data  || [];
      this.db.jobs          = jobs.data     || [];
      this.db.comments      = comments.data || [];
      this.db.attendance    = attendance.data || [];
      this.db.documents        = documents.data       || [];
      this.db.career_requests  = careerReqs.data      || [];
      this.db.evaluations      = evaluations.data     || [];
      this.db.counseling       = counseling.data      || [];
      this.db.comment_reads    = commentReads.data    || [];
      this.db.notif_dismissals = notifDismissals.data || [];
      this.db.mentoring_sessions = mentoring.data || [];

      // cohort_meta: dl_cohorts → STUDENT_ROSTER 갱신 (기존 시드에 없는 cohort 등록)
      (cohorts.data || []).forEach(c => {
        global.STUDENT_ROSTER[c.id] = global.STUDENT_ROSTER[c.id] || {
          label: c.label, track: c.track || '', round: c.round || '',
          color: c.color || '#7C5CFF', students: []
        };
        // 라벨 등은 DB 값으로 덮어쓰기
        Object.assign(global.STUDENT_ROSTER[c.id], {
          label: c.label, track: c.track || global.STUDENT_ROSTER[c.id].track,
          round: c.round || global.STUDENT_ROSTER[c.id].round,
          color: c.color || global.STUDENT_ROSTER[c.id].color
        });
        this.db.cohort_meta[c.id] = {
          archived_at: c.archived_at, custom: !!c.custom,
          label: c.label, track: c.track, round: c.round, color: c.color,
          // 신규: 표기 순서 + 노출 여부 (column이 없는 구버전 DB도 호환)
          sort_order: typeof c.sort_order === 'number' ? c.sort_order : 100,
          hidden: !!c.hidden
        };
      });

      // Realtime: 변경 발생 시 db 갱신
      Object.entries(SB_TABLES).forEach(([key, table]) => {
        this.client.channel(`rt_${table}`)
          .on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
            if (key === 'cohorts') { this._applyCohortChange(payload); this._notify(); return; }
            // comment_reads 는 student_id 가 PK(id 컬럼 없음) → 별도 처리
            if (key === 'comment_reads') { this._applyCommentReadChange(payload); this._notify(); return; }
            const rows = this.db[key];
            if (!rows) return;
            const newRow = key === 'students' ? fromDbStudent(payload.new) : payload.new;
            if (payload.eventType === 'INSERT') {
              // 낙관적 push + realtime echo 로 인한 중복 방지
              if (!rows.some(r => r.id === newRow.id)) rows.push(newRow);
            } else if (payload.eventType === 'UPDATE') {
              const i = rows.findIndex(r => r.id === newRow.id);
              if (i >= 0) rows[i] = newRow;
            } else if (payload.eventType === 'DELETE') {
              this.db[key] = rows.filter(r => r.id !== payload.old.id);
            }
            this._notify();
          }).subscribe();
      });
      this._notify();
    }
    _applyCommentReadChange(payload) {
      const rows = this.db.comment_reads || (this.db.comment_reads = []);
      if (payload.eventType === 'DELETE') {
        this.db.comment_reads = rows.filter(r => r.student_id !== payload.old.student_id);
        return;
      }
      const row = payload.new;
      const i = rows.findIndex(r => r.student_id === row.student_id);
      if (i >= 0) rows[i] = row; else rows.push(row);
    }
    _applyCohortChange(payload) {
      if (payload.eventType === 'DELETE') {
        delete this.db.cohort_meta[payload.old.id];
        return;
      }
      const c = payload.new;
      global.STUDENT_ROSTER[c.id] = global.STUDENT_ROSTER[c.id] || {
        label: c.label, track: c.track || '', round: c.round || '',
        color: c.color || '#7C5CFF', students: []
      };
      Object.assign(global.STUDENT_ROSTER[c.id], {
        label: c.label, track: c.track || '', round: c.round || '', color: c.color || '#7C5CFF'
      });
      this.db.cohort_meta[c.id] = {
        archived_at: c.archived_at, custom: !!c.custom,
        label: c.label, track: c.track, round: c.round, color: c.color,
        sort_order: typeof c.sort_order === 'number' ? c.sort_order : 100,
        hidden: !!c.hidden
      };
    }
    onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
    _notify() { this._listeners.forEach(fn => { try { fn(); } catch(e){} }); }

    /* ===== _save stub =====
       LocalAdapter 의 cohort 메서드들이 this._save() 를 호출하므로 stub 필요.
       Supabase 모드는 localStorage 미사용 — _notify 만 트리거. */
    _save() { this._notify(); }

    /* ===== students ===== */
    listStudents(cohort) {
      const list = (cohort ? this.db.students.filter(s => s.cohort === cohort) : this.db.students).slice();
      return list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    }
    getStudent(id) { return this.db.students.find(s => s.id === id); }
    getStudentByCohortName(cohort, name) {
      return this.db.students.find(s => s.cohort === cohort && s.name === name);
    }
    async addStudent(cohort, payload) {
      const id = payload.id || uid('std');
      const row = toDbStudent({
        id, cohort,
        name: payload.name || '',
        age: payload.age || null,
        gender: payload.gender || 'M',
        birthDate: payload.birthDate || '',
        phone: payload.phone || '',
        addr1: payload.addr1 || '',
        addr2: payload.addr2 || '',
        email: payload.email || '',
        course: payload.course || (global.STUDENT_ROSTER[cohort]?.track || ''),
        education: payload.education || '',
        grade: payload.grade || '',
        career_goal: payload.career_goal || '',
        alt_employment: !!payload.alt_employment,
        employment_status: payload.employment_status || '구직중',
        excluded_from_pool: !!payload.excluded_from_pool,
        drive_link: payload.drive_link || ''
      });
      const { data, error } = await this.client.from(SB_TABLES.students).insert(row).select().single();
      if (error) throw error;
      const s = fromDbStudent(data);
      this.db.students.push(s);
      this._notify();
      return s;
    }
    async updateStudent(id, patch) {
      const dbPatch = toDbStudent(patch);
      delete dbPatch.id;
      const { data, error } = await this.client.from(SB_TABLES.students)
        .update(dbPatch).eq('id', id).select().single();
      if (error) throw error;
      const i = this.db.students.findIndex(s => s.id === id);
      if (i >= 0) this.db.students[i] = fromDbStudent(data);
      this._notify();
    }
    async updateStudentFields(id, patch) {
      // 관리자 필드 + drive_link 등
      const allowed = ['grade','career_goal','alt_employment','employment_status','excluded_from_pool','drive_link'];
      const filtered = {};
      allowed.forEach(k => { if (k in patch) filtered[k] = patch[k]; });
      if (Object.keys(filtered).length === 0) return;
      return this.updateStudent(id, filtered);
    }
    async deleteStudent(id) {
      // dl_* FK 는 on delete cascade → DB 자식행 자동 삭제. 메모리 캐시도 동일하게 정리.
      await this.client.from(SB_TABLES.students).delete().eq('id', id);
      this.db.students = this.db.students.filter(s => s.id !== id);
      this.db.daily_reports = this.db.daily_reports.filter(r => r.student_id !== id);
      this.db.jobs = this.db.jobs.filter(j => j.student_id !== id);
      this.db.comments = this.db.comments.filter(c => c.student_id !== id);
      this.db.attendance = this.db.attendance.filter(a => a.student_id !== id);
      this.db.documents       = (this.db.documents || []).filter(d => d.student_id !== id);
      this.db.career_requests = (this.db.career_requests || []).filter(r => r.student_id !== id);
      this.db.evaluations     = (this.db.evaluations || []).filter(e => e.student_id !== id);
      this.db.counseling      = (this.db.counseling || []).filter(c => c.student_id !== id);
      this.db.comment_reads   = (this.db.comment_reads || []).filter(r => r.student_id !== id);
      this._notify();
    }

    /* ===== passwords ===== */
    hasStudentPassword(id) { const s = this.getStudent(id); return !!(s && s.password); }
    getStudentPassword(id) { const s = this.getStudent(id); return s ? (s.password || null) : null; }
    verifyStudentPassword(id, password) {
      const s = this.getStudent(id);
      return !!s && s.password === password;
    }
    async setStudentPassword(id, password) {
      const patch = { password, password_updated_at: new Date().toISOString() };
      const { data, error } = await this.client.from(SB_TABLES.students)
        .update(patch).eq('id', id).select().single();
      if (error) throw error;
      const i = this.db.students.findIndex(s => s.id === id);
      if (i >= 0) this.db.students[i] = fromDbStudent(data);
      this._notify();
      return true;
    }

    /* ===== daily reports ===== */
    listReports(studentId) {
      return this.db.daily_reports
        .filter(r => r.student_id === studentId)
        .sort((a, b) => b.date.localeCompare(a.date));
    }
    getTodayReport(studentId) {
      const today = todayStr();
      return this.db.daily_reports.find(r => r.student_id === studentId && r.date === today);
    }
    async upsertReport(studentId, patch) {
      const date = patch.date || todayStr();
      const existing = this.db.daily_reports.find(r => r.student_id === studentId && r.date === date);
      const row = {
        id: existing?.id || uid('rep'),
        student_id: studentId,
        date,
        week_key: weekKey(date),
        mood: patch.mood ?? null,
        today_done: patch.today_done || '',
        tomorrow_plan: patch.tomorrow_plan || '',
        blockers: patch.blockers || '',
        weekly_goals: patch.weekly_goals || [],
        status: patch.status || 'in-progress',
        attachments: patch.attachments || []
      };
      const { data, error } = await this.client.from(SB_TABLES.daily_reports)
        .upsert(row, { onConflict: 'student_id,date' }).select().single();
      if (error) { console.warn('upsertReport error', error); return existing || row; }
      const i = this.db.daily_reports.findIndex(r => r.student_id === studentId && r.date === date);
      if (i >= 0) this.db.daily_reports[i] = data; else this.db.daily_reports.push(data);
      this._notify();
      return data;
    }
    async deleteReport(id) {
      await this.client.from(SB_TABLES.daily_reports).delete().eq('id', id);
      this.db.daily_reports = this.db.daily_reports.filter(r => r.id !== id);
      this._notify();
    }
    getWeeklyGoalsContext(studentId, dateStr = todayStr()) {
      const wk = weekKey(dateStr);
      const inWeek = this.db.daily_reports
        .filter(r => r.student_id === studentId && r.week_key === wk)
        .sort((a, b) => b.date.localeCompare(a.date));
      if (inWeek.length && inWeek[0].weekly_goals?.length) return inWeek[0].weekly_goals;
      const latest = this.listReports(studentId)[0];
      return latest?.weekly_goals ? latest.weekly_goals.map(g => ({ ...g, status: 'not-started' })) : [];
    }

    /* ===== jobs ===== */
    listJobs(studentId) {
      return this.db.jobs
        .filter(j => j.student_id === studentId)
        .sort(jobsSortByPriority);
    }
    async upsertJob(job) {
      const row = {
        id: job.id || uid('job'),
        student_id: job.student_id,
        title: job.title || '',
        company: job.company || '',
        role: job.role || '',
        status: job.status || '미지원',
        interest: job.interest ?? 5,
        registered_at: job.registered_at || todayStr(),
        updated_at: todayStr(),
        planned_apply_date: job.planned_apply_date || null,
        due_date: job.due_date || null,
        url: job.url || '',
        memo: job.memo || '',
        // 2026-06 면접 이력 확장
        applied_at: job.applied_at || null,
        interview_rounds: job.interview_rounds || [],
        pipeline_stage: job.pipeline_stage || null,
        // 2026-06-05 키워드 + 포트폴리오 방향 확장
        keywords: Array.isArray(job.keywords) ? job.keywords : [],
        portfolio_direction: job.portfolio_direction || ''
      };
      const { data, error } = await this.client.from(SB_TABLES.jobs)
        .upsert(row).select().single();
      if (error) { console.warn('upsertJob error', error); return; }
      const i = this.db.jobs.findIndex(j => j.id === data.id);
      if (i >= 0) this.db.jobs[i] = data; else this.db.jobs.push(data);
      this._notify();
    }
    async deleteJob(id) {
      await this.client.from(SB_TABLES.jobs).delete().eq('id', id);
      this.db.jobs = this.db.jobs.filter(j => j.id !== id);
      this._notify();
    }

    /* ===== comments ===== */
    listComments(studentId, opts = {}) {
      let all = this.db.comments
        .filter(c => c.student_id === studentId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      if (opts.viewerRole === 'student') {
        all = all.filter(c => c.visibility === 'both' || c.visibility === 'student-only');
      }
      if (opts.order === 'desc') all = all.slice().reverse();   // 최신순
      return all;
    }
    async addComment(studentId, author, text, opts = {}) {
      const row = {
        id: uid('cm'),
        student_id: studentId, author, text,
        author_role: opts.role || 'admin',
        visibility: opts.visibility || 'both',
        parent_id: opts.parentId || null
      };
      const { data, error } = await this.client.from(SB_TABLES.comments).insert(row).select().single();
      if (error) { console.warn('addComment error', error); return; }
      this.db.comments.push(data);
      this._notify();
      return data;
    }
    updateComment(id, patch) {
      // optional
      return this.client.from(SB_TABLES.comments).update(patch).eq('id', id);
    }
    async deleteComment(id) {
      await this.client.from(SB_TABLES.comments).delete().eq('id', id);
      this.db.comments = this.db.comments.filter(c => c.id !== id);
      this._notify();
    }

    /* ===== [D] comment read receipts ===== */
    async markCommentsRead(studentId, role) {
      const existing = (this.db.comment_reads || []).find(x => x.student_id === studentId);
      const now = new Date().toISOString();
      const row = {
        student_id: studentId,
        admin_read_at: existing ? existing.admin_read_at : null,
        student_read_at: existing ? existing.student_read_at : null
      };
      if (role === 'admin') row.admin_read_at = now; else row.student_read_at = now;
      const { data, error } = await this.client.from(SB_TABLES.comment_reads)
        .upsert(row, { onConflict: 'student_id' }).select().single();
      if (error) { console.warn('markCommentsRead error', error); return; }
      const i = (this.db.comment_reads || []).findIndex(x => x.student_id === studentId);
      if (i >= 0) this.db.comment_reads[i] = data; else this.db.comment_reads.push(data);
      this._notify();
      return data;
    }

    /* ===== [A] documents ===== */
    async upsertDocument(doc) {
      const row = {
        id: doc.id || uid('doc'),
        student_id: doc.student_id,
        kind: doc.kind || 'resume',
        title: doc.title || '',
        link: doc.link || '',
        file_url: doc.file_url || '',
        file_name: doc.file_name || '',
        status: doc.status || 'none'
      };
      const { data, error } = await this.client.from(SB_TABLES.documents).upsert(row).select().single();
      if (error) { console.warn('upsertDocument error', error); return; }
      const i = this.db.documents.findIndex(d => d.id === data.id);
      if (i >= 0) this.db.documents[i] = data; else this.db.documents.push(data);
      this._notify();
      return data;
    }
    async deleteDocument(id) {
      await this.client.from(SB_TABLES.documents).delete().eq('id', id);
      this.db.documents = this.db.documents.filter(d => d.id !== id);
      this._notify();
    }
    async setDocumentStatus(id, status) {
      if (!DOC_STATUSES.includes(status)) return;   // 허용된 상태값만
      const { data, error } = await this.client.from(SB_TABLES.documents)
        .update({ status }).eq('id', id).select().single();
      if (error) { console.warn('setDocumentStatus error', error); return; }
      const i = this.db.documents.findIndex(d => d.id === id);
      if (i >= 0) this.db.documents[i] = data;
      this._notify();
      return data;
    }
    // Supabase: Storage 버킷 'dl-documents' 에 업로드 → public URL 반환
    async uploadDocumentFile(studentId, file) {
      const safeName = (file.name || 'file').replace(/[^\w.\-가-힣]/g, '_');
      const path = `${studentId}/${Date.now()}_${safeName}`;
      const { error } = await this.client.storage.from('dl-documents')
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || 'application/octet-stream' });
      if (error) throw new Error('업로드 실패: ' + (error.message || error));
      const { data } = this.client.storage.from('dl-documents').getPublicUrl(path);
      return { file_url: data.publicUrl, file_name: file.name };
    }
    async dismissNotification(synthId) {
      const row = { id: synthId, dismissed_at: new Date().toISOString() };
      const { error } = await this.client.from(SB_TABLES.notif_dismissals).upsert(row);
      if (error) { console.warn('dismissNotification error', error); return; }
      if (!this.db.notif_dismissals.some(d => d.id === synthId)) this.db.notif_dismissals.push(row);
      this._notify();
    }

    /* ===== [B] career preference ===== */
    async setCareerPref(studentId, choices) {
      const s = this.getStudent(studentId);
      if (!s) return { error: 'no-student' };
      const clean = (choices || []).map(c => (c || '').trim()).filter(Boolean);
      const now = new Date().toISOString();
      if (!s.job_pref || !Array.isArray(s.job_pref.choices) || s.job_pref.choices.length === 0) {
        const job_pref = { choices: clean, approved_at: now };
        const { data, error } = await this.client.from(SB_TABLES.students)
          .update({ job_pref }).eq('id', studentId).select().single();
        if (error) { console.warn('setCareerPref error', error); return { error }; }
        const i = this.db.students.findIndex(x => x.id === studentId);
        if (i >= 0) this.db.students[i] = fromDbStudent(data);
        this._notify();
        return { applied: true };
      }
      // pending: 기존 pending 삭제 후 insert
      await this.client.from(SB_TABLES.career_requests).delete().eq('student_id', studentId).eq('status', 'pending');
      this.db.career_requests = this.db.career_requests.filter(r => !(r.student_id === studentId && r.status === 'pending'));
      const row = { id: uid('ccr'), student_id: studentId, choices: clean, status: 'pending', requested_at: now };
      const { data, error } = await this.client.from(SB_TABLES.career_requests).insert(row).select().single();
      if (error) { console.warn('setCareerPref pending error', error); return { error }; }
      this.db.career_requests.push(data);
      this._notify();
      return { pending: true };
    }
    listCareerRequests(opts) { return LocalAdapter.prototype.listCareerRequests.call(this, opts); }
    getCareerPref(studentId) { return LocalAdapter.prototype.getCareerPref.call(this, studentId); }
    async decideCareerRequest(reqId, approve, decidedBy = '관리자') {
      const r = this.db.career_requests.find(x => x.id === reqId);
      if (!r) return;
      const patch = { status: approve ? 'approved' : 'rejected', decided_at: new Date().toISOString(), decided_by: decidedBy };
      const { data, error } = await this.client.from(SB_TABLES.career_requests).update(patch).eq('id', reqId).select().single();
      if (error) { console.warn('decideCareerRequest error', error); return; }
      const i = this.db.career_requests.findIndex(x => x.id === reqId);
      if (i >= 0) this.db.career_requests[i] = data;
      if (approve) {
        const job_pref = { choices: r.choices, approved_at: data.decided_at };
        const upd = await this.client.from(SB_TABLES.students).update({ job_pref }).eq('id', r.student_id).select().single();
        if (!upd.error && upd.data) {
          const si = this.db.students.findIndex(x => x.id === r.student_id);
          if (si >= 0) this.db.students[si] = fromDbStudent(upd.data);
        }
      }
      this._notify();
      return data;
    }

    /* ===== [B] evaluations ===== */
    listEvaluations(studentId) { return LocalAdapter.prototype.listEvaluations.call(this, studentId); }
    async upsertEvaluation(ev) {
      const row = { id: ev.id || uid('eval'), student_id: ev.student_id, evaluator: ev.evaluator || '', goal: ev.goal || '', content: ev.content || '', score: ev.score ?? null };
      const { data, error } = await this.client.from(SB_TABLES.evaluations).upsert(row).select().single();
      if (error) { console.warn('upsertEvaluation error', error); return; }
      const i = this.db.evaluations.findIndex(e => e.id === data.id);
      if (i >= 0) this.db.evaluations[i] = data; else this.db.evaluations.push(data);
      this._notify();
      return data;
    }
    async deleteEvaluation(id) {
      await this.client.from(SB_TABLES.evaluations).delete().eq('id', id);
      this.db.evaluations = this.db.evaluations.filter(e => e.id !== id);
      this._notify();
    }

    /* ===== [B] counseling ===== */
    listCounseling(studentId) { return LocalAdapter.prototype.listCounseling.call(this, studentId); }
    async addCounseling(c) {
      const row = { id: uid('cns'), student_id: c.student_id, date: c.date || todayStr(), counselor: c.counselor || '', content: c.content || '' };
      const { data, error } = await this.client.from(SB_TABLES.counseling).insert(row).select().single();
      if (error) { console.warn('addCounseling error', error); return; }
      this.db.counseling.push(data);
      this._notify();
      return data;
    }
    async deleteCounseling(id) {
      await this.client.from(SB_TABLES.counseling).delete().eq('id', id);
      this.db.counseling = this.db.counseling.filter(c => c.id !== id);
      this._notify();
    }

    /* ===== [C] interview rounds (jsonb on jobs) ===== */
    async setInterviewRound(jobId, round) {
      const j = this.db.jobs.find(x => x.id === jobId);
      if (!j) return;
      const rounds = Array.isArray(j.interview_rounds) ? j.interview_rounds.slice() : [];
      const entry = { round: round.round, date: round.date || '', status: round.status || '대기', memo: round.memo || '' };
      const i = rounds.findIndex(r => r.round === round.round);
      if (i >= 0) rounds[i] = entry; else rounds.push(entry);
      await this.upsertJob({ ...j, interview_rounds: rounds });
    }
    async removeInterviewRound(jobId, roundKey) {
      const j = this.db.jobs.find(x => x.id === jobId);
      if (!j) return;
      const rounds = (Array.isArray(j.interview_rounds) ? j.interview_rounds : []).filter(r => r.round !== roundKey);
      await this.upsertJob({ ...j, interview_rounds: rounds });
    }

    /* ===== derived reads (LocalAdapter 로직 재사용) ===== */
    listDocuments(studentId) { return LocalAdapter.prototype.listDocuments.call(this, studentId); }
    getAdminNotifications() { return LocalAdapter.prototype.getAdminNotifications.call(this); }
    getCommentReadState(studentId) { return LocalAdapter.prototype.getCommentReadState.call(this, studentId); }
    getUnreadCommentCount(studentId, role) { return LocalAdapter.prototype.getUnreadCommentCount.call(this, studentId, role); }
    listInterviewJobs(cohort) { return LocalAdapter.prototype.listInterviewJobs.call(this, cohort); }
    getJobFunnel(cohort) { return LocalAdapter.prototype.getJobFunnel.call(this, cohort); }

    /* ===== attendance ===== */
    listAttendance(opts = {}) {
      let list = this.db.attendance.slice();
      if (opts.studentId) list = list.filter(a => a.student_id === opts.studentId);
      if (opts.type) list = list.filter(a => a.type === opts.type);
      if (opts.cohort) {
        const ids = new Set(this.listStudents(opts.cohort).map(s => s.id));
        list = list.filter(a => ids.has(a.student_id));
      }
      if (opts.date) list = list.filter(a => a.date === opts.date);
      return list;
    }
    getAttendance(studentId, type, date) {
      return this.db.attendance.find(a =>
        a.student_id === studentId && a.type === type && a.date === date
      );
    }
    async setAttendance(studentId, type, date, attended, memo = '') {
      const existing = this.getAttendance(studentId, type, date);
      if (attended === false || attended === null) {
        if (existing) {
          await this.client.from(SB_TABLES.attendance).delete().eq('id', existing.id);
          this.db.attendance = this.db.attendance.filter(a => a.id !== existing.id);
          this._notify();
        }
        return;
      }
      const row = {
        id: existing?.id || uid('att'),
        student_id: studentId, type, date,
        attended: true, memo: memo || ''
      };
      const { data, error } = await this.client.from(SB_TABLES.attendance)
        .upsert(row, { onConflict: 'student_id,type,date' }).select().single();
      if (error) { console.warn('setAttendance error', error); return; }
      const i = this.db.attendance.findIndex(a => a.id === data.id);
      if (i >= 0) this.db.attendance[i] = data; else this.db.attendance.push(data);
      this._notify();
    }
    countAttendance(studentId, type) {
      return this.db.attendance.filter(a =>
        a.student_id === studentId && a.type === type && a.attended
      ).length;
    }

    /* ===== 멘토링 세션 (Supabase) ===== */
    listMentoring(opts) { return LocalAdapter.prototype.listMentoring.call(this, opts); }
    async upsertMentoring(payload) {
      const row = LocalAdapter.prototype.upsertMentoring.call(this, payload);
      this._notify();
      try {
        const { data, error } = await this.client
          .from(SB_TABLES.mentoring_sessions)
          .upsert(row).select().single();
        if (error) throw error;
        const i = this.db.mentoring_sessions.findIndex(m => m.id === row.id);
        if (i >= 0) this.db.mentoring_sessions[i] = data;
      } catch (err) {
        console.error('[upsertMentoring] 실패:', err);
        throw new Error('Supabase 동기화 실패: ' + (err.message || err));
      }
      this._notify();
      return row;
    }
    async deleteMentoring(id) {
      LocalAdapter.prototype.deleteMentoring.call(this, id);
      this._notify();
      try {
        const { error } = await this.client
          .from(SB_TABLES.mentoring_sessions)
          .delete().eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error('[deleteMentoring] 실패:', err);
        throw new Error('Supabase 동기화 실패: ' + (err.message || err));
      }
      this._notify();
    }
    async updateMentoringStudentNotes(id, notes) {
      LocalAdapter.prototype.updateMentoringStudentNotes.call(this, id, notes);
      this._notify();
      try {
        const m = this.db.mentoring_sessions.find(x => x.id === id);
        const patch = {
          student_notes: m ? m.student_notes : (notes || ''),
          student_notes_updated_at: m ? m.student_notes_updated_at : new Date().toISOString()
        };
        const { error } = await this.client
          .from(SB_TABLES.mentoring_sessions)
          .update(patch).eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error('[updateMentoringStudentNotes] 실패:', err);
        throw new Error('Supabase 동기화 실패: ' + (err.message || err));
      }
      this._notify();
    }

    /* ===== dashboard / employment stats / cohorts ===== */
    getDashboardRows(cohort) { return LocalAdapter.prototype.getDashboardRows.call(this, cohort); }
    getEmploymentStats(cohort) { return LocalAdapter.prototype.getEmploymentStats.call(this, cohort); }

    _syncRoster() { return LocalAdapter.prototype._syncRoster.call(this); }
    listCohorts(opts) { return LocalAdapter.prototype.listCohorts.call(this, opts); }
    getCohort(id) { return LocalAdapter.prototype.getCohort.call(this, id); }
    async archiveCohort(id) {
      LocalAdapter.prototype.archiveCohort.call(this, id);
      await this.client.from(SB_TABLES.cohorts)
        .update({ archived_at: this.db.cohort_meta[id].archived_at }).eq('id', id);
      this._notify();
    }
    async restoreCohort(id) {
      LocalAdapter.prototype.restoreCohort.call(this, id);
      await this.client.from(SB_TABLES.cohorts).update({ archived_at: null }).eq('id', id);
      this._notify();
    }
    async createCohort(payload) {
      // 1) 로컬(메모리)에 즉시 등록 → STUDENT_ROSTER + cohort_meta 갱신
      const r = LocalAdapter.prototype.createCohort.call(this, payload);
      // 2) UI 즉시 갱신 (상단바 셀렉트박스 / CohortsManagement 목록 등)
      this._notify();
      // 3) DB에 INSERT — .select() 로 응답 row 보장
      try {
        // LocalAdapter.createCohort 에서 nextOrder 가 계산되어 cohort_meta 에 저장됨
        const localMeta = (this.db.cohort_meta || {})[r.id] || {};
        const insertBody = {
          id: r.id,
          label: r.label,
          track: r.track || '',
          round: r.round || '',
          color: r.color || '#7C5CFF',
          custom: true,
          archived_at: null,
          sort_order: typeof localMeta.sort_order === 'number' ? localMeta.sort_order : 100,
          hidden: false
        };
        console.info('[createCohort] DB INSERT 시도:', insertBody);
        const { data, error, status, statusText } = await this.client
          .from(SB_TABLES.cohorts)
          .insert(insertBody)
          .select()
          .single();
        if (error) {
          // 상세 정보로 에러 객체 강화
          const detail = [
            error.message,
            error.hint && `hint: ${error.hint}`,
            error.code && `code: ${error.code}`,
            status && `status: ${status}`
          ].filter(Boolean).join(' / ');
          throw new Error(detail);
        }
        if (!data) {
          throw new Error('DB 응답에 row 없음 (RLS 차단 가능성)');
        }
        console.info('[createCohort] DB INSERT 성공:', data);
      } catch (err) {
        console.error('[createCohort] 실패:', err);
        // 롤백: STUDENT_ROSTER + cohort_meta 에서 제거
        try { delete global.STUDENT_ROSTER[r.id]; } catch (e) {}
        try {
          if (this.db.cohort_meta) delete this.db.cohort_meta[r.id];
        } catch (e) {}
        this._notify();
        throw new Error('Supabase 동기화 실패: ' + (err.message || err));
      }
      this._notify();
      return r;
    }
    async updateCohort(id, patch) {
      LocalAdapter.prototype.updateCohort.call(this, id, patch);
      const dbPatch = {};
      ['label','track','round','color'].forEach(k => { if (k in patch) dbPatch[k] = patch[k]; });
      if (Object.keys(dbPatch).length) {
        await this.client.from(SB_TABLES.cohorts).update(dbPatch).eq('id', id);
      }
      this._notify();
    }
    /* 노출 토글 */
    async setCohortHidden(id, hidden) {
      LocalAdapter.prototype.setCohortHidden.call(this, id, hidden);
      try {
        const { error } = await this.client.from(SB_TABLES.cohorts)
          .update({ hidden: !!hidden }).eq('id', id);
        if (error) throw error;
      } catch (err) {
        // 롤백
        LocalAdapter.prototype.setCohortHidden.call(this, id, !hidden);
        this._notify();
        throw new Error('Supabase 동기화 실패: ' + (err.message || err));
      }
      this._notify();
    }
    /* 순서 직접 설정 */
    async setCohortOrder(id, sortOrder) {
      LocalAdapter.prototype.setCohortOrder.call(this, id, sortOrder);
      try {
        const { error } = await this.client.from(SB_TABLES.cohorts)
          .update({ sort_order: sortOrder }).eq('id', id);
        if (error) throw error;
      } catch (err) {
        this._notify();
        throw new Error('Supabase 동기화 실패: ' + (err.message || err));
      }
      this._notify();
    }
    /* 위/아래로 한 칸 이동 (swap) — 두 row update를 동시에 트랜잭션 */
    async moveCohort(id, direction) {
      const result = LocalAdapter.prototype.moveCohort.call(this, id, direction);
      if (!result) return null;
      try {
        // Supabase는 transaction을 client에서 직접 못 해서 순차 update
        const u1 = await this.client.from(SB_TABLES.cohorts)
          .update({ sort_order: result.newOrder }).eq('id', result.moved);
        if (u1.error) throw u1.error;
        const u2 = await this.client.from(SB_TABLES.cohorts)
          .update({ sort_order: result.otherNewOrder }).eq('id', result.swappedWith);
        if (u2.error) throw u2.error;
      } catch (err) {
        // 롤백: 역방향 swap
        LocalAdapter.prototype.moveCohort.call(this, id, direction === 'up' ? 'down' : 'up');
        this._notify();
        throw new Error('Supabase 동기화 실패: ' + (err.message || err));
      }
      this._notify();
      return result;
    }

    resetAll() {
      // Supabase 모드에서는 위험 — 차라리 연결 해제 안내
      console.warn('[SupabaseAdapter] resetAll 은 Supabase 데이터를 건드리지 않습니다. 연결 해제 후 LocalAdapter 에서 실행하세요.');
    }
  }

  /* ---------------- GistAdapter ----------------
     LocalAdapter를 그대로 사용하면서, 변경 시마다 GitHub Gist에 백업/동기화.
     - 초기 로드: Gist에서 JSON을 받아 localStorage 덮어쓰기 → LocalAdapter 가 그 위에서 동작
     - 변경: _save() 시 디바운스로 PATCH 전송
     - 폴링: 30초마다 Gist를 폴링하여 다른 디바이스 변경 반영 (선택)
     주의: PAT 가 localStorage 에 저장됨. 공유 디바이스에서는 사용 금지.
  */
  class GistAdapter extends LocalAdapter {
    constructor(cfg) {
      super();
      this._cfg = cfg;
      this._syncTimer = null;
      this._lastEtag = null;
      this._suppressPush = false;
      this._pollTimer = null;
      // 부트스트랩: gist에서 받아서 적용
      this._pull().then(applied => {
        if (applied) this._notify();
        this._startPolling();
      }).catch(err => {
        console.warn('[GistAdapter] 초기 동기화 실패 — localStorage 모드로 동작:', err);
      });
    }
    _save() {
      this._writeLocal();
      this._notify();
      if (!this._suppressPush) this._schedulePush();
    }
    _schedulePush() {
      clearTimeout(this._syncTimer);
      this._syncTimer = setTimeout(() => this._push(), 800);
    }
    async _pull() {
      const res = await fetch(`https://api.github.com/gists/${this._cfg.gistId}`, {
        headers: {
          'Authorization': `Bearer ${this._cfg.token}`,
          'Accept': 'application/vnd.github+json'
        }
      });
      if (!res.ok) throw new Error('Gist 조회 실패: ' + res.status);
      this._lastEtag = res.headers.get('etag');
      const json = await res.json();
      const file = json.files && json.files['develocket-db.json'];
      if (!file) return false;
      try {
        const remoteDb = JSON.parse(file.content);
        if (!remoteDb || !remoteDb.admin_meta) return false;
        // 원격이 더 최신이면 적용
        const localTs = this.db.admin_meta?.updated_at || 0;
        const remoteTs = remoteDb.admin_meta?.updated_at || 0;
        if (remoteTs >= localTs) {
          this._suppressPush = true;
          this.db = remoteDb;
          localStorage.setItem(KEY, JSON.stringify(this.db));
          this._syncRoster();
          this._suppressPush = false;
          return true;
        }
      } catch (e) {
        console.warn('[GistAdapter] 원격 JSON 파싱 실패', e);
      }
      return false;
    }
    async _push() {
      try {
        // updated_at 갱신
        this.db.admin_meta = this.db.admin_meta || {};
        this.db.admin_meta.updated_at = Date.now();
        const res = await fetch(`https://api.github.com/gists/${this._cfg.gistId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this._cfg.token}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            files: {
              'develocket-db.json': { content: JSON.stringify(this.db) }
            }
          })
        });
        if (!res.ok) throw new Error('Gist 업데이트 실패: ' + res.status);
        this._lastEtag = res.headers.get('etag');
      } catch (e) {
        console.warn('[GistAdapter] push 실패:', e);
      }
    }
    _startPolling() {
      clearInterval(this._pollTimer);
      this._pollTimer = setInterval(() => {
        this._pull().then(changed => { if (changed) this._notify(); })
          .catch(() => {});
      }, 30000);
    }
    async forceSync() {
      await this._push();
      const changed = await this._pull();
      if (changed) this._notify();
    }
  }

  /* ---------------- Public API ----------------
     Adapter selection priority:
     1) Gist (gistId+token 저장됨) → GistAdapter
     2) Supabase 설정됨(또는 DEFAULT 사용) → SupabaseAdapter
     3) 기본 → LocalAdapter

     기본 Supabase 연결은 빌트인. 사용자가 [연결 해제] 하면 localStorage 모드로 fallback.
     ANON KEY 는 Supabase 정책상 공개 가능 (RLS 로 보호).
  -------------------------------------------- */
  const DEFAULT_SUPABASE_CONFIG = {
    url: 'https://etasxbaorwgjoofdxean.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0YXN4YmFvcndnam9vZmR4ZWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NzUwMDIsImV4cCI6MjA5MTI1MTAwMn0.x8gV5pPEflhTniecyVrBNvjedkuimVRBUjh3zvez_us'
  };

  function getSupabaseConfig() {
    try {
      const raw = localStorage.getItem('develocket.supabase');
      if (raw) {
        const cfg = JSON.parse(raw);
        if (cfg && cfg.url && cfg.anonKey) return cfg;
        if (cfg && cfg.disabled) return null; // 명시적 해제 상태
      }
    } catch (e) {}
    // 기본 빌트인 연결
    return DEFAULT_SUPABASE_CONFIG;
  }
  function setSupabaseConfig(cfg) {
    if (cfg && cfg.url && cfg.anonKey) {
      localStorage.setItem('develocket.supabase', JSON.stringify(cfg));
    } else {
      // null/false 전달 시 = 명시적 해제 → localStorage 모드 강제
      localStorage.setItem('develocket.supabase', JSON.stringify({ disabled: true }));
    }
  }
  function resetSupabaseConfig() {
    // 빌트인 기본값으로 복귀
    localStorage.removeItem('develocket.supabase');
  }
  function getGistConfig() {
    try {
      const raw = localStorage.getItem('develocket.gist');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function setGistConfig(cfg) {
    if (cfg && cfg.token && cfg.gistId) {
      localStorage.setItem('develocket.gist', JSON.stringify(cfg));
    } else {
      localStorage.removeItem('develocket.gist');
    }
  }
  /* 새 Gist 생성 헬퍼 — UI에서 호출 */
  async function createGistForSync(token, isPublic = false) {
    const res = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: '디벨로켓 수강생 관리 - 데이터 동기화',
        public: !!isPublic,
        files: {
          'develocket-db.json': { content: '{"admin_meta":{"version":6,"updated_at":0}}' }
        }
      })
    });
    if (!res.ok) throw new Error('Gist 생성 실패: ' + res.status + ' ' + (await res.text()));
    const json = await res.json();
    return json.id;
  }

  let adapter;
  const gistCfg = getGistConfig();
  const cfg = getSupabaseConfig();
  if (gistCfg && gistCfg.token && gistCfg.gistId) {
    adapter = new GistAdapter(gistCfg);
    global.STORE_MODE = 'gist';
  } else if (cfg && global.supabase?.createClient) {
    try {
      const client = global.supabase.createClient(cfg.url, cfg.anonKey);
      adapter = new SupabaseAdapter(client);
      global.STORE_MODE = 'supabase';
    } catch (e) {
      console.warn('Supabase 초기화 실패, localStorage 로 폴백:', e);
      adapter = new LocalAdapter();
      global.STORE_MODE = 'local-fallback';
    }
  } else {
    adapter = new LocalAdapter();
    global.STORE_MODE = 'local';
  }

  global.STORE = adapter;
  global.STORE_HELPERS = { todayStr, weekKey, daysBetween, uid };
  global.SupabaseAdapter = SupabaseAdapter;
  global.LocalAdapter = LocalAdapter;
  global.GistAdapter = GistAdapter;
  global.getSupabaseConfig = getSupabaseConfig;
  global.setSupabaseConfig = setSupabaseConfig;
  global.resetSupabaseConfig = resetSupabaseConfig;
  global.DEFAULT_SUPABASE_CONFIG = DEFAULT_SUPABASE_CONFIG;
  global.getGistConfig = getGistConfig;
  global.setGistConfig = setGistConfig;
  global.createGistForSync = createGistForSync;

  /* ----- Cohort UI 헬퍼: 아카이브된 기수는 기본적으로 숨김 ----- */
  /* 외부 노출용: 아카이브 + 숨김 모두 제외, sort_order 적용된 활성 기수 */
  global.getActiveCohortEntries = function () {
    return adapter.listCohorts({ includeArchived: false, includeHidden: false })
      .map(c => [c.id, global.STUDENT_ROSTER[c.id]]);
  };
  global.getActiveCohortIds = function () {
    return adapter.listCohorts({ includeArchived: false, includeHidden: false }).map(c => c.id);
  };
  /* 관리 화면용: 숨김 포함 (아카이브는 제외) */
  global.getManageCohorts = function () {
    return adapter.listCohorts({ includeArchived: false, includeHidden: true });
  };
})(window);
