# 디벨로켓 수강생 관리 시스템

기수별로 운영되는 수강생 학습 관리 대시보드. 일일 보고, 공고 관리, 관리자 모드(전체 리포트, 출석, KPI, 검색, 기수 관리)를 포함합니다.

## 주요 기능

### 수강생
- 📁 **드라이브 링크 핀** — 본인 작업 드라이브 URL을 상단에 고정
- 📝 일일 보고 (오늘 한 일·내일 할 일 **필수**, 막힌 부분 선택)
- 🌡️ 10단계 컨디션 (좋음 → 안좋음)
- 💾 명시적 저장 버튼 + 자동 저장 병행
- 🎯 주간 목표 추적
- 🎯 **희망 직군 1·2·3지망** — 최초 선택 즉시 적용, 이후 변경은 관리자 승인
- 📂 **이력서/자소서/포폴 문서 관리** — 드라이브 링크 또는 PDF 업로드 + 상태(수정중/검토요청)
- 📋 지원 공고 관리 + **차수별 면접 이력**(1·2·3차·과제) + **지원→면접→합격 도달률**
- 💬 멘토 양방향 메시지 — **최신순 + 읽음 표시**
- 🔐 본인 비밀번호 변경/초기화 (초기화 후 최초 입장처럼 재설정)

### 관리자
- 🔍 **수강생 검색** (이름·이메일·전화·학력·진로)
- 🔔 **알림 패널** — 학생 코멘트·문서 검토요청·희망직군 변경요청을 모아 보고, 확인 시 제거
- 📊 KPI 대시보드 (취업률, KPI 달성률, 등급/취업 분포) + **기수 지원→면접→합격 도달률**
- 🖱️ KPI/요약 카드 **클릭 → 필터링**
- 🗂️ **기수 종료(아카이브)** + 신규 기수 추가
- 👥 카드/테이블/칸반 레이아웃 전환
- 📚 자습실 / 🎤 특강 출석 체크
- 💼 학생 상세 (지원, 면접 차수, 문서 검토, 코멘트, 등급, 취업상태, 드라이브 링크)
- 🔒 **평가·면담 탭** (학생 비공개) — 강사별 훈련생 평가 + 취업면담 이력, 희망직군 변경 승인
- 🖨️ 전체 리포트 인쇄

### 데이터 동기화 (3가지 모드)
| 모드 | 설명 | 권장 시나리오 |
|---|---|---|
| ⚪ **localStorage** (기본) | 단일 브라우저 저장 | 1대 PC 전용 |
| 🟣 **GitHub Gist** | PAT 기반 Gist 동기화 | 백엔드 없이 어디서나 |
| 🟢 **Supabase** | 실시간 PostgreSQL | 다중 사용자 실시간 |

---

## 실행 (로컬)

`app/start.bat` 더블 클릭 → 브라우저가 자동으로 열립니다.

수동:
```
cd app
python -m http.server 8765
```
→ http://localhost:8765/디벨로켓 수강생 관리.html

> ⚠️ `file://` 직접 열기는 Babel의 fetch 제약으로 동작하지 않습니다.

## 비밀번호
- **관리자**: `1124`
- **수강생**: 이름을 처음 클릭하면 비밀번호 설정. 이후 본인 비밀번호로 재로그인. 잊어버린 경우 본인 화면 우측 [🔐 비밀번호 초기화] 또는 관리자가 학생 상세 → 연락처 탭에서 재설정.

---

## 🚀 GitHub Pages 배포

이 프로젝트는 빌드 없이 정적 자산만으로 배포 가능합니다.

### 1) GitHub 저장소 생성

```bash
# (이 폴더에서) git 초기화
git init -b main
git add .
git commit -m "feat: 디벨로켓 수강생 관리 초기 배포"

# GitHub에 새 저장소 생성 후 (gh cli 또는 웹)
gh repo create develocket-students --public --source=. --push
# 또는 웹에서 생성 후
# git remote add origin https://github.com/<USER>/<REPO>.git
# git push -u origin main
```

### 2) Pages 활성화

저장소 → **Settings → Pages → Build and deployment → Source: GitHub Actions**

푸시하면 `.github/workflows/pages.yml`이 자동 실행되어 `app/` 콘텐츠를 배포합니다. 한글 파일명 문제를 피하기 위해 자동으로 `index.html`도 생성됩니다.

배포 URL 예시:
```
https://<USER>.github.io/<REPO>/
```

### 3) GitHub Gist 동기화 활성화 (선택)

배포된 사이트에서 데이터를 어디서나 동일하게 보려면:

1. [GitHub Fine-grained PAT 발급](https://github.com/settings/tokens?type=beta) — **Gists Read+Write** 권한만
2. 관리자 모드 입장 → ⚙️ 관리 → 🔌 동기화 → 🟣 GitHub Gist
3. PAT 입력 → [+ 새 Gist 생성] → [저장 후 적용]

이후 모든 변경이 비공개 Gist에 자동 백업되고, 30초 폴링으로 다른 디바이스 변경이 동기화됩니다.

> ⚠️ **보안 주의**: PAT가 브라우저 localStorage에 저장됩니다. 공용 PC에서는 절대 사용하지 마세요. 더 강력한 보안이 필요하면 Supabase 사용을 권장합니다.

### 4) Supabase 사용 (선택)

1. [Supabase 프로젝트 생성](https://supabase.com)
2. SQL Editor → `app/supabase-schema.sql` 내용 실행
3. 관리자 모드 → ⚙️ 관리 → 🔌 동기화 → 🟢 Supabase
4. Project URL + anon key 입력 → 저장 후 적용

> 🆕 **건의사항 반영(2026-06) 기능**(문서관리·희망직군 승인·평가·면담·면접이력·코멘트 읽음)을
> Supabase에서 쓰려면 SQL Editor에서 추가로 **`app/migrations/2026-06-dl-features.sql`** 를 실행하세요
> (새 테이블/컬럼 + Storage 버킷 `dl-documents`). 미실행 시에도 localStorage 모드에서는 즉시 동작합니다.

---

## 폴더 구조

```
Student management/
├── README.md
├── .gitignore
├── .github/workflows/pages.yml     ← GitHub Pages 자동 배포
├── app/                            ← 실제 배포되는 정적 앱
│   ├── 디벨로켓 수강생 관리.html
│   ├── start.bat                   ← 로컬 실행
│   ├── styles.css
│   ├── *.jsx, *.js
│   ├── supabase-schema.sql
│   └── assets/develocket-logo-tight.png
└── untitled/                       ← 원본 Claude Design 번들 (참고)
```

## 기술 스택

- **React 18** (UMD CDN) + **Babel Standalone** — 빌드 없는 SPA
- **Pretendard / JetBrains Mono** — 한글 + 모노스페이스
- **localStorage** / **GitHub Gist API** / **Supabase JS v2** — 3중 백엔드
- **Vanilla CSS** — 외부 CSS 프레임워크 없음

빌드 단계가 없어 GitHub Pages에 정적으로 그대로 올라갑니다.
