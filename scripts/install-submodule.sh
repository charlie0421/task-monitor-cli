#!/bin/bash

# Task Monitor CLI 서브모듈 설치 스크립트

echo "🚀 Task Monitor CLI 서브모듈 설치 중..."

# 1. 서브모듈 추가 (이미 있으면 건너뛰기)
if [ ! -d "tools/task-monitor" ]; then
    echo "📦 서브모듈 추가 중..."
    git submodule add https://github.com/charlie0421/task-monitor-cli.git tools/task-monitor
else
    echo "✅ 서브모듈이 이미 존재합니다."
fi

# 2. 서브모듈 초기화 및 업데이트
echo "🔄 서브모듈 초기화 및 업데이트 중..."
git submodule init
git submodule update

# 3. task-monitor 의존성 설치
echo "📚 Task Monitor 의존성 설치 중..."
cd tools/task-monitor
npm install

# 4. 글로벌 링크 생성 (선택사항)
echo "🔗 글로벌 링크 생성 중..."
npm link --force

cd ../..

# 5. package.json에 스크립트 추가 제안
echo "✨ 설치 완료!"
echo ""
echo "📝 package.json에 다음 스크립트를 추가하는 것을 권장합니다:"
echo ""
echo '"scripts": {'
echo '  "monitor": "node tools/task-monitor/src/index.js",'
echo '  "monitor:update": "git submodule update --remote tools/task-monitor && cd tools/task-monitor && npm install"'
echo '}'
echo ""
echo "사용법:"
echo "  npm run monitor           # Task Monitor 실행"
echo "  npm run monitor:update    # Task Monitor 업데이트"
echo "  task-monitor              # 글로벌 명령어 (링크 생성 시)" 