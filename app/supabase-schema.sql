-- ============================================================================
-- 디벨로켓 수강생 관리 — Supabase 스키마 (참조용)
-- ----------------------------------------------------------------------------
-- ⚠️ 주의: 이 파일의 테이블명은 접두사가 없지만, 실제 앱(store.js / SupabaseAdapter)은
--    `dl_` 접두사 테이블(dl_students, dl_jobs, dl_comments, ...)을 사용합니다.
--    따라서 이 파일은 데이터 모델 이해를 돕는 '참조 문서'이며, 운영 DB의 정식 스키마는
--    `dl_` 접두사 마이그레이션들입니다.
--
-- 📌 2026-06 건의사항 반영(문서관리/희망직군 승인/평가/면담/면접이력/코멘트 읽음)은
--    별도 add-only 마이그레이션으로 분리되어 있습니다:
--      → app/migrations/2026-06-dl-features.sql  (SQL Editor 에 붙여넣어 실행)
--    신규 테이블: dl_documents, dl_career_change_requests, dl_evaluations,
--                 dl_counseling, dl_comment_reads, dl_notification_dismissals
--    신규 컬럼:   dl_students.job_pref, dl_jobs.applied_at/interview_rounds/pipeline_stage
--    + Storage 버킷 'dl-documents'(PDF 업로드)
-- ----------------------------------------------------------------------------
-- 사용법:
--   1. Supabase 프로젝트 생성 → SQL Editor 에서 이 파일 전체 실행
--   2. Authentication → Providers 에서 Email 또는 Magic Link 활성화
--      (또는 익명 클라이언트만 쓰려면 RLS 정책을 조정)
--   3. localStorage 시드 데이터를 옮기려면 students 테이블에 INSERT
--      (roster.js 의 데이터를 SQL INSERT 로 변환해서 한 번에 적재)
--   4. 앱 우상단 ⚙ 설정 → Supabase URL + anon key 입력 → 자동 전환
-- ============================================================================

-- ============= EXTENSIONS =============
create extension if not exists "uuid-ossp";

-- ============= ENUMS =============
do $$ begin
  create type progress_status as enum ('not-started', 'in-progress', 'done', 'blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status as enum ('미지원', '지원완료', '면접', '합격', '불합격', '채용시 마감');
exception when duplicate_object then null; end $$;

-- ============= STUDENTS =============
create table if not exists students (
  id                    uuid primary key default uuid_generate_v4(),
  cohort                text not null,           -- '기획3기' | '프로그램3기'
  name                  text not null,
  age                   int,
  gender                char(1),                 -- 'M' | 'F'
  birth_date            date,
  phone                 text,
  addr1                 text,
  addr2                 text,
  email                 text,
  course                text,
  education             text,
  password              text,                    -- 수강생 본인 비밀번호 (PoC: 평문, 운영: bcrypt 권장)
  password_updated_at   timestamptz,
  created_at            timestamptz default now(),
  unique (cohort, name)
);

create index if not exists idx_students_cohort on students(cohort);

-- ============= DAILY REPORTS =============
create table if not exists daily_reports (
  id              uuid primary key default uuid_generate_v4(),
  student_id      uuid not null references students(id) on delete cascade,
  date            date not null,
  week_key        text not null,         -- 'YYYY-Www' for grouping
  mood            text,                  -- 😀 🙂 etc.
  today_done      text,                  -- 마크다운
  tomorrow_plan   text,                  -- 마크다운
  blockers        text,                  -- 마크다운
  weekly_goals    jsonb default '[]'::jsonb,
                                         -- [{ id, text, status }]
  status          progress_status default 'in-progress',
  attachments     jsonb default '[]'::jsonb,
                                         -- [{ type, url, label }]
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (student_id, date)
);

create index if not exists idx_reports_student     on daily_reports(student_id);
create index if not exists idx_reports_date        on daily_reports(date);
create index if not exists idx_reports_week        on daily_reports(student_id, week_key);

-- ============= JOBS (공고 관리) =============
create table if not exists jobs (
  id                  uuid primary key default uuid_generate_v4(),
  student_id          uuid not null references students(id) on delete cascade,
  title               text not null,
  company             text not null,
  role                text,
  status              job_status default '미지원',
  interest            int default 5 check (interest between 1 and 10),
  registered_at       date default current_date,
  updated_at          date default current_date,
  planned_apply_date  date,                  -- 학생이 지원하기로 계획한 날짜
  due_date            date,                  -- 회사 공고 마감일
  url                 text,
  memo                text,                  -- 마크다운
  created_at          timestamptz default now()
);

create index if not exists idx_jobs_student on jobs(student_id);
create index if not exists idx_jobs_status  on jobs(status);

-- ============= COMMENTS (관리자 ↔ 수강생 양방향 피드백) =============
create table if not exists comments (
  id              uuid primary key default uuid_generate_v4(),
  student_id      uuid not null references students(id) on delete cascade,
  author          text not null,          -- '관리자' | 학생 이름 등
  author_role     text not null default 'admin',
                                          -- 'admin' | 'student'
  visibility      text not null default 'both',
                                          -- 'admin-only' | 'student-only' | 'both'
  text            text not null,           -- 마크다운
  parent_id       uuid references comments(id) on delete cascade,
  created_at      timestamptz default now()
);

create index if not exists idx_comments_student on comments(student_id);

-- ============= TIMESTAMPS TRIGGER =============
create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_daily_reports_updated_at on daily_reports;
create trigger trg_daily_reports_updated_at
  before update on daily_reports
  for each row execute function touch_updated_at();

-- ============= ROW LEVEL SECURITY =============
-- 권장: Supabase Auth + user_metadata.role 로 admin/student 구분
-- 여기서는 데모 정책 (모두 읽기/쓰기 허용) — 운영 시 반드시 조정!

alter table students      enable row level security;
alter table daily_reports enable row level security;
alter table jobs          enable row level security;
alter table comments      enable row level security;

-- 데모: 익명 키로도 모든 작업 허용 (PoC 단계)
do $$ begin
  create policy "demo_all_students"      on students      for all using (true) with check (true);
  create policy "demo_all_reports"       on daily_reports for all using (true) with check (true);
  create policy "demo_all_jobs"          on jobs          for all using (true) with check (true);
  create policy "demo_all_comments"      on comments      for all using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 운영 정책 예시 (참고용 — 실제 적용 시 위 demo_all_* 정책 삭제 후 활성화)
-- ============================================================================
-- 예: 학생은 본인 데이터만 R/W, 관리자는 전체 R/W
--
-- create policy "student_own_reports" on daily_reports
--   for all
--   using (
--     (auth.jwt() ->> 'role') = 'admin' OR
--     student_id::text = auth.uid()::text
--   );
--
-- create policy "student_comments_visibility" on comments
--   for select using (
--     (auth.jwt() ->> 'role') = 'admin' OR
--     (visibility in ('both', 'student-only') AND student_id::text = auth.uid()::text)
--   );

-- ============================================================================
-- REALTIME (선택)
-- 대시보드 실시간 갱신을 위해 publication 에 테이블 추가:
--   alter publication supabase_realtime add table daily_reports;
--   alter publication supabase_realtime add table comments;
--   alter publication supabase_realtime add table jobs;
-- ============================================================================
