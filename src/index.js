#!/usr/bin/env node
const blessed = require('blessed');
const chalk = require('chalk');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// UTF-8 인코딩 설정
process.env.LANG = 'en_US.UTF-8';
process.env.LC_ALL = 'en_US.UTF-8';

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
let selectedTaskId = null; // 선택된 작업 ID

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
const table = blessed.list({
  top: 3,
  bottom: 13,
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

// 서브태스크 표시 영역 추가
const subtaskBox = blessed.box({
  bottom: 1,
  height: 12,
  tags: true,
  label: ' 📋 Selected Task Subtasks ',
  border: 'line',
  style: { border: { fg: 'green' } },
  scrollable: true,
  alwaysScroll: true,
});

const footer = blessed.box({ bottom: 0, height: 1, content: '', tags: true });

layout.append(header);
layout.append(table);
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

// Enter 키로 명시적 선택
screen.key(['enter'], async () => {
  const selectedIndex = table.selected;
  
  if (taskMap[selectedIndex] && taskMap[selectedIndex].id) {
    selectedTaskId = taskMap[selectedIndex].id;
    await updateSelectedTaskSubtasks();
  } else {
    subtaskBox.setContent('{red-fg}선택된 작업이 없습니다. 방향키로 작업을 선택해주세요.{/}');
    screen.render();
  }
});

// 방향키로 이동할 때도 자동 선택
table.on('select', async (item, index) => {  
  if (taskMap[index] && taskMap[index].id) {
    selectedTaskId = taskMap[index].id;
    // 실시간으로 서브태스크 업데이트 (방향키 이동 시)
    await updateSelectedTaskSubtasks();
  }
});

// 초기 작업 선택 함수 추가
function selectInitialTask(tasks) {
  if (!tasks || tasks.length === 0) return;
  
  // 1. 진행중인 작업 찾기
  let targetIndex = tasks.findIndex(task => task.status === 'in-progress');
  
  // 2. 진행중인 작업이 없으면 첫 번째 작업 선택
  if (targetIndex === -1) {
    targetIndex = 0;
  }
  
  // 3. 작업 선택
  if (targetIndex >= 0 && targetIndex < tasks.length) {
    selectedTaskId = tasks[targetIndex].id;
    table.selected = targetIndex; // blessed list의 선택 상태 설정
  }
}

let taskMap = [];
let etaCache = {};
let projectProgress = { tasks: {}, subtasks: {} };
let allTasks = []; // 전체 작업 목록 저장

// tasks.json 파일을 직접 읽어서 작업 정보 가져오기
function getTasksFromJson() {
  try {
    // tasks/tasks.json 파일 경로 찾기
    const possiblePaths = [
      'tasks/tasks.json',
      './tasks/tasks.json',
      '../tasks/tasks.json'
    ];
    
    let tasksFilePath = null;
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        tasksFilePath = possiblePath;
        break;
      }
    }
    
    if (!tasksFilePath) {
      console.log('tasks.json 파일을 찾을 수 없습니다.');
      return null;
    }
    
    const data = fs.readFileSync(tasksFilePath, 'utf-8');
    const jsonData = JSON.parse(data);
    
    // JSON에서 작업 목록과 진행률 정보 추출
    const tasks = jsonData.tasks || [];
    
    // 프로젝트 진행률 계산
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter(t => t.status === 'done').length;
    const inProgressTasks = tasks.filter(t => t.status === 'in-progress').length;
    const pendingTasks = tasks.filter(t => t.status === 'pending').length;
    
    projectProgress.tasks = {
      done: doneTasks,
      inProgress: inProgressTasks,
      pending: pendingTasks,
      percentage: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
    };
    
    // 서브태스크 진행률 계산
    let totalSubtasks = 0;
    let completedSubtasks = 0;
    
    tasks.forEach(task => {
      if (task.subtasks && task.subtasks.length > 0) {
        totalSubtasks += task.subtasks.length;
        completedSubtasks += task.subtasks.filter(st => st.status === 'done').length;
      }
    });
    
    projectProgress.subtasks = {
      total: totalSubtasks,
      completed: completedSubtasks,
      percentage: totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0
    };
    
    // 작업 데이터를 표시용 형식으로 변환
    return tasks.map(task => {
      // 진행률을 status 기반으로 일관성 있게 계산
      let progress = 0;
      if (task.status === 'done') progress = 100;
      else if (task.status === 'in-progress') progress = 50;
      else progress = 0; // pending 또는 기타 상태
      
      return {
        id: task.id.toString(),
        title: task.title, // 전체 제목 유지
        status: task.status,
        priority: task.priority,
        dependencies: task.dependencies && task.dependencies.length > 0 ? task.dependencies.join(', ') : 'none',
        progress: progress,
        eta: task.status === 'done' ? 'done' : task.status === 'in-progress' ? 'in-progress' : 'pending',
        subtasks: task.subtasks || []
      };
    });
    
  } catch (error) {
    console.error('tasks.json 파일 읽기 오류:', error.message);
    return null;
  }
}

// 데모 데이터 추가 (task-master가 없을 때 사용)
function getDemoTasks() {
  return [
    { id: '1', title: 'Improve Website UI', status: 'done', priority: 'high', progress: 100, dependencies: 'none' },
    { id: '2', title: 'Optimize Database', status: 'done', priority: 'medium', progress: 100, dependencies: '1' },
    { id: '3', title: 'Write API Documentation', status: 'in-progress', priority: 'low', progress: 75, dependencies: '2' },
    { id: '4', title: 'Write Test Code', status: 'in-progress', priority: 'high', progress: 90, dependencies: 'none' },
    { id: '5', title: 'Create Deployment Script', status: 'in-progress', priority: 'medium', progress: 60, dependencies: '4' },
    { id: '6', title: 'Security Review', status: 'pending', priority: 'high', progress: 0, dependencies: '3,4' },
    { id: '7', title: 'Performance Optimization', status: 'pending', priority: 'medium', progress: 0, dependencies: '5' },
    { id: '8', title: 'Write User Manual', status: 'pending', priority: 'low', progress: 0, dependencies: '3' },
    { id: '19', title: 'Implement Monitoring System', status: 'pending', priority: 'medium', progress: 0, dependencies: '6,7' },
  ];
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
    
    // 상태에 따른 진행률 계산 - 일관성 있게 수정
    let progress = 0;
    let statusText = status;
    
    if (status.includes('✓') || status.includes('done')) {
      progress = 100;
      statusText = 'done';
    } else if (status.includes('○') || status.includes('pending')) {
      progress = 0;
      statusText = 'pending';
    } else if (status.includes('►') || status.includes('progress')) {
      progress = 50; // 진행중
      statusText = 'in-progress';
    }
    
    return {
      id: id,
      title: title, // 원본 제목 유지, 표시할 때 자르기
      status: statusText,
      priority: priority,
      dependencies: dependencies,
      progress: progress,
      eta: progress === 100 ? 'done' : progress === 0 ? 'pending' : 'in-progress'
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
      // 서브태스크 섹션 시작 감지 (다양한 형식 지원)
      if (line.includes('Subtasks:') || line.includes('서브테스크:') || line.includes('Sub-tasks:')) {
        inSubtaskSection = true;
        continue;
      }
      
      if (inSubtaskSection) {
        // 서브테스크 라인 파싱 (예: "  1.1 ✓ Setup authentication" 또는 "1.1 ○ pending Setup authentication")
        const subtaskMatch = line.match(/\s*(\d+\.\d+)\s*([✓○►]?)\s*(\w+\s+)?(.+)/);
        if (subtaskMatch) {
          const [, id, statusSymbol, statusText, title] = subtaskMatch;
          let status = 'pending';
          let progress = 0;
          
          if (statusSymbol === '✓' || (statusText && statusText.includes('done'))) {
            status = 'done';
            progress = 100;
          } else if (statusSymbol === '►' || (statusText && statusText.includes('progress'))) {
            status = 'in-progress';
            progress = 50;
          } else if (statusSymbol === '○' || (statusText && statusText.includes('pending'))) {
            status = 'pending';
            progress = 0;
          }
          
          // 제목에서 상태 텍스트 제거
          let cleanTitle = title ? title.trim() : '';
          if (statusText && cleanTitle.startsWith(statusText.trim())) {
            cleanTitle = cleanTitle.substring(statusText.trim().length).trim();
          }
          
          if (cleanTitle) {
            subtasks.push({
              id: id,
              title: cleanTitle,
              status: status,
              progress: progress,
              isSubtask: true
            });
          }
        } else if (line.trim() === '' || line.includes('───') || line.includes('Start working:') || line.includes('View details:')) {
          // 빈 줄이나 구분선, 또는 다른 섹션을 만나면 서브테스크 섹션 종료
          break;
        }
      }
    }
    
    return subtasks;
  } catch (e) {
    // 에러 시 빈 배열 반환
    console.error(`Error getting subtasks for task ${taskId}:`, e.message);
    return [];
  }
}

function progressBar(percentage) {
  const blocks = Math.round(percentage / 10);
  return `[${'█'.repeat(blocks)}${' '.repeat(10 - blocks)}]`;
}

// 선택된 작업의 서브태스크 업데이트 함수
async function updateSelectedTaskSubtasks() {
  if (!selectedTaskId || !allTasks) {
    const message = '{gray-fg}↑↓ 방향키로 작업을 선택하고 Enter를 누르세요{/}';
    subtaskBox.setContent(message);
    screen.render();
    return;
  }

  const selectedTask = allTasks.find(task => task.id.toString() === selectedTaskId.toString());
  
  if (!selectedTask) {
    subtaskBox.setContent('{red-fg}선택된 작업을 찾을 수 없습니다{/}');
    screen.render();
    return;
  }

  // 제목을 최대 60자로 제한하여 더 많은 공간 확보
  const maxTitleLength = 60;
  const taskTitle = selectedTask.title.length > maxTitleLength ? 
    selectedTask.title.substring(0, maxTitleLength - 3) + '...' : selectedTask.title;

  let content = `{bold}{cyan-fg}선택된 작업 #${selectedTask.id}: ${taskTitle}{/}\n`;
  
  // JSON에서 서브태스크 가져오기
  if (selectedTask.subtasks && Array.isArray(selectedTask.subtasks) && selectedTask.subtasks.length > 0) {
    const subtasks = selectedTask.subtasks;
    
    // 서브태스크 요약 정보 계산
    const totalCount = subtasks.length;
    const completedCount = subtasks.filter(st => st.status === 'done').length;
    const inProgressCount = subtasks.filter(st => st.status === 'in-progress').length;
    const pendingCount = subtasks.filter(st => st.status === 'pending').length;
    const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    
    // 요약 정보를 한 줄로 간결하게 표시
    content += `{bold}총 ${totalCount}개{/} | {green-fg}완료 ${completedCount}{/} | {blue-fg}진행 ${inProgressCount}{/} | {gray-fg}대기 ${pendingCount}{/} | {yellow-fg}진행률 ${progressPercent}% ${progressBar(progressPercent)}{/}\n`;
    
    // 모든 서브태스크를 메인 테이블과 동일한 형식으로 표시
    for (let i = 0; i < subtasks.length; i++) {
      const subtask = subtasks[i];
      const statusColor = subtask.status === 'done' ? 'green' : 
                         subtask.status === 'in-progress' ? 'blue' : 'gray';
      
      // 서브태스크 제목을 메인 테이블과 동일한 너비로 제한
      const maxTitleLength = 80;
      const subtaskTitle = subtask.title && subtask.title.length > maxTitleLength ? 
        subtask.title.substring(0, maxTitleLength - 3) + '...' : (subtask.title || `서브태스크 ${subtask.id}`);
      
      const subtaskId = subtask.id || `${selectedTask.id}.${i + 1}`;
      
      // 진행률 계산 - 일관성 있게 status 기반으로 계산
      let progress = 0;
      if (subtask.status === 'done') progress = 100;
      else if (subtask.status === 'in-progress') progress = 50;
      
      // 메인 테이블과 동일한 컬럼 너비로 정렬
      const idField = subtaskId.toString().padEnd(4);
      const titleField = subtaskTitle.padEnd(80);
      const statusField = subtask.status.padEnd(12);
      const priorityField = (subtask.priority || 'medium').padEnd(8);
      const depsField = (subtask.dependencies && subtask.dependencies.length > 0 ? 
        subtask.dependencies.join(', ').substring(0, 10) : 'none').padEnd(10);
      const progressField = `${progressBar(progress)} ${progress.toString().padStart(3)}%`;
      
      content += `{${statusColor}-fg}${idField} ${titleField} ${statusField} ${priorityField} ${depsField} ${progressField}{/}\n`;
    }
  } else {
    // JSON에 서브태스크가 없으면 task-master 명령어로 시도
    try {
      const subtasks = await getSubtasks(selectedTaskId);
      if (subtasks.length > 0) {
        // 서브태스크 요약 정보 계산
        const totalCount = subtasks.length;
        const completedCount = subtasks.filter(st => st.status === 'done').length;
        const inProgressCount = subtasks.filter(st => st.status === 'in-progress').length;
        const pendingCount = subtasks.filter(st => st.status === 'pending').length;
        const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        
        // 요약 정보를 한 줄로 간결하게 표시
        content += `{bold}총 ${totalCount}개{/} | {green-fg}완료 ${completedCount}{/} | {blue-fg}진행 ${inProgressCount}{/} | {gray-fg}대기 ${pendingCount}{/} | {yellow-fg}진행률 ${progressPercent}% ${progressBar(progressPercent)}{/}\n`;
        
        // 모든 서브태스크를 메인 테이블과 동일한 형식으로 표시
        for (let i = 0; i < subtasks.length; i++) {
          const subtask = subtasks[i];
          const statusColor = subtask.status === 'done' ? 'green' : 
                             subtask.status === 'in-progress' ? 'blue' : 'gray';
          
          // 서브태스크 제목을 메인 테이블과 동일한 너비로 제한
          const maxTitleLength = 80;
          const subtaskTitle = subtask.title && subtask.title.length > maxTitleLength ? 
            subtask.title.substring(0, maxTitleLength - 3) + '...' : (subtask.title || `서브태스크 ${subtask.id}`);
          
          const subtaskId = subtask.id || `${selectedTask.id}.${i + 1}`;
          
          // 진행률 계산 - 일관성 있게 status 기반으로 계산
          let progress = 0;
          if (subtask.status === 'done') progress = 100;
          else if (subtask.status === 'in-progress') progress = 50;
          
          // 메인 테이블과 동일한 컬럼 너비로 정렬
          const idField = subtaskId.toString().padEnd(4);
          const titleField = subtaskTitle.padEnd(80);
          const statusField = subtask.status.padEnd(12);
          const priorityField = (subtask.priority || 'medium').padEnd(8);
          const depsField = (subtask.dependencies && subtask.dependencies.length > 0 ? 
            subtask.dependencies.join(', ').substring(0, 10) : 'none').padEnd(10);
          const progressField = `${progressBar(progress)} ${progress.toString().padStart(3)}%`;
          
          content += `{${statusColor}-fg}${idField} ${titleField} ${statusField} ${priorityField} ${depsField} ${progressField}{/}\n`;
        }
      } else {
        content += `{yellow-fg}서브태스크가 없습니다. task-master expand ${selectedTaskId} 명령으로 생성할 수 있습니다.{/}`;
      }
    } catch (e) {
      content += `{red-fg}서브태스크 로딩 실패: ${e.message}{/}`;
    }
  }
  
  subtaskBox.setContent(content);
  screen.render();
}

async function render(tasks) {
  const now = new Date().toLocaleTimeString('en-US');
  
  // 전체 작업 목록 저장
  allTasks = tasks;
  
  // 실제 터미널 너비 정확히 감지
  const terminalWidth = process.stdout.columns || 140; // 기본값 더 크게
  
  // 상태별 필터링
  let filteredTasks = tasks;
  if (filterStatus === 'in-progress') {
    filteredTasks = tasks.filter(task => task.status === 'in-progress');
  } else if (filterStatus === 'pending') {
    filteredTasks = tasks.filter(task => task.status === 'pending');
  } else if (filterStatus === 'done') {
    filteredTasks = tasks.filter(task => task.status === 'done');
  }
  
  const statusFilterText = filterStatus === 'in-progress' ? 'in-progress' : 
                          filterStatus === 'pending' ? 'pending' : 
                          filterStatus === 'done' ? 'done' : 'all';
  
  // 작업 개수 정보
  const taskCounts = projectProgress.tasks.done !== undefined ? 
    `Tasks: ${projectProgress.tasks.done + projectProgress.tasks.inProgress + projectProgress.tasks.pending} total (Done: ${projectProgress.tasks.done}, In Progress: ${projectProgress.tasks.inProgress}, Pending: ${projectProgress.tasks.pending})` : 
    `Tasks: ${tasks.length} total`;
  
  const tasksProgressBar = projectProgress.tasks.percentage !== undefined ? 
    `Progress: ${progressBar(projectProgress.tasks.percentage)} ${projectProgress.tasks.percentage}%` : '';
  
  const subtaskCounts = projectProgress.subtasks.completed !== undefined && projectProgress.subtasks.total !== undefined ?
    `Subtasks: ${projectProgress.subtasks.total} total (Completed: ${projectProgress.subtasks.completed})` : '';
    
  const subtasksProgressBar = projectProgress.subtasks.percentage !== undefined ? 
    `Progress: ${progressBar(projectProgress.subtasks.percentage)} ${projectProgress.subtasks.percentage}%` : '';
  
  // 3줄 헤더 구성
  const line1 = `{bold}Task Monitor{/} - ${now} ${filterPriority ? `(Priority: ${filterPriority})` : ''} (Status: ${statusFilterText})`;
  const line2 = `${taskCounts}  |  ${tasksProgressBar}`;
  const line3 = `${subtaskCounts}  |  ${subtasksProgressBar}`;
  
  header.setContent(`${line1}\n${line2}\n${line3}`);

  // 컬럼 너비를 최대한 제목에 할당 - 더 많은 공간 확보
  const fixedColumnsWidth = 4 + 12 + 8 + 10 + 15; // ID(4) + Status(12) + Priority(8) + Dependencies(10) + Progress(15)
  const titleWidth = Math.max(80, terminalWidth - fixedColumnsWidth - 10); // 최소 80자 보장

  let displayTasks = filteredTasks;
  
  if (filterPriority) {
    displayTasks = displayTasks.filter(t => t.priority === filterPriority);
  }

  // 전체 작업 표시
  let displayItems = [];
  for (const task of displayTasks) {
    displayItems.push(task);
  }

  taskMap = displayItems;
  table.setItems(displayItems.map(item => {
    const color = item.priority === 'high' ? 'red' : item.priority === 'medium' ? 'yellow' : 'green';
    const statusColor = item.status === 'done' ? 'green' : item.status === 'in-progress' ? 'blue' : 'gray';
    
    // 제목을 터미널 너비에 맞게 표시 - 더 긴 제목 지원
    let displayTitle = item.title;
    if (displayTitle.length > titleWidth) {
      displayTitle = displayTitle.substring(0, titleWidth - 3) + '...';
    }
    
    const deps = item.dependencies || 'none';
    const displayDeps = deps.length > 10 ? deps.substring(0, 7) + '...' : deps;
    
    // 각 필드를 정확한 너비로 맞춤
    const idField = item.id.padEnd(4);
    const titleField = displayTitle.padEnd(titleWidth);
    const statusField = item.status.padEnd(12);
    const priorityField = item.priority.padEnd(8);
    const depsField = displayDeps.padEnd(10);
    const progressField = `${progressBar(item.progress)} ${item.progress.toString().padStart(3)}%`;
    
    return `{${color}-fg}${idField} ${titleField} {${statusColor}-fg}${statusField}{/} ${priorityField} ${depsField} ${progressField}{/}`;
  }));

  // 초기 실행 시 작업 선택 (한 번만 실행)
  if (!selectedTaskId && displayItems.length > 0) {
    selectInitialTask(displayItems);
    // 초기 선택 후 서브태스크도 즉시 업데이트
    if (selectedTaskId) {
      await updateSelectedTaskSubtasks();
    }
  }

  // 선택된 작업이 있으면 서브태스크 업데이트
  if (selectedTaskId) {
    await updateSelectedTaskSubtasks();
  } else {
    subtaskBox.setContent('{gray-fg}↑↓ 방향키로 작업을 선택하고 Enter를 누르세요{/}');
  }

  footer.setContent('{gray-fg}↑↓ 작업 선택 / Enter 확정 선택 / f 우선순위 / s 상태 / r 새로고침 / q 종료{/}');
  
  screen.render();
}

async function update() {
  try {
    // 먼저 tasks.json 파일에서 읽기 시도
    const tasksFromJson = getTasksFromJson();
    
    if (tasksFromJson && tasksFromJson.length > 0) {
      // JSON 파일이 있으면 이것을 우선 사용
      await render(tasksFromJson);
      return;
    }
    
    // JSON 파일이 없으면 task-master 명령어 시도
    const output = execSync('task-master list', { 
      encoding: 'utf-8',
      timeout: 10000 // 10초 타임아웃
    });
    const tasks = parseTasks(output);
    
    if (tasks.length > 0) {
      await render(tasks);
    } else {
      const demoTasks = getDemoTasks();
      await render(demoTasks);
    }
  } catch (e) {
    // task-master가 없으면 데모 데이터 사용
    const demoTasks = getDemoTasks();
    await render(demoTasks);
  }
}

// 초기 업데이트 및 주기적 업데이트 시작
update();
setInterval(update, INTERVAL);