// 디벨로켓 수강생 명단 (시드 템플릿)
//
// ⚠️ 공개 저장소에는 학생 개인정보(이름·이메일·전화·주소·생년월일)를 포함하지 마세요.
// 실명단은 운영 환경에서 다음 중 하나로 등록하세요:
//   1) 관리자 모드 → ⚙️ 관리 → 👥 수강생 → "수강생 추가"
//   2) 관리자 모드 → ⚙️ 관리 → 🔌 동기화 (GitHub Gist / Supabase)
//
// 이 파일은 기수 메타데이터(라벨/트랙/회차/색상)만 정의합니다.
// 실제 학생 데이터는 localStorage 또는 동기화된 백엔드에 저장됩니다.

window.STUDENT_ROSTER = {
  '기획3기': {
    label: '기획 3기',
    track: '생성형 AI를 활용한 게임 기획자 과정',
    round: '3회차',
    color: '#7C5CFF',
    students: []
  },
  '프로그램3기': {
    label: '프로그램 3기',
    track: 'XR기술을 활용한 게임 개발자 과정',
    round: '3회차',
    color: '#FF8A3D',
    students: []
  }
};

// 자습실/특강 출석 시드 (비어있음 — 운영 데이터는 localStorage/Supabase 사용)
window.ATTENDANCE_SEED = {
  study_room: {},
  lectures: {}
};
