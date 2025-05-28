#!/usr/bin/env node
const blessed = require('blessed');
const chalk = require('chalk');
const { execSync } = require('child_process');

// UTF-8 인코딩 설정
process.env.LANG = 'ko_KR.UTF-8';
process.env.LC_ALL = 'ko_KR.UTF-8';

const INTERVAL = 30000; // 30초로 증가 (CPU 사용량 감소)

// UTF-8 지원을 위한 설정 추가
const screen = blessed.screen({ 
  smartCSR: true,
  unicode: true,
  fullUnicode: true,
  dockBorders: true
});
screen.title = 'Task Monitor';

let filterPriority = null;
let filterStatus = null; // 기본값은 전체 표시

const layout = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  tags: true,
  border: 'line',
  style: { border: { fg: 'cyan' } },
});

const header = blessed.box({ top: 0, height: 3, content: '', tags: true });
const tableHeader = blessed.box({
  top: 5,
  height: 1,
  tags: true,
  content: '{bold}ID   작업명                                                          상태      우선순위  진행률{/bold}',
});
const table = blessed.list({
  top: 6,
  bottom: 8,
  tags: true,
  scrollable: true,
  alwaysScroll: true,
  keys: true,
  mouse: true,
  style: {
    selected: {
      bg: 'blue',
    },
  },
});
// 추천 작업 영역
const recommendedBox = blessed.box({
  bottom: 5,
  height: 3,
  tags: true,
  label: ' 🔥 추천 다음 작업 ',
  border: 'line',
  style: { border: { fg: 'yellow' } },
});
// 서브태스크 영역
const subtaskBox = blessed.box({
  bottom: 2,
  height: 3,
  tags: true,
  label: ' 선택된 작업의 서브태스크 ',
  border: 'line',
  style: { border: { fg: 'cyan' } },
});
const footer = blessed.box({ bottom: 0, height: 2, content: '', tags: true });

layout.append(header);
layout.append(tableHeader);
layout.append(table);
layout.append(recommendedBox);
layout.append(subtaskBox);
layout.append(footer);
screen.append(layout);

screen.key(['q', 'C-c'], () => process.exit(0));
screen.key(['f'], () => {
  if (!filterPriority) filterPriority = 'high';
  else if (filterPriority === 'high') filterPriority = 'medium';
  else if (filterPriority === 'medium') filterPriority = 'low';
  else filterPriority = null;
  update(); // 즉시 업데이트
});
screen.key(['s'], () => {
  // 상태 필터 토글: 전체 → 진행중 → 대기 → 완료
  if (filterStatus === null) filterStatus = 'in-progress';
  else if (filterStatus === 'in-progress') filterStatus = 'pending';
  else if (filterStatus === 'pending') filterStatus = 'done';
  else filterStatus = null;
  update(); // 즉시 업데이트
});
screen.key(['r'], () => {
  // 수동 새로고침
  update();
});

let taskMap = [];
let etaCache = {};
let projectProgress = { tasks: {}, subtasks: {} };

// 데모 데이터 추가 (task-master가 없을 때 사용)
function getDemoTasks() {
  return [
    { id: '1', title: '웹사이트 UI 개선', status: '완료', priority: 'high', progress: 100 },
    { id: '2', title: '데이터베이스 최적화', status: '완료', priority: 'medium', progress: 100 },
    { id: '3', title: 'API 문서 작성', status: '진행중', priority: 'low', progress: 75 },
    { id: '4', title: '테스트 코드 작성', status: '진행중', priority: 'high', progress: 90 },
    { id: '5', title: '배포 스크립트 작성', status: '진행중', priority: 'medium', progress: 60 },
    { id: '6', title: '보안 검토', status: '대기', priority: 'high', progress: 0 },
    { id: '7', title: '성능 최적화', status: '대기', priority: 'medium', progress: 0 },
    { id: '8', title: '사용자 매뉴얼 작성', status: '대기', priority: 'low', progress: 0 },
    { id: '19', title: '모니터링 시스템 구현', status: '대기', priority: 'medium', progress: 0 },
  ];
}

// 데모 모드 추천 작업 데이터
function getDemoNextTask() {
  return {
    id: '19',
    title: '모니터링 시스템 구현',
    status: 'pending',
    priority: 'medium',
    dependencies: '18',
    description: '시스템 상태, 성능, 중요한 오류를 추적하기 위한 모니터링 및 알림 시스템을 생성합니다.',
    complexity: '8'
  };
}

function parseProjectProgress(output) {
  const lines = output.split('\n');
  
  // 전체 작업 진행률 파싱
  const taskProgressLine = lines.find(line => line.includes('Tasks Progress:'));
  if (taskProgressLine) {
    const match = taskProgressLine.match(/(\d+)%/);
    if (match) {
      projectProgress.tasks.percentage = parseInt(match[1]);
    }
    
    const countsMatch = taskProgressLine.match(/Done:\s*(\d+)\s*In Progress:\s*(\d+)\s*Pending:\s*(\d+)/);
    if (!countsMatch) {
      // 다음 줄에서 찾기
      const nextLine = lines[lines.indexOf(taskProgressLine) + 1];
      if (nextLine) {
        const nextMatch = nextLine.match(/Done:\s*(\d+)\s*In Progress:\s*(\d+)\s*Pending:\s*(\d+)/);
        if (nextMatch) {
          projectProgress.tasks.done = parseInt(nextMatch[1]);
          projectProgress.tasks.inProgress = parseInt(nextMatch[2]);
          projectProgress.tasks.pending = parseInt(nextMatch[3]);
        }
      }
    } else {
      projectProgress.tasks.done = parseInt(countsMatch[1]);
      projectProgress.tasks.inProgress = parseInt(countsMatch[2]);
      projectProgress.tasks.pending = parseInt(countsMatch[3]);
    }
  }
  
  // 서브작업 진행률 파싱
  const subtaskProgressLine = lines.find(line => line.includes('Subtasks Progress:'));
  if (subtaskProgressLine) {
    const match = subtaskProgressLine.match(/(\d+)%/);
    if (match) {
      projectProgress.subtasks.percentage = parseInt(match[1]);
    }
    
    const completedMatch = subtaskProgressLine.match(/Completed:\s*(\d+)\/(\d+)/);
    if (!completedMatch) {
      // 다음 줄에서 찾기
      const nextLine = lines[lines.indexOf(subtaskProgressLine) + 1];
      if (nextLine) {
        const nextMatch = nextLine.match(/Completed:\s*(\d+)\/(\d+)/);
        if (nextMatch) {
          projectProgress.subtasks.completed = parseInt(nextMatch[1]);
          projectProgress.subtasks.total = parseInt(nextMatch[2]);
        }
      }
    } else {
      projectProgress.subtasks.completed = parseInt(completedMatch[1]);
      projectProgress.subtasks.total = parseInt(completedMatch[2]);
    }
  }
}

function parseTasks(output) {
  const lines = output.split('\n');
  
  // 프로젝트 진행률 파싱
  parseProjectProgress(output);
  
  // 테이블 행을 찾기 (├──────┼ 로 시작하는 행들)
  const taskLines = lines.filter(line => 
    line.includes('│') && 
    !line.includes('┌') && 
    !line.includes('├') && 
    !line.includes('└') &&
    !line.includes('ID') && // 헤더 제외
    line.split('│').length >= 6 // 최소 6개 컬럼
  );
  
  return taskLines.map(line => {
    const parts = line.split('│').map(p => p.trim()).filter(p => p);
    
    if (parts.length < 5) return null;
    
    const id = parts[0];
    const title = parts[1];
    const status = parts[2];
    const priority = parts[3];
    const dependencies = parts[4];
    
    // 상태에 따른 진행률 계산
    let progress = 0;
    let statusText = status;
    
    if (status.includes('✓') || status.includes('done')) {
      progress = 100;
      statusText = '완료';
    } else if (status.includes('○') || status.includes('pending')) {
      progress = 0;
      statusText = '대기';
    } else if (status.includes('►') || status.includes('progress')) {
      progress = 50; // 진행중으로 가정
      statusText = '진행중';
    }
    
    return {
      id: id,
      title: title, // 원본 제목 유지, 표시할 때 자르기
      status: statusText,
      priority: priority,
      dependencies: dependencies,
      progress: progress,
      eta: progress === 100 ? '완료' : progress === 0 ? '대기중' : '진행중'
    };
  }).filter(task => task !== null);
}

async function getSubtasks(taskId) {
  try {
    const output = execSync(`task-master show ${taskId}`, { 
      encoding: 'utf-8',
      timeout: 5000 // 5초 타임아웃 추가
    });
    const lines = output.split('\n');
    
    // 서브테스크 섹션 찾기
    const subtasks = [];
    let inSubtaskSection = false;
    
    for (const line of lines) {
      if (line.includes('Subtasks:') || line.includes('서브테스크:')) {
        inSubtaskSection = true;
        continue;
      }
      
      if (inSubtaskSection) {
        // 서브테스크 라인 파싱 (예: "  1.1 ✓ Setup authentication")
        const subtaskMatch = line.match(/\s*(\d+\.\d+)\s*([✓○►]?)\s*(.+)/);
        if (subtaskMatch) {
          const [, id, statusSymbol, title] = subtaskMatch;
          let status = '대기';
          let progress = 0;
          
          if (statusSymbol === '✓') {
            status = '완료';
            progress = 100;
          } else if (statusSymbol === '►') {
            status = '진행중';
            progress = 50;
          }
          
          subtasks.push({
            id: id,
            title: title.trim(),
            status: status,
            progress: progress,
            isSubtask: true
          });
        } else if (line.trim() === '' || line.includes('───')) {
          // 빈 줄이나 구분선을 만나면 서브테스크 섹션 종료
          break;
        }
      }
    }
    
    return subtasks;
  } catch (e) {
    // 에러 시 빈 배열 반환
    return [];
  }
}

function progressBar(percentage) {
  const blocks = Math.round(percentage / 10);
  return `[${'█'.repeat(blocks)}${' '.repeat(10 - blocks)}]`;
}

async function getNextTask() {
  try {
    // 먼저 task-master list를 시도하여 추천 작업 정보를 파싱
    let output;
    try {
      output = execSync('task-master list', { 
        encoding: 'utf-8',
        timeout: 5000
      });
      
      // list 출력에서 추천 작업 정보 파싱 시도
      const nextTask = parseNextTaskFromList(output);
      if (nextTask && nextTask.id) {
        return nextTask;
      }
      
      // list에서 추천 작업을 찾지 못하면 next 명령어 시도
      try {
        output = execSync('task-master next', { 
          encoding: 'utf-8',
          timeout: 5000
        });
      } catch (e) {
        // next 명령어도 실패하면 데모 추천 작업 반환
        return getDemoNextTask();
      }
    } catch (e) {
      // list 명령어가 실패하면 next 명령어 시도
      try {
        output = execSync('task-master next', { 
          encoding: 'utf-8',
          timeout: 5000
        });
      } catch (e2) {
        // 모든 task-master 명령어가 실패하면 데모 추천 작업 반환
        return getDemoNextTask();
      }
    }
    
    // 추천 작업 정보 파싱 - 새로운 형식에 맞게 수정
    const lines = output.split('\n');
    let nextTask = {};
    let inRecommendedSection = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // "⚡ RECOMMENDED NEXT TASK ⚡" 섹션 시작 감지 (여러 형식 지원)
      if (line.includes('⚡ RECOMMENDED NEXT TASK ⚡') || 
          line.includes('RECOMMENDED NEXT TASK') ||
          line.includes('── ⚡ RECOMMENDED NEXT TASK ⚡ ──')) {
        inRecommendedSection = true;
        continue;
      }
      
      // 섹션이 끝나면 파싱 중단
      if (inRecommendedSection && (line.includes('╰─────') || line.includes('└─────') || line.includes('╰─') || line.includes('└─'))) {
        break;
      }
      
      if (inRecommendedSection) {
        const cleanLine = line.replace(/[│╭╮╯╰─┌┐└┘├┤┬┴┼]/g, '').trim();
        
        // "🔥 Next Task to Work On: #19 - Implement Monitoring System" 형식
        if (cleanLine.includes('🔥 Next Task to Work On:')) {
          const match = cleanLine.match(/🔥\s*Next Task to Work On:\s*#?(\d+(?:\.\d+)?)\s*-\s*(.+)/);
          if (match) {
            nextTask.id = match[1];
            nextTask.title = match[2].trim();
          }
        }
        
        // "Priority: medium   Status: ○ pending" 형식
        else if (cleanLine.includes('Priority:') && cleanLine.includes('Status:')) {
          const priorityMatch = cleanLine.match(/Priority:\s*(\w+)/);
          const statusMatch = cleanLine.match(/Status:\s*[►○✓]?\s*(\w+(?:-\w+)?)/);
          if (priorityMatch) nextTask.priority = priorityMatch[1];
          if (statusMatch) nextTask.status = statusMatch[1];
        }
        
        // "Dependencies: 18" 형식
        else if (cleanLine.includes('Dependencies:') && !cleanLine.includes('Priority:')) {
          const depMatch = cleanLine.match(/Dependencies:\s*(.+)/);
          if (depMatch) nextTask.dependencies = depMatch[1].trim();
        }
        
        // "Description: Create a monitoring and alerting system..." 형식
        else if (cleanLine.includes('Description:')) {
          const descMatch = cleanLine.match(/Description:\s*(.+)/);
          if (descMatch) nextTask.description = descMatch[1].trim();
        }
        
        // 다음 줄의 description 연결 처리 (여러 줄 description 지원)
        else if (nextTask.description && cleanLine && 
                !cleanLine.includes(':') && 
                !cleanLine.includes('Subtasks:') &&
                !cleanLine.includes('Start working:') &&
                !cleanLine.includes('View details:') &&
                !cleanLine.includes('🔥') &&
                cleanLine.length > 10) {
          nextTask.description += ' ' + cleanLine;
        }
      }
    }
    
    return nextTask;
  } catch (e) {
    // 모든 명령어가 실패하면 데모 추천 작업 반환
    return getDemoNextTask();
  }
}

// task-master list 출력에서 Next Task 정보를 파싱하는 함수 (fallback)
function parseNextTaskFromList(output) {
  const lines = output.split('\n');
  let nextTask = {};
  let inRecommendedSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // "⚡ RECOMMENDED NEXT TASK ⚡" 섹션 찾기
    if (line.includes('⚡ RECOMMENDED NEXT TASK ⚡') || 
        line.includes('RECOMMENDED NEXT TASK') ||
        line.includes('── ⚡ RECOMMENDED NEXT TASK ⚡ ──')) {
      inRecommendedSection = true;
      continue;
    }
    
    // 섹션이 끝나면 파싱 중단
    if (inRecommendedSection && (line.includes('╰─────') || line.includes('└─────'))) {
      break;
    }
    
    if (inRecommendedSection) {
      const cleanLine = line.replace(/[│╭╮╯╰─┌┐└┘├┤┬┴┼]/g, '').trim();
      
      // "🔥 Next Task to Work On: #19 - Implement Monitoring System" 형식
      if (cleanLine.includes('🔥 Next Task to Work On:')) {
        const match = cleanLine.match(/🔥\s*Next Task to Work On:\s*#?(\d+(?:\.\d+)?)\s*-\s*(.+)/);
        if (match) {
          nextTask.id = match[1];
          nextTask.title = match[2].trim();
        }
      }
      
      // "Priority: medium   Status: ○ pending" 형식
      else if (cleanLine.includes('Priority:') && cleanLine.includes('Status:')) {
        const priorityMatch = cleanLine.match(/Priority:\s*(\w+)/);
        const statusMatch = cleanLine.match(/Status:\s*[►○✓]?\s*(\w+(?:-\w+)?)/);
        if (priorityMatch) nextTask.priority = priorityMatch[1];
        if (statusMatch) nextTask.status = statusMatch[1];
      }
      
      // "Dependencies: 18" 형식  
      else if (cleanLine.includes('Dependencies:') && !cleanLine.includes('Priority:')) {
        const depMatch = cleanLine.match(/Dependencies:\s*(.+)/);
        if (depMatch) nextTask.dependencies = depMatch[1].trim();
      }
      
      // "Description: Create a monitoring and alerting system..." 형식
      else if (cleanLine.includes('Description:')) {
        const descMatch = cleanLine.match(/Description:\s*(.+)/);
        if (descMatch) nextTask.description = descMatch[1].trim();
      }
      
      // 다음 줄의 description 연결 처리
      else if (nextTask.description && cleanLine && 
              !cleanLine.includes(':') && 
              !cleanLine.includes('Subtasks:') &&
              !cleanLine.includes('Start working:') &&
              !cleanLine.includes('View details:') &&
              !cleanLine.includes('🔥') &&
              cleanLine.length > 10) {
        nextTask.description += ' ' + cleanLine;
      }
    }
  }
  
  return nextTask;
}

async function render(tasks) {
  const now = new Date().toLocaleTimeString('ko-KR');
  
  // 상태별 필터링
  let filteredTasks = tasks;
  if (filterStatus === 'in-progress') {
    filteredTasks = tasks.filter(task => task.status === '진행중');
  } else if (filterStatus === 'pending') {
    filteredTasks = tasks.filter(task => task.status === '대기');
  } else if (filterStatus === 'done') {
    filteredTasks = tasks.filter(task => task.status === '완료');
  }
  // filterStatus가 null이면 전체 표시
  
  const statusFilterText = filterStatus === 'in-progress' ? '진행중' : 
                          filterStatus === 'pending' ? '대기' : 
                          filterStatus === 'done' ? '완료' : '전체';
  
  // 프로젝트 진행률 표시
  const tasksProgressBar = projectProgress.tasks.percentage !== undefined ? 
    `작업: ${progressBar(projectProgress.tasks.percentage)} ${projectProgress.tasks.percentage}%` : '';
  const subtasksProgressBar = projectProgress.subtasks.percentage !== undefined ? 
    `서브작업: ${progressBar(projectProgress.subtasks.percentage)} ${projectProgress.subtasks.percentage}%` : '';
  
  // 작업 개수 정보
  const taskCounts = projectProgress.tasks.done !== undefined ? 
    `완료: ${projectProgress.tasks.done}개  진행중: ${projectProgress.tasks.inProgress}개  대기: ${projectProgress.tasks.pending}개  총: ${projectProgress.tasks.done + projectProgress.tasks.inProgress + projectProgress.tasks.pending}개` : 
    `총 작업: ${tasks.length}개`;
  
  const subtaskCounts = projectProgress.subtasks.completed !== undefined && projectProgress.subtasks.total !== undefined ?
    `서브작업: ${projectProgress.subtasks.completed}/${projectProgress.subtasks.total}개 완료` : '';
  
  // 2줄로 압축 표시
  const line1 = `{bold}Task Monitor{/} - ${now} ${filterPriority ? `(우선순위: ${filterPriority})` : ''} (상태: ${statusFilterText})  |  ${tasksProgressBar}  |  ${subtasksProgressBar}`;
  const line2 = `${taskCounts}${subtaskCounts ? `  |  ${subtaskCounts}` : ''}  |  표시 중: ${filteredTasks.length}건`;
  
  header.setContent(`${line1}\n${line2}`);

  let displayTasks = filteredTasks;
  
  if (filterPriority) {
    displayTasks = displayTasks.filter(t => t.priority === filterPriority);
  }

  // 전체 작업 표시 (서브태스크 제외)
  let displayItems = [];
  
  for (const task of displayTasks) {
    displayItems.push(task);
    // 서브태스크는 가져오지 않음 - CPU 사용량 감소
  }

  taskMap = displayItems;
  table.setItems(displayItems.map(item => {
    // 메인 테스크만 표시 (60자로 확장)
    const color = item.priority === 'high' ? 'red' : item.priority === 'medium' ? 'yellow' : 'green';
    const statusColor = item.status === '완료' ? 'green' : item.status === '진행중' ? 'blue' : 'gray';
    const truncatedTitle = item.title.length > 60 ? item.title.substring(0, 57) + '...' : item.title;
    return `{${color}-fg}${item.id.padEnd(4)} ${truncatedTitle.padEnd(60)} {${statusColor}-fg}${item.status.padEnd(8)}{/} ${item.priority.padEnd(8)} ${progressBar(item.progress)} ${item.progress.toString().padStart(3)}%{/}`;
  }));

  // 기본적으로 추천 작업 정보 표시
  const nextTask = await getNextTask();
  if (nextTask && nextTask.id) {
    const priorityColor = nextTask.priority === 'high' ? 'red' : nextTask.priority === 'medium' ? 'yellow' : 'green';
    const priorityText = nextTask.priority === 'high' ? '높음' : nextTask.priority === 'medium' ? '중간' : '낮음';
    const statusText = nextTask.status === 'in-progress' ? '진행중' : nextTask.status === 'pending' ? '대기' : nextTask.status === 'done' ? '완료' : nextTask.status;
    const statusSymbol = nextTask.status === 'in-progress' ? '►' : nextTask.status === 'pending' ? '○' : nextTask.status === 'done' ? '✓' : '?';
    
    // 제목과 설명을 각각 다른 줄에 표시
    const shortTitle = nextTask.title.length > 45 ? nextTask.title.substring(0, 42) + '...' : nextTask.title;
    const shortDesc = nextTask.description && nextTask.description.length > 65 ? 
      nextTask.description.substring(0, 62) + '...' : nextTask.description || '';
    
    // 복잡도 정보 처리
    const complexityInfo = nextTask.complexity ? ` | 복잡도: ${nextTask.complexity}` : '';
    
    let content = `{bold}{yellow-fg}🔥 추천 작업: #{${nextTask.id}} ${shortTitle}{/}\n`;
    content += `{${priorityColor}-fg}우선순위: ${priorityText}{/} ${statusSymbol} ${statusText}${nextTask.dependencies ? ` | 종속성: ${nextTask.dependencies}` : ''}${complexityInfo}\n`;
    
    if (shortDesc) {
      content += `${shortDesc}`;
    } else {
      content += `{gray-fg}상세 정보: task-master show ${nextTask.id}{/}`;
    }
    
    recommendedBox.setContent(content);
  } else {
    // 추천 작업이 없을 때
    recommendedBox.setContent(`{bold}{yellow-fg}🔥 추천 다음 작업{/}\n` +
      `{gray-fg}현재 추천할 작업이 없습니다.{/}\n` +
      `{gray-fg}새 작업을 추가하거나 기존 작업 상태를 확인하세요.{/}`);
  }

  footer.setContent('{gray-fg}↑↓ 선택 / f 우선순위 / s 상태 / r 새로고침 / q 종료{/}');
  
  // 서브태스크 영역 초기화
  subtaskBox.setLabel(' 선택된 작업의 서브태스크 ');
  subtaskBox.setContent('{gray-fg}작업을 선택하면 서브태스크가 표시됩니다.{/}');
  
  screen.render();
}

async function update() {
  try {
    // task-master 명령어 시도
    const output = execSync('task-master list', { 
      encoding: 'utf-8',
      timeout: 10000 // 10초 타임아웃
    });
    const tasks = parseTasks(output);
    
    if (tasks.length > 0) {
      await render(tasks);
    } else {
      recommendedBox.setContent(`{yellow-fg}task-master에서 작업을 찾을 수 없습니다.{/}`);
      const demoTasks = getDemoTasks();
      await render(demoTasks);
    }
  } catch (e) {
    // task-master가 없으면 데모 데이터 사용
    const demoTasks = getDemoTasks();
    
    // 데모 모드에서는 추천 작업 정보도 데모로 표시
    recommendedBox.setContent(`{yellow-fg}task-master를 찾을 수 없습니다. 데모 모드로 실행합니다.{/}`);
    
    await render(demoTasks);
  }
}

async function showSubtasks(taskId) {
  try {
    subtaskBox.setLabel(` 작업 #${taskId}의 서브태스크 `);
    
    const subtasks = await getSubtasks(taskId);
    if (subtasks.length > 0) {
      // 최대 3개의 서브태스크만 표시 (3줄 공간 활용)
      const displaySubtasks = subtasks.slice(0, 3);
      const subtaskContent = displaySubtasks.map(subtask => {
        const statusColor = subtask.status === '완료' ? 'green' : subtask.status === '진행중' ? 'blue' : 'gray';
        const statusSymbol = subtask.status === '완료' ? '✓' : subtask.status === '진행중' ? '►' : '○';
        // 제목 길이 제한
        const shortTitle = subtask.title.length > 60 ? subtask.title.substring(0, 57) + '...' : subtask.title;
        return `{${statusColor}-fg}${statusSymbol} ${subtask.id} ${shortTitle} [${subtask.progress}%]{/}`;
      }).join('\n');
      
      // 더 많은 서브태스크가 있는 경우 안내
      const moreInfo = subtasks.length > 3 ? `\n{gray-fg}... 외 ${subtasks.length - 3}개 더 (task-master show ${taskId}){/}` : '';
      
      subtaskBox.setContent(subtaskContent + moreInfo);
    } else {
      subtaskBox.setContent(`{gray-fg}작업 #${taskId}에 서브태스크가 없습니다.{/}\n` +
        `{gray-fg}서브태스크를 추가하려면:{/}\n` +
        `{gray-fg}task-master expand ${taskId}{/}`);
    }
    screen.render();
  } catch (e) {
    subtaskBox.setContent(`{red-fg}서브태스크 로딩 오류:{/}\n` +
      `{red-fg}${e.message}{/}\n` +
      `{gray-fg}다시 시도하거나 수동으로 확인하세요.{/}`);
    screen.render();
  }
}

table.on('select', (_, index) => {
  const task = taskMap[index];
  if (task) {
    showSubtasks(task.id);
  }
});

// 초기 업데이트 및 주기적 업데이트 시작
update();
setInterval(update, INTERVAL);