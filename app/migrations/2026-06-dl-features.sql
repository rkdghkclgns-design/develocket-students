-- ============================================================================
-- 디벨로켓 수강생 관리 — 건의사항 반영 마이그레이션 (2026-06)
-- ----------------------------------------------------------------------------
-- 적용 대상: 운영 Supabase (store.js 가 사용하는 dl_* 접두사 테이블)
-- 성격: ADD-ONLY (기존 테이블/컬럼/enum 변경 없음). 재실행 안전(idempotent).
--
-- 사용법:
--   1. Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 실행.
--   2. 아래 [STORAGE] 섹션 안내대로 Storage 버킷 'dl-documents' 생성(이력서 PDF 업로드용).
--   3. realtime 은 본 파일 마지막의 publication 구문으로 자동 등록됨.
--
-- 다루는 건의사항 영역:
--   A. 문서(이력서/자소서/포폴) 관리 + 관리자 알림  → dl_documents, dl_notification_dismissals
--   B. 희망직군 지망/승인, 훈련생 평가, 취업면담 이력 → dl_students.job_pref,
--      dl_career_change_requests, dl_evaluations, dl_counseling
--   C. 공고→면접 이력(차수/지원일자/도달률)          → dl_jobs.applied_at/interview_rounds/pipeline_stage
--   D. 코멘트 양방향 읽음 표시                          → dl_comment_reads
--
-- 설계 메모:
--   * 알림 피드와 도달률(퍼널)은 "저장하지 않고 derive" — 별도 테이블 없음.
--     관리자 알림 = (미읽음 학생 코멘트) + (review_requested 문서) + (pending 직군요청)
--     에서 계산하며, '확인(소멸)' 흔적만 dl_notification_dismissals 에 남긴다.
--   * 면접 차수는 dl_jobs.interview_rounds(jsonb) 에 임베드 — 부모 job 과 항상 함께 로드.
--   * 기존 job_status enum / getDashboardRows 계산은 건드리지 않는다(회귀 방지).
-- ============================================================================

create extension if not exists "uuid-ossp";

-- updated_at 자동 갱신 함수 (이미 있으면 교체) — dl_documents / dl_evaluations 에서 사용
create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- A. 문서 관리 (이력서 / 자소서 / 포폴)
-- ============================================================================
create table if not exists dl_documents (
  id          uuid primary key default uuid_generate_v4(),
  student_id  uuid not null references dl_students(id) on delete cascade,
  kind        text not null,                 -- 'resume' | 'cover_letter' | 'portfolio' | <자유>
  title       text,
  link        text,                          -- 구글드라이브 등 외부 링크(대용량 권장)
  file_url    text,                          -- Supabase Storage URL | (Local/Gist) base64 dataURL(≤1.5MB)
  file_name   text,
  -- 상태 워크플로우:
  --   학생 설정: 'editing'(수정중) | 'review_requested'(검토요청)
  --   관리자 설정: 'revision'(수정요) | 'complete'(완료)
  --   초기값: 'none'
  status      text not null default 'none',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_dl_documents_student on dl_documents(student_id);
create index if not exists idx_dl_documents_status  on dl_documents(status);

drop trigger if exists trg_dl_documents_updated_at on dl_documents;
create trigger trg_dl_documents_updated_at
  before update on dl_documents
  for each row execute function touch_updated_at();

-- 관리자 알림 '확인(소멸)' 흔적만 저장 (알림 자체는 derive)
-- id 는 합성 키: '<type>:<refId>:<updated_at>' — 동일 항목이 다시 발생하면 새 id 로 재노출됨
create table if not exists dl_notification_dismissals (
  id           text primary key,
  dismissed_at timestamptz default now()
);

-- ============================================================================
-- B-1. 희망직군 지망 + 변경 승인
-- ============================================================================
-- 승인된 현재값: { choices: [c1,c2,c3], approved_at }
alter table dl_students add column if not exists job_pref jsonb;

-- 변경 요청(감사/경합 안전): 최초 선택은 즉시 승인되어 dl_students.job_pref 에 기록되고,
-- 이후 변경은 여기 'pending' 으로 쌓여 관리자가 승인/반려한다.
create table if not exists dl_career_change_requests (
  id            uuid primary key default uuid_generate_v4(),
  student_id    uuid not null references dl_students(id) on delete cascade,
  choices       jsonb not null,                   -- 제안된 [c1,c2,c3]
  status        text not null default 'pending',  -- 'pending' | 'approved' | 'rejected'
  requested_at  timestamptz default now(),
  decided_at    timestamptz,
  decided_by    text
);
create index if not exists idx_dl_ccr_student on dl_career_change_requests(student_id);
create index if not exists idx_dl_ccr_status  on dl_career_change_requests(status);
-- 학생당 동시에 1건의 pending 만 허용 (JS 가드의 DB 백스톱)
create unique index if not exists uniq_dl_ccr_pending
  on dl_career_change_requests(student_id) where status = 'pending';

-- ============================================================================
-- B-2. 훈련생 평가 (강사별, 훈련생 비공개)
-- ============================================================================
create table if not exists dl_evaluations (
  id          uuid primary key default uuid_generate_v4(),
  student_id  uuid not null references dl_students(id) on delete cascade,
  evaluator   text not null,        -- 강사명
  goal        text,                 -- 목표
  content     text,                 -- 평가 내용(마크다운)
  score       int,                  -- 선택 점수
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_dl_eval_student on dl_evaluations(student_id);

drop trigger if exists trg_dl_evaluations_updated_at on dl_evaluations;
create trigger trg_dl_evaluations_updated_at
  before update on dl_evaluations
  for each row execute function touch_updated_at();

-- ============================================================================
-- B-3. 취업면담 이력 (훈련생 비공개)
-- ============================================================================
create table if not exists dl_counseling (
  id          uuid primary key default uuid_generate_v4(),
  student_id  uuid not null references dl_students(id) on delete cascade,
  date        date not null,
  counselor   text not null,
  content     text,                 -- 면담 내용(마크다운)
  created_at  timestamptz default now()
);
create index if not exists idx_dl_counsel_student on dl_counseling(student_id);

-- ============================================================================
-- C. 공고 → 면접 이력 (기존 dl_jobs 확장, status enum 불변)
-- ============================================================================
alter table dl_jobs add column if not exists applied_at date;                                -- 실제 지원일자
alter table dl_jobs add column if not exists interview_rounds jsonb not null default '[]'::jsonb;
                                          -- [{ round:'1차'|'2차'|'3차'|'과제', date, status:'대기'|'불합'|'합격', memo }]
alter table dl_jobs add column if not exists pipeline_stage text;                            -- '확인'|'지원'|'면접'|'대기'|'불합'|'합격'

-- ============================================================================
-- D. 코멘트 양방향 읽음 커서 (스레드 단위)
-- ============================================================================
create table if not exists dl_comment_reads (
  student_id      uuid primary key references dl_students(id) on delete cascade,
  admin_read_at   timestamptz,
  student_read_at timestamptz
);

-- ============================================================================
-- ROW LEVEL SECURITY (데모 정책 — 기존 dl_* 와 동일하게 전체 허용)
-- 운영 시 반드시 조정. 특히 dl_evaluations / dl_counseling 은 학생 비공개이므로
-- 실제 RLS 로 student 역할 SELECT 를 차단해야 한다(현재는 store read 경로로만 보장).
-- ============================================================================
alter table dl_documents               enable row level security;
alter table dl_notification_dismissals enable row level security;
alter table dl_career_change_requests  enable row level security;
alter table dl_evaluations             enable row level security;
alter table dl_counseling              enable row level security;
alter table dl_comment_reads           enable row level security;

do $$ begin
  create policy "demo_all_dl_documents"   on dl_documents               for all using (true) with check (true);
  create policy "demo_all_dl_ndismiss"    on dl_notification_dismissals for all using (true) with check (true);
  create policy "demo_all_dl_ccr"         on dl_career_change_requests  for all using (true) with check (true);
  create policy "demo_all_dl_eval"        on dl_evaluations             for all using (true) with check (true);
  create policy "demo_all_dl_counsel"     on dl_counseling              for all using (true) with check (true);
  create policy "demo_all_dl_creads"      on dl_comment_reads           for all using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ============================================================================
-- REALTIME — UI 실시간 갱신이 필요한 테이블만 publication 에 추가
-- (evaluations / counseling 은 관리자 저빈도 → 생략. dismissals 는 derive 보조 → 생략)
-- 이미 추가돼 있으면 duplicate_object 무시.
-- ============================================================================
do $$ begin
  alter publication supabase_realtime add table dl_documents;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table dl_career_change_requests;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table dl_comment_reads;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- [STORAGE] 이력서/자소서/포폴 PDF 업로드용 버킷 (수동 1회 설정)
-- ----------------------------------------------------------------------------
-- 아래 insert 로 버킷을 만들 수 있다(이미 있으면 무시). 공개 버킷으로 두면
-- file_url 을 그대로 <a href> 로 열 수 있어 가장 단순하다.
-- 민감 문서라면 public=false 로 두고 store.js 에서 createSignedUrl 사용으로 전환.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('dl-documents', 'dl-documents', true)
on conflict (id) do nothing;

-- 데모: 익명 키로 dl-documents 버킷에 업로드/읽기 허용 (운영 시 조정)
do $$ begin
  create policy "demo_dl_documents_read"
    on storage.objects for select
    using (bucket_id = 'dl-documents');
  create policy "demo_dl_documents_write"
    on storage.objects for insert
    with check (bucket_id = 'dl-documents');
  create policy "demo_dl_documents_update"
    on storage.objects for update
    using (bucket_id = 'dl-documents');
  create policy "demo_dl_documents_delete"
    on storage.objects for delete
    using (bucket_id = 'dl-documents');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 끝. (재실행 안전 — 모든 구문이 if not exists / duplicate_object 가드)
-- ============================================================================
