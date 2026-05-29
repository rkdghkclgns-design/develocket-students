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

  /* ---------------- LocalStorage Adapter ---------------- */
  class LocalAdapter {
    constructor() {
      this._listeners = new Set();
      const raw = localStorage.getItem(KEY);
      let initial;
      try { initial = raw ? JSON.parse(raw) : null; } catch (e) { initial = null; }
      // Schema version check — re-seed if outdated
      const CURRENT_VERSION = 5;
      if (initial && (!initial.admin_meta || initial.admin_meta.version !== CURRENT_VERSION)) {
        // v4 -> v5: 기존 데이터 보존하면서 cohort_meta만 보강
        if (initial && initial.admin_meta && initial.admin_meta.version === 4) {
          initial.cohort_meta = initial.cohort_meta || {};
          Object.keys(ROSTER).forEach(id => {
            if (!initial.cohort_meta[id]) {
              initial.cohort_meta[id] = { archived_at: null, custom: false };
            }
          });
          initial.admin_meta.version = CURRENT_VERSION;
        } else {
          initial = null;
        }
      }
      this.db = initial || this._seed();
      this._syncRoster();
      this._save();
    }
    _save() { localStorage.setItem(KEY, JSON.stringify(this.db)); this._notify(); }
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
        cohort_meta,
        admin_meta: { version: 5 }
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
      const meta = this.db.cohort_meta || {};
      const ids = new Set([...Object.keys(global.STUDENT_ROSTER), ...Object.keys(meta)]);
      const out = [];
      ids.forEach(id => {
        const m = meta[id] || { archived_at: null, custom: false };
        const archived = !!m.archived_at;
        if (onlyArchived && !archived) return;
        if (!includeArchived && !onlyArchived && archived) return;
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
          studentCount: this.db.students.filter(s => s.cohort === id).length
        });
      });
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
      this.db.cohort_meta[id] = {
        archived_at: null,
        custom: true,
        label: cohort.label,
        track: cohort.track,
        round: cohort.round,
        color: cohort.color,
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
        .sort((a, b) => b.registered_at.localeCompare(a.registered_at));
    }
    upsertJob(job) {
      let existing = this.db.jobs.find(j => j.id === job.id);
      if (existing) Object.assign(existing, job, { updated_at: todayStr() });
      else this.db.jobs.push({ id: uid('job'), updated_at: todayStr(), ...job });
      this._save();
    }
    deleteJob(jobId) {
      this.db.jobs = this.db.jobs.filter(j => j.id !== jobId);
      this._save();
    }

    /* ===== comments (visibility: 'admin-only' | 'student-only' | 'both') ===== */
    listComments(studentId, opts = {}) {
      const all = this.db.comments
        .filter(c => c.student_id === studentId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      if (opts.viewerRole === 'student') {
        return all.filter(c => c.visibility === 'both' || c.visibility === 'student-only');
      }
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
    attendance: 'dl_attendance'
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
        attendance: [], cohort_meta: {}, admin_meta: {}
      };
      this.ready = this._bootstrap();
    }
    async _bootstrap() {
      const [cohorts, students, reports, jobs, comments, attendance] = await Promise.all([
        this.client.from(SB_TABLES.cohorts).select('*'),
        this.client.from(SB_TABLES.students).select('*'),
        this.client.from(SB_TABLES.daily_reports).select('*'),
        this.client.from(SB_TABLES.jobs).select('*'),
        this.client.from(SB_TABLES.comments).select('*'),
        this.client.from(SB_TABLES.attendance).select('*')
      ]);
      this.db.students      = (students.data || []).map(fromDbStudent);
      this.db.daily_reports = reports.data  || [];
      this.db.jobs          = jobs.data     || [];
      this.db.comments      = comments.data || [];
      this.db.attendance    = attendance.data || [];

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
          label: c.label, track: c.track, round: c.round, color: c.color
        };
      });

      // Realtime: 변경 발생 시 db 갱신
      Object.entries(SB_TABLES).forEach(([key, table]) => {
        this.client.channel(`rt_${table}`)
          .on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
            if (key === 'cohorts') { this._applyCohortChange(payload); this._notify(); return; }
            const rows = this.db[key];
            if (!rows) return;
            const newRow = key === 'students' ? fromDbStudent(payload.new) : payload.new;
            if (payload.eventType === 'INSERT') rows.push(newRow);
            else if (payload.eventType === 'UPDATE') {
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
        label: c.label, track: c.track, round: c.round, color: c.color
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
      await this.client.from(SB_TABLES.students).delete().eq('id', id);
      this.db.students = this.db.students.filter(s => s.id !== id);
      this.db.daily_reports = this.db.daily_reports.filter(r => r.student_id !== id);
      this.db.jobs = this.db.jobs.filter(j => j.student_id !== id);
      this.db.comments = this.db.comments.filter(c => c.student_id !== id);
      this.db.attendance = this.db.attendance.filter(a => a.student_id !== id);
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
        .sort((a, b) => (b.registered_at || '').localeCompare(a.registered_at || ''));
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
        memo: job.memo || ''
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
      const all = this.db.comments
        .filter(c => c.student_id === studentId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      if (opts.viewerRole === 'student') {
        return all.filter(c => c.visibility === 'both' || c.visibility === 'student-only');
      }
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
        const insertBody = {
          id: r.id,
          label: r.label,
          track: r.track || '',
          round: r.round || '',
          color: r.color || '#7C5CFF',
          custom: true,
          archived_at: null
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
      localStorage.setItem(KEY, JSON.stringify(this.db));
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
          'develocket-db.json': { content: '{"admin_meta":{"version":5,"updated_at":0}}' }
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
  global.getActiveCohortEntries = function () {
    return adapter.listCohorts({ includeArchived: false })
      .map(c => [c.id, global.STUDENT_ROSTER[c.id]]);
  };
  global.getActiveCohortIds = function () {
    return adapter.listCohorts({ includeArchived: false }).map(c => c.id);
  };
})(window);
