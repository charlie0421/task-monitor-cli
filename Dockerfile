FROM node:18-alpine

WORKDIR /app

# 의존성 파일 복사 및 설치
COPY package*.json ./
RUN npm ci --only=production

# 애플리케이션 코드 복사
COPY src/ ./src/

# UTF-8 지원을 위한 설정
ENV LANG=ko_KR.UTF-8
ENV LC_ALL=ko_KR.UTF-8

# 실행 권한 설정
RUN chmod +x src/index.js

# 기본 명령어
CMD ["node", "src/index.js"] 