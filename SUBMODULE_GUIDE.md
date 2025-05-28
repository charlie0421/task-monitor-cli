# 📁 Git 서브모듈로 Task Monitor CLI 사용하기

다른 프로젝트에서 Task Monitor CLI를 Git 서브모듈로 사용하는 방법입니다.

## 🚀 빠른 시작

### 1단계: 서브모듈 추가

```bash
# 메인 프로젝트 루트에서
git submodule add https://github.com/charlie0421/task-monitor-cli.git tools/task-monitor
```

### 2단계: 초기화 및 설치

```bash
# 서브모듈 초기화
git submodule init
git submodule update

# 의존성 설치
cd tools/task-monitor
npm install
cd ../..
```

### 3단계: package.json 설정

메인 프로젝트의 `package.json`에 스크립트 추가:

```json
{
  "scripts": {
    "monitor": "node tools/task-monitor/src/index.js",
    "monitor:update": "git submodule update --remote tools/task-monitor && cd tools/task-monitor && npm install",
    "monitor:install": "bash tools/task-monitor/scripts/install-submodule.sh"
  }
}
```

## 📋 일상적인 사용법

### 모니터 실행
```bash
npm run monitor
```

### 업데이트
```bash
npm run monitor:update
```

### 특정 버전으로 고정
```bash
cd tools/task-monitor
git checkout v1.2.0  # 원하는 버전
cd ../..
git add tools/task-monitor
git commit -m "Update task-monitor to v1.2.0"
```

## 🔄 팀원 온보딩

### 새로운 개발자가 프로젝트를 클론할 때

```bash
# 1. 메인 프로젝트 클론
git clone https://github.com/team/main-project.git
cd main-project

# 2. 서브모듈 포함해서 클론 (또는)
git clone --recurse-submodules https://github.com/team/main-project.git

# 3. 기존 클론에서 서브모듈 초기화
git submodule init
git submodule update

# 4. Task Monitor 설정
cd tools/task-monitor
npm install
npm link --force  # 글로벌 명령어 원하는 경우
```

## 🛠️ 고급 사용법

### 서브모듈을 최신 버전으로 업데이트
```bash
git submodule update --remote tools/task-monitor
cd tools/task-monitor
npm install
cd ../..
git add tools/task-monitor
git commit -m "Update task-monitor to latest"
```

### 로컬에서 task-monitor 수정 후 기여
```bash
cd tools/task-monitor
# 수정 작업...
git add .
git commit -m "Fix: some issue"
git push origin feature/fix

# 메인 프로젝트에서 업데이트된 서브모듈 반영
cd ../..
git add tools/task-monitor
git commit -m "Update task-monitor with local fixes"
```

### 서브모듈 제거
```bash
# 1. .gitmodules에서 해당 섹션 제거
# 2. .git/config에서 해당 섹션 제거
# 3. 서브모듈 디렉토리 제거
git rm --cached tools/task-monitor
rm -rf tools/task-monitor
git commit -m "Remove task-monitor submodule"
```

## 🔒 버전 관리 전략

### 안정성 우선 (권장)
```bash
# 태그된 안정 버전 사용
cd tools/task-monitor
git checkout v1.0.0
cd ../..
git add tools/task-monitor
git commit -m "Pin task-monitor to stable v1.0.0"
```

### 최신 기능 우선
```bash
# 항상 main 브랜치 최신 버전 사용
git submodule update --remote tools/task-monitor
```

## 📦 자동화 스크립트

### CI/CD에서 서브모듈 처리
```yaml
# GitHub Actions 예시
- name: Checkout with submodules
  uses: actions/checkout@v3
  with:
    submodules: recursive

- name: Install task-monitor dependencies
  run: |
    cd tools/task-monitor
    npm install
```

### 개발 환경 셋업 스크립트
```bash
#!/bin/bash
# setup-dev.sh

echo "🛠️ 개발 환경 설정 중..."

# 메인 프로젝트 의존성
npm install

# 서브모듈 초기화
git submodule init
git submodule update

# Task Monitor 설정
cd tools/task-monitor
npm install
npm link --force
cd ../..

echo "✅ 개발 환경 설정 완료!"
echo "사용법: npm run monitor 또는 task-monitor"
```

## 🤝 팀 워크플로우

1. **서브모듈 버전 고정**: 안정적인 특정 커밋/태그 사용
2. **정기 업데이트**: 월 1회 또는 필요시 서브모듈 업데이트
3. **로컬 수정 시**: Fork → 수정 → PR → 메인에 반영 후 서브모듈 업데이트
4. **문서화**: README에 서브모듈 사용법 명시

## 🔍 트러블슈팅

### 서브모듈이 비어있을 때
```bash
git submodule init
git submodule update
```

### 서브모듈 변경사항이 반영 안될 때
```bash
git submodule update --remote
```

### npm link 충돌 시
```bash
npm unlink -g task-monitor-cli
cd tools/task-monitor
npm link --force
``` 