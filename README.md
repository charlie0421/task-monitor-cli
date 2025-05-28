# 🖥️ Task Monitor CLI

한국어 터미널 기반 작업 모니터링 CLI 애플리케이션입니다. [Task Master](https://github.com/taskmaster-ai/taskmaster) CLI 도구와 통합되어 작업을 실시간으로 모니터링할 수 있습니다.

## 🚀 특징

- **실시간 한국어 작업 모니터링** - 올바른 인코딩으로 한국어 완벽 지원
- **상태 및 우선순위 필터링** - 진행 상황에 따른 작업 필터링
- **작업 선택 및 서브태스크 표시** - 선택한 작업의 상세 서브태스크 조회
- **추천 다음 작업 표시** - 종속성과 우선순위를 고려한 추천 시스템 (v0.15.0 호환)
- **성능 최적화** - 최소한의 CPU 사용량으로 효율적인 모니터링
- **종합적인 진행률 시각화** - 진행률 바와 작업 개수 통계
- **데모 모드 지원** - Task Master가 없어도 기능 확인 가능

## 🔧 최근 업데이트

- **v1.1.1**: 추천 작업 파싱 성능 개선
  - `task-master list` 명령어 우선 사용으로 중복 호출 방지
  - 추천 작업 정보 파싱 로직 최적화
- **v1.1.0**: Task Master v0.15.0 출력 형식 호환성 개선
  - `⚡ RECOMMENDED NEXT TASK ⚡` 섹션 파싱 지원
  - 다중 줄 설명(Description) 파싱 개선
  - 복잡도(Complexity) 정보 표시 추가
  - 한국어 상태 및 우선순위 표시 개선
  - 데모 모드 추천 작업 시뮬레이션 추가

## 📦 설치 방법

### 방법 1: NPM 글로벌 설치 (추천)

```bash
npm install -g task-monitor-cli
```

### 방법 2: GitHub에서 직접 설치

```bash
npm install -g git+https://github.com/charlie0421/task-monitor-cli.git
```

### 방법 3: Git 서브모듈 (팀 프로젝트 추천)

```bash
# 메인 프로젝트에서 서브모듈로 추가
git submodule add https://github.com/charlie0421/task-monitor-cli.git tools/task-monitor
git submodule init && git submodule update
cd tools/task-monitor && npm install && cd ../..

# package.json에 스크립트 추가
# "monitor": "node tools/task-monitor/src/index.js"
```

### 방법 4: 로컬 개발용

```bash
git clone https://github.com/charlie0421/task-monitor-cli.git
cd task-monitor-cli
npm install
npm start
```

## 🎯 사용법

터미널에서 다음 명령어로 실행:

```bash
task-monitor
```

또는 직접 실행:

```bash
node src/index.js
```

## ⌨️ 키보드 단축키

- `↑↓` - 작업 선택
- `f` - 우선순위 필터링 (high → medium → low → 전체)
- `s` - 상태 필터링 (전체 → 진행중 → 대기 → 완료)
- `r` - 수동 새로고침
- `q` 또는 `Ctrl+C` - 종료

## 🔧 요구사항

- **Node.js** 14.0.0 이상
- **Task Master CLI** (선택사항 - 없으면 데모 모드로 실행)

## 📊 UI 구성

```
┌─ Task Monitor ─────────────────────────────┐
│ 헤더 정보 (시간, 필터, 진행률, 작업 개수)      │
├───────────────────────────────────────────┤
│ 작업 목록 테이블                            │
│                                           │
├─ 🔥 추천 다음 작업 ──────────────────────┤
│ 추천 작업 정보 (3줄)                       │
├─ 선택된 작업의 서브태스크 ──────────────────┤
│ 서브태스크 정보 (3줄)                      │
├───────────────────────────────────────────┤
│ 키보드 단축키 안내                          │
└───────────────────────────────────────────┘
```