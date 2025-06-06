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
  dockBorders: true,
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
  bottom: 14, // 서브태스크 박스(9) + 추천 작업 박스(4) + footer(1) = 14
  tags: true,
  scrollable: false, // 기본 스크롤 비활성화
  alwaysScroll: false, // 자동 스크롤 비활성화
  keys: false, // 기본 키 처리 비활성화
  mouse: true, // 기본 마우스 처리 활성화
  style: {
    selected: {
      bg: 'blue',
    },
  },
});

// 서브태스크 표시 영역 추가
const subtaskBox = blessed.box({
  bottom: 5, // 추천 작업 박스(4) + footer(1) = 5
  height: 9, // 높이를 9로 조정
  tags: true,
  label: ' 📋 Select a Task ',
  border: 'line',
  style: { border: { fg: 'green' } },
  scrollable: true,
  alwaysScroll: true,
  keys: true, // 키보드 스크롤 활성화
  mouse: true, // 마우스 스크롤 활성화
  vi: true, // vi 스타일 키보드 네비게이션
  clickable: true,
  input: true,
});

// 추천 작업 표시 영역 추가
const recommendedBox = blessed.box({
  bottom: 1, // footer 공간 확보를 위해 1로 변경
  height: 4, // 높이를 4로 줄여 2줄만 표시
  tags: true,
  label: ' 🎯 Recommended Next Task ',
  border: 'line',
  style: { border: { fg: 'yellow' } },
  scrollable: true,
  alwaysScroll: true,
});

// footer 추가
const footer = blessed.box({ 
  bottom: 0, 
  height: 1, 
  content: '{gray-fg}↑↓ 작업 선택 / PgUp/PgDn 페이지 이동 / Home/End 처음/끝 / Enter 확정 / Tab 서브태스크 / f 우선순위 / s 상태 / r 새로고침 / q 종료{/}', 
  tags: true 
});

layout.append(header);
layout.append(table);
layout.append(subtaskBox);
layout.append(recommendedBox);
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

// Tab 키로 서브태스크 영역 포커스 이동
screen.key(['tab'], () => {
  if (screen.focused === table) {
    subtaskBox.focus();
  } else {
    table.focus();
  }
});

// 서브태스크 박스 클릭시 포커스 이동
subtaskBox.on('click', () => {
  subtaskBox.focus();
});

// 화면 시작시 메인 테이블에 포커스
table.focus();

// Enter 키로 명시적 선택
table.key(['enter'], async () => {
  const selectedIndex = table.selected;
  
  if (taskMap[selectedIndex] && taskMap[selectedIndex].id) {
    selectedTaskId = taskMap[selectedIndex].id;
    await updateSelectedTaskSubtasks();
  } else {
    subtaskBox.setContent('{red-fg}선택된 작업이 없습니다. 방향키로 작업을 선택해주세요.{/}');
    screen.render();
  }
});

// 커스텀 방향키 처리로 불필요한 스크롤 방지
table.key(['up'], async () => {
  const currentSelected = table.selected || 0;
  const newSelected = Math.max(0, currentSelected - 1);
  
  // 선택만 변경
  table.selected = newSelected;
  
  // 필요한 경우에만 스크롤 (선택된 항목이 보이지 않을 때)
  const currentBase = table._childBase || 0;
  const tableHeight = table.height - 2; // 헤더 제외
  
  if (newSelected < currentBase) {
    // 위로 스크롤 필요
    table._childBase = newSelected;
    table._childOffset = 0;
  }
  
  // 선택된 작업 업데이트
  if (taskMap[newSelected] && taskMap[newSelected].id) {
    selectedTaskId = taskMap[newSelected].id;
    await updateSelectedTaskSubtasks();
  }
  
  screen.render();
});

table.key(['down'], async () => {
  const currentSelected = table.selected || 0;
  const newSelected = Math.min(taskMap.length - 1, currentSelected + 1);
  
  // 선택만 변경
  table.selected = newSelected;
  
  // 필요한 경우에만 스크롤 (선택된 항목이 보이지 않을 때)
  const currentBase = table._childBase || 0;
  const tableHeight = table.height - 2; // 헤더 제외
  
  if (newSelected >= currentBase + tableHeight) {
    // 아래로 스크롤 필요
    table._childBase = newSelected - tableHeight + 1;
    table._childOffset = 0;
  }
  
  // 선택된 작업 업데이트
  if (taskMap[newSelected] && taskMap[newSelected].id) {
    selectedTaskId = taskMap[newSelected].id;
    await updateSelectedTaskSubtasks();
  }
  
  screen.render();
});

// 페이지 업 키 처리 (한 화면 위로)
table.key(['pageup'], async () => {
  const currentSelected = table.selected || 0;
  const tableHeight = table.height - 2; // 헤더 제외
  const pageSize = Math.max(1, tableHeight - 1); // 한 화면 분량
  
  const newSelected = Math.max(0, currentSelected - pageSize);
  table.selected = newSelected;
  
  // 스크롤도 함께 이동
  const currentBase = table._childBase || 0;
  const newBase = Math.max(0, currentBase - pageSize);
  table._childBase = newBase;
  table._childOffset = 0;
  
  // 선택된 작업 업데이트
  if (taskMap[newSelected] && taskMap[newSelected].id) {
    selectedTaskId = taskMap[newSelected].id;
    await updateSelectedTaskSubtasks();
  }
  
  screen.render();
});

// 페이지 다운 키 처리 (한 화면 아래로)
table.key(['pagedown'], async () => {
  const currentSelected = table.selected || 0;
  const tableHeight = table.height - 2; // 헤더 제외
  const pageSize = Math.max(1, tableHeight - 1); // 한 화면 분량
  
  const newSelected = Math.min(taskMap.length - 1, currentSelected + pageSize);
  table.selected = newSelected;
  
  // 스크롤도 함께 이동
  const currentBase = table._childBase || 0;
  const maxBase = Math.max(0, taskMap.length - tableHeight);
  const newBase = Math.min(maxBase, currentBase + pageSize);
  table._childBase = newBase;
  table._childOffset = 0;
  
  // 선택된 작업 업데이트
  if (taskMap[newSelected] && taskMap[newSelected].id) {
    selectedTaskId = taskMap[newSelected].id;
    await updateSelectedTaskSubtasks();
  }
  
  screen.render();
});

// Home 키 처리 (맨 처음으로)
table.key(['home'], async () => {
  table.selected = 0;
  table._childBase = 0;
  table._childOffset = 0;
  
  // 선택된 작업 업데이트
  if (taskMap[0] && taskMap[0].id) {
    selectedTaskId = taskMap[0].id;
    await updateSelectedTaskSubtasks();
  }
  
  screen.render();
});

// End 키 처리 (맨 끝으로)
table.key(['end'], async () => {
  const lastIndex = taskMap.length - 1;
  table.selected = lastIndex;
  
  const tableHeight = table.height - 2;
  const newBase = Math.max(0, lastIndex - tableHeight + 1);
  table._childBase = newBase;
  table._childOffset = 0;
  
  // 선택된 작업 업데이트
  if (taskMap[lastIndex] && taskMap[lastIndex].id) {
    selectedTaskId = taskMap[lastIndex].id;
    await updateSelectedTaskSubtasks();
  }
  
  screen.render();
});

// 마우스 hover 이벤트 처리 (이동만으로 태스크 정보 가져오기)
table.on('mouse', async (data) => {
  // 마우스가 테이블 위로 이동했을 때 처리
  if (data.action === 'mouseover' || data.action === 'mousemove') {
    // 마우스 위치로 항목 인덱스 계산
    const currentBase = table._childBase || 0;
    const relativeY = data.y - table.atop;
    const hoveredIndex = currentBase + relativeY;
    
    // 유효한 인덱스이고 현재 선택과 다른 경우에만 업데이트
    if (hoveredIndex >= 0 && hoveredIndex < taskMap.length && hoveredIndex !== table.selected) {
      table.selected = hoveredIndex;
      
      // 선택된 작업 ID 업데이트
      if (taskMap[hoveredIndex] && taskMap[hoveredIndex].id) {
        selectedTaskId = taskMap[hoveredIndex].id;
        
        // 즉시 서브태스크 정보 업데이트
        await updateSelectedTaskSubtasks();
        
        screen.render();
      }
    }
  }
});

// 마우스 클릭 이벤트 처리 (확정 선택용)
table.on('click', async (data) => {
  // blessed.js가 자동으로 계산한 선택된 인덱스 사용
  const clickedIndex = table.selected;
  
  // 선택된 작업 ID 업데이트
  if (taskMap[clickedIndex] && taskMap[clickedIndex].id) {
    selectedTaskId = taskMap[clickedIndex].id;
    
    // 즉시 서브태스크 정보 업데이트
    await updateSelectedTaskSubtasks();
    
    screen.render();
  }
  
  screen.render();
});

// 마우스로 선택이 변경될 때도 처리
table.on('select', async (item, index) => {
  if (taskMap[index] && taskMap[index].id) {
    selectedTaskId = taskMap[index].id;
    await updateSelectedTaskSubtasks();
    
    // 방향키로 이동할 때는 footer 메시지 표시하지 않음 (클릭만 표시)
  }
});

// 마우스 휠 처리를 위한 커스텀 이벤트
screen.on('mouse', (data) => {
  // 마우스 휠만 커스텀 처리
  if (data.action === 'wheelup' || data.action === 'wheeldown') {
    // 마우스 위치 확인
    const mouseX = data.x;
    const mouseY = data.y;
    
    // 서브태스크 박스 영역인지 확인
    const subtaskLeft = subtaskBox.aleft || subtaskBox.left;
    const subtaskTop = subtaskBox.atop || subtaskBox.top;
    const subtaskRight = subtaskLeft + (subtaskBox.awidth || subtaskBox.width);
    const subtaskBottom = subtaskTop + (subtaskBox.aheight || subtaskBox.height);
    
    // 서브태스크 영역 내에서 마우스 휠
    if (mouseX >= subtaskLeft && mouseX < subtaskRight && 
        mouseY >= subtaskTop && mouseY < subtaskBottom) {
      // 서브태스크 박스에서 스크롤 처리
      if (data.action === 'wheelup') {
        subtaskBox.scroll(-3);
      } else if (data.action === 'wheeldown') {
        subtaskBox.scroll(3);
      }
      screen.render();
      return false; // 이벤트 전파 중단
    }
    
    // 추천 작업 박스 영역인지 확인
    const recommendedLeft = recommendedBox.aleft || recommendedBox.left;
    const recommendedTop = recommendedBox.atop || recommendedBox.top;
    const recommendedRight = recommendedLeft + (recommendedBox.awidth || recommendedBox.width);
    const recommendedBottom = recommendedTop + (recommendedBox.aheight || recommendedBox.height);
    
    // 추천 작업 영역 내에서 마우스 휠 (무시)
    if (mouseX >= recommendedLeft && mouseX < recommendedRight && 
        mouseY >= recommendedTop && mouseY < recommendedBottom) {
      return false; // 이벤트 전파 중단
    }
    
    // 테이블 영역에서만 기존 스크롤 처리
    const tableLeft = table.aleft || table.left;
    const tableTop = table.atop || table.top;
    const tableRight = tableLeft + (table.awidth || table.width);
    const tableBottom = tableTop + (table.aheight || table.height);
    
    if (mouseX >= tableLeft && mouseX < tableRight && 
        mouseY >= tableTop && mouseY < tableBottom) {
      if (data.action === 'wheelup') {
        const currentBase = table._childBase || 0;
        const newBase = Math.max(0, currentBase - 3);
        table._childBase = newBase;
        table._childOffset = 0;
        screen.render();
        return false;
      } else if (data.action === 'wheeldown') {
        const currentBase = table._childBase || 0;
        const maxBase = Math.max(0, taskMap.length - (table.height - 3));
        const newBase = Math.min(maxBase, currentBase + 3);
        table._childBase = newBase;
        table._childOffset = 0;
        screen.render();
        return false;
      }
    }
  }
  
  // 마우스가 테이블 영역을 벗어났을 때 처리는 유지
  if (data.action === 'mousemove') {
    const isOutsideTable = data.x < table.aleft || data.x >= table.aleft + table.awidth ||
                           data.y < table.atop || data.y >= table.atop + table.aheight;
    
    // 테이블 밖에서는 추가 처리하지 않음
  }
});

// blessed.js의 모든 스크롤 관련 메서드 완전 차단
const originalScrollTo = table.scrollTo;
const originalSetScroll = table.setScroll;
const originalScroll = table.scroll;

table.scrollTo = function (offset) {
  return originalScrollTo.call(this, offset);
};

table.setScroll = function (offset) {
  return originalSetScroll.call(this, offset);
};

table.scroll = function (offset) {
  return originalScroll.call(this, offset);
};

// blessed list의 select 메서드도 오버라이드
const originalSelect = table.select;
table.select = function (index) {
  return originalSelect.call(this, index);
};

// 추가로 blessed.js의 다른 스크롤 관련 메서드들도 오버라이드
const originalEnsureVisible = table.ensureVisible || function() {};
const originalScrollToItem = table.scrollToItem || function() {};
const original_scrollTo = table._scrollTo || function() {};
const originalMoveOffset = table.moveOffset || function() {};

// ensureVisible 메서드 오버라이드 (아이템이 보이도록 자동 스크롤하는 메서드)
table.ensureVisible = function(index) {
  return originalEnsureVisible.call(this, index);
};

// scrollToItem 메서드 오버라이드
table.scrollToItem = function(index) {
  return originalScrollToItem.call(this, index);
};

// _scrollTo 내부 메서드 오버라이드
table._scrollTo = function(offset) {
  return original_scrollTo.call(this, offset);
};

// moveOffset 메서드 오버라이드
table.moveOffset = function(offset) {
  return originalMoveOffset.call(this, offset);
};

// childBase와 childOffset 직접 설정을 감시하고 차단
Object.defineProperty(table, 'childBase', {
  get: function() {
    return this._childBase !== undefined ? this._childBase : 0;
  },
  set: function(value) {
    this._childBase = value;
  }
});

Object.defineProperty(table, 'childOffset', {
  get: function() {
    return this._childOffset !== undefined ? this._childOffset : 0;
  },
  set: function(value) {
    this._childOffset = value;
  }
});

// 초기값 설정
table._childBase = 0;
table._childOffset = 0;

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
      '../tasks/tasks.json',
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
    const doneTasks = tasks.filter((t) => t.status === 'done').length;
    const inProgressTasks = tasks.filter(
      (t) => t.status === 'in-progress',
    ).length;
    const pendingTasks = tasks.filter((t) => t.status === 'pending').length;

    projectProgress.tasks = {
      done: doneTasks,
      inProgress: inProgressTasks,
      pending: pendingTasks,
      percentage:
        totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
    };

    // 서브태스크 진행률 계산
    let totalSubtasks = 0;
    let completedSubtasks = 0;

    tasks.forEach((task) => {
      if (task.subtasks && task.subtasks.length > 0) {
        totalSubtasks += task.subtasks.length;
        completedSubtasks += task.subtasks.filter(
          (st) => st.status === 'done',
        ).length;
      }
    });

    projectProgress.subtasks = {
      total: totalSubtasks,
      completed: completedSubtasks,
      percentage:
        totalSubtasks > 0
          ? Math.round((completedSubtasks / totalSubtasks) * 100)
          : 0,
    };

    // 작업 데이터를 표시용 형식으로 변환
    return tasks.map((task) => {
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
        dependencies:
          task.dependencies && task.dependencies.length > 0
            ? task.dependencies.join(', ')
            : 'none',
        progress: progress,
        eta:
          task.status === 'done'
            ? 'done'
            : task.status === 'in-progress'
            ? 'in-progress'
            : 'pending',
        subtasks: task.subtasks || [],
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
    {
      id: '1',
      title: 'Improve Website UI',
      status: 'done',
      priority: 'high',
      progress: 100,
      dependencies: 'none',
    },
    {
      id: '2',
      title: 'Optimize Database',
      status: 'done',
      priority: 'medium',
      progress: 100,
      dependencies: '1',
    },
    {
      id: '3',
      title: 'Write API Documentation',
      status: 'in-progress',
      priority: 'low',
      progress: 75,
      dependencies: '2',
    },
    {
      id: '4',
      title: 'Write Test Code',
      status: 'in-progress',
      priority: 'high',
      progress: 90,
      dependencies: 'none',
    },
    {
      id: '5',
      title: 'Create Deployment Script',
      status: 'in-progress',
      priority: 'medium',
      progress: 60,
      dependencies: '4',
    },
    {
      id: '6',
      title: 'Security Review',
      status: 'pending',
      priority: 'high',
      progress: 0,
      dependencies: '3,4',
    },
    {
      id: '7',
      title: 'Performance Optimization',
      status: 'pending',
      priority: 'medium',
      progress: 0,
      dependencies: '5',
    },
    {
      id: '8',
      title: 'Write User Manual',
      status: 'pending',
      priority: 'low',
      progress: 0,
      dependencies: '3',
    },
    {
    id: '19',
    title: 'Implement Monitoring System',
    status: 'pending',
    priority: 'medium',
      progress: 0,
      dependencies: '6,7',
    },
  ];
}

function parseProjectProgress(output) {
  const lines = output.split('\n');
  
  // 전체 작업 진행률 파싱
  const taskProgressLine = lines.find((line) =>
    line.includes('Tasks Progress:'),
  );
  if (taskProgressLine) {
    const match = taskProgressLine.match(/(\d+)%/);
    if (match) {
      projectProgress.tasks.percentage = parseInt(match[1]);
    }
    
    const countsMatch = taskProgressLine.match(
      /Done:\s*(\d+)\s*In Progress:\s*(\d+)\s*Pending:\s*(\d+)/,
    );
    if (!countsMatch) {
      // 다음 줄에서 찾기
      const nextLine = lines[lines.indexOf(taskProgressLine) + 1];
      if (nextLine) {
        const nextMatch = nextLine.match(
          /Done:\s*(\d+)\s*In Progress:\s*(\d+)\s*Pending:\s*(\d+)/,
        );
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
  const subtaskProgressLine = lines.find((line) =>
    line.includes('Subtasks Progress:'),
  );
  if (subtaskProgressLine) {
    const match = subtaskProgressLine.match(/(\d+)%/);
    if (match) {
      projectProgress.subtasks.percentage = parseInt(match[1]);
    }
    
    const completedMatch = subtaskProgressLine.match(
      /Completed:\s*(\d+)\/(\d+)/,
    );
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
  const taskLines = lines.filter(
    (line) =>
    line.includes('│') && 
    !line.includes('┌') && 
    !line.includes('├') && 
    !line.includes('└') &&
    !line.includes('ID') && // 헤더 제외
      line.split('│').length >= 6, // 최소 6개 컬럼
  );

  return taskLines
    .map((line) => {
      const parts = line
        .split('│')
        .map((p) => p.trim())
        .filter((p) => p);
    
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
        eta:
          progress === 100
            ? 'done'
            : progress === 0
            ? 'pending'
            : 'in-progress',
      };
    })
    .filter((task) => task !== null);
}

async function getSubtasks(taskId) {
  try {
    const output = execSync(`task-master show ${taskId}`, { 
      encoding: 'utf-8',
      timeout: 5000, // 5초 타임아웃 추가
    });
    const lines = output.split('\n');
    
    // 서브테스크 섹션 찾기
    const subtasks = [];
    let inSubtaskSection = false;
    
    for (const line of lines) {
      // 서브태스크 섹션 시작 감지 (다양한 형식 지원)
      if (
        line.includes('Subtasks:') ||
        line.includes('서브테스크:') ||
        line.includes('Sub-tasks:')
      ) {
        inSubtaskSection = true;
        continue;
      }
      
      if (inSubtaskSection) {
        // 서브태스크 라인 파싱 (예: "  1.1 ✓ Setup authentication" 또는 "1.1 ○ pending Setup authentication")
        const subtaskMatch = line.match(
          /\s*(\d+\.\d+)\s*([✓○►]?)\s*(\w+\s+)?(.+)/,
        );
        if (subtaskMatch) {
          const [, id, statusSymbol, statusText, title] = subtaskMatch;
          let status = 'pending';
          let progress = 0;
          
          if (
            statusSymbol === '✓' ||
            (statusText && statusText.includes('done'))
          ) {
            status = 'done';
            progress = 100;
          } else if (
            statusSymbol === '►' ||
            (statusText && statusText.includes('progress'))
          ) {
            status = 'in-progress';
            progress = 50;
          } else if (
            statusSymbol === '○' ||
            (statusText && statusText.includes('pending'))
          ) {
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
              isSubtask: true,
            });
          }
        } else if (
          line.trim() === '' ||
          line.includes('───') ||
          line.includes('Start working:') ||
          line.includes('View details:')
        ) {
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
    subtaskBox.setLabel(' 📋 Select a Task ');
    screen.render();
    return;
  }

  const selectedTask = allTasks.find(task => task.id.toString() === selectedTaskId.toString());
  
  if (!selectedTask) {
    subtaskBox.setContent('{red-fg}선택된 작업을 찾을 수 없습니다{/}');
    subtaskBox.setLabel(' 📋 Task Not Found ');
    screen.render();
    return;
  }

  // 서브테스크 박스 제목을 선택된 테스크 제목으로 업데이트
  const maxLabelLength = 60; // 라벨 최대 길이
  const taskTitle = selectedTask.title.length > maxLabelLength ? 
    selectedTask.title.substring(0, maxLabelLength - 3) + '...' : selectedTask.title;
  
  subtaskBox.setLabel(` 📋 Task #${selectedTask.id}: ${taskTitle} `);

  // 제목을 최대 60자로 제한하여 더 많은 공간 확보
  const maxTitleLength = 60;
  const displayTitle = selectedTask.title.length > maxTitleLength ? 
    selectedTask.title.substring(0, maxTitleLength - 3) + '...' : selectedTask.title;

  // 태스크 상세 정보 표시
  const statusColor = selectedTask.status === 'done' ? 'green' : 
                     selectedTask.status === 'in-progress' ? 'blue' : 'gray';
  const priorityColor = selectedTask.priority === 'high' ? 'red' : 
                       selectedTask.priority === 'medium' ? 'yellow' : 'green';
  
  let content = `{bold}{cyan-fg}선택된 작업 #${selectedTask.id}: ${displayTitle}{/}\n`;
  content += `{bold}상태:{/} {${statusColor}-fg}${selectedTask.status}{/} | `;
  content += `{bold}우선순위:{/} {${priorityColor}-fg}${selectedTask.priority}{/} | `;
  content += `{bold}의존성:{/} ${selectedTask.dependencies && selectedTask.dependencies !== 'none' ? selectedTask.dependencies : '없음'}\n`;
  
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
    content += `{bold}서브태스크:{/} 총 ${totalCount}개 | {green-fg}완료 ${completedCount}{/} | {blue-fg}진행 ${inProgressCount}{/} | {gray-fg}대기 ${pendingCount}{/} | {yellow-fg}진행률 ${progressPercent}% ${progressBar(progressPercent)}{/}\n`;
    
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
        content += `{bold}서브태스크:{/} 총 ${totalCount}개 | {green-fg}완료 ${completedCount}{/} | {blue-fg}진행 ${inProgressCount}{/} | {gray-fg}대기 ${pendingCount}{/} | {yellow-fg}진행률 ${progressPercent}% ${progressBar(progressPercent)}{/}\n`;
        
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
    filteredTasks = tasks.filter((task) => task.status === 'in-progress');
  } else if (filterStatus === 'pending') {
    filteredTasks = tasks.filter((task) => task.status === 'pending');
  } else if (filterStatus === 'done') {
    filteredTasks = tasks.filter((task) => task.status === 'done');
  }

  const statusFilterText =
    filterStatus === 'in-progress'
      ? 'in-progress'
      : filterStatus === 'pending'
      ? 'pending'
      : filterStatus === 'done'
      ? 'done'
      : 'all';
  
  // 작업 개수 정보
  const taskCounts =
    projectProgress.tasks.done !== undefined
      ? `Tasks: ${
          projectProgress.tasks.done +
          projectProgress.tasks.inProgress +
          projectProgress.tasks.pending
        } total (Done: ${projectProgress.tasks.done}, In Progress: ${
          projectProgress.tasks.inProgress
        }, Pending: ${projectProgress.tasks.pending})`
      : `Tasks: ${tasks.length} total`;

  const tasksProgressBar =
    projectProgress.tasks.percentage !== undefined
      ? `Progress: ${progressBar(projectProgress.tasks.percentage)} ${
          projectProgress.tasks.percentage
        }%`
      : '';

  const subtaskCounts =
    projectProgress.subtasks.completed !== undefined &&
    projectProgress.subtasks.total !== undefined
      ? `Subtasks: ${projectProgress.subtasks.total} total (Completed: ${projectProgress.subtasks.completed})`
      : '';

  const subtasksProgressBar =
    projectProgress.subtasks.percentage !== undefined
      ? `Progress: ${progressBar(projectProgress.subtasks.percentage)} ${
          projectProgress.subtasks.percentage
        }%`
      : '';

  // 3줄 헤더 구성
  const line1 = `{bold}Task Monitor{/} - ${now} ${
    filterPriority ? `(Priority: ${filterPriority})` : ''
  } (Status: ${statusFilterText})`;
  const line2 = `${taskCounts}  |  ${tasksProgressBar}`;
  const line3 = `${subtaskCounts}  |  ${subtasksProgressBar}`;

  header.setContent(`${line1}\n${line2}\n${line3}`);

  // 컬럼 너비를 최대한 제목에 할당 - 더 많은 공간 확보
  const fixedColumnsWidth = 4 + 12 + 8 + 10 + 15; // ID(4) + Status(12) + Priority(8) + Dependencies(10) + Progress(15)
  const titleWidth = Math.max(80, terminalWidth - fixedColumnsWidth - 10); // 최소 80자 보장

  let displayTasks = filteredTasks;
  
  if (filterPriority) {
    displayTasks = displayTasks.filter((t) => t.priority === filterPriority);
  }

  // 전체 작업 표시
  let displayItems = [];
  for (const task of displayTasks) {
    displayItems.push(task);
  }

  taskMap = displayItems;
  table.setItems(
    displayItems.map((item) => {
      const color =
        item.priority === 'high'
          ? 'red'
          : item.priority === 'medium'
          ? 'yellow'
          : 'green';
      const statusColor =
        item.status === 'done'
          ? 'green'
          : item.status === 'in-progress'
          ? 'blue'
          : 'gray';

      // 제목을 터미널 너비에 맞게 표시 - 더 긴 제목 지원
      let displayTitle = item.title;
      if (displayTitle.length > titleWidth) {
        displayTitle = displayTitle.substring(0, titleWidth - 3) + '...';
      }

      const deps = item.dependencies || 'none';
      const displayDeps =
        deps.length > 10 ? deps.substring(0, 7) + '...' : deps;

      // 각 필드를 정확한 너비로 맞춤
      const idField = item.id.padEnd(4);
      const titleField = displayTitle.padEnd(titleWidth);
      const statusField = item.status.padEnd(12);
      const priorityField = (item.priority || 'medium').padEnd(8);
      const depsField = displayDeps.padEnd(10);
      const progressField = `${progressBar(item.progress)} ${item.progress
        .toString()
        .padStart(3)}%`;

      return `{${color}-fg}${idField} ${titleField} {${statusColor}-fg}${statusField}{/} ${priorityField} ${depsField} ${progressField}{/}`;
    }),
  );

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
    subtaskBox.setContent(
      '{gray-fg}↑↓ 방향키로 작업을 선택하고 Enter를 누르세요{/}',
    );
  }

  // 추천 작업 업데이트
  updateRecommendedTask(displayItems);

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
      timeout: 10000, // 10초 타임아웃
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

// 추천 작업 찾기 함수
function getRecommendedTask(tasks) {
  if (!tasks || tasks.length === 0) return null;
  
  // 1순위: 진행중인 작업 중 우선순위가 높은 것
  const inProgressTasks = tasks.filter(task => task.status === 'in-progress');
  if (inProgressTasks.length > 0) {
    const highPriorityInProgress = inProgressTasks.filter(task => task.priority === 'high');
    if (highPriorityInProgress.length > 0) {
      return highPriorityInProgress[0];
    }
    return inProgressTasks[0];
  }
  
  // 2순위: 대기중인 작업 중 의존성이 해결된 것
  const pendingTasks = tasks.filter(task => task.status === 'pending');
  const availableTasks = pendingTasks.filter(task => {
    if (!task.dependencies || task.dependencies === 'none') return true;
    
    const deps = task.dependencies.split(',').map(d => d.trim());
    return deps.every(depId => {
      const depTask = tasks.find(t => t.id.toString() === depId.toString());
      return depTask && depTask.status === 'done';
    });
  });
  
  if (availableTasks.length > 0) {
    // 우선순위 순으로 정렬
    const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
    availableTasks.sort((a, b) => {
      return (priorityOrder[b.priority] || 2) - (priorityOrder[a.priority] || 2);
    });
    return availableTasks[0];
  }
  
  // 3순위: 그냥 대기중인 작업 중 우선순위가 높은 것
  if (pendingTasks.length > 0) {
    const highPriorityPending = pendingTasks.filter(task => task.priority === 'high');
    if (highPriorityPending.length > 0) {
      return highPriorityPending[0];
    }
    return pendingTasks[0];
  }
  
  return null;
}

// 추천 작업 박스 업데이트 함수
function updateRecommendedTask(tasks) {
  const recommendedTask = getRecommendedTask(tasks);
  
  if (!recommendedTask) {
    recommendedBox.setContent('{gray-fg}모든 작업이 완료되었습니다! 🎉{/}');
    recommendedBox.setLabel(' 🎯 All Tasks Completed ');
    return;
  }
  
  // 추천 작업 정보 표시
  const statusColor = recommendedTask.status === 'done' ? 'green' : 
                     recommendedTask.status === 'in-progress' ? 'blue' : 'gray';
  const priorityColor = recommendedTask.priority === 'high' ? 'red' : 
                       recommendedTask.priority === 'medium' ? 'yellow' : 'green';
  
  // 제목 길이 제한
  const maxTitleLength = 80;
  const taskTitle = recommendedTask.title.length > maxTitleLength ? 
    recommendedTask.title.substring(0, maxTitleLength - 3) + '...' : recommendedTask.title;
  
  // 추천 이유 판단
  let reason = '';
  if (recommendedTask.status === 'in-progress') {
    reason = recommendedTask.priority === 'high' ? 
      '{red-fg}진행중인 고우선순위 작업{/}' : '{blue-fg}진행중인 작업{/}';
  } else {
    // 의존성 체크
    if (!recommendedTask.dependencies || recommendedTask.dependencies === 'none') {
      reason = priorityColor === 'red' ? 
        '{red-fg}의존성 없는 고우선순위 작업{/}' : '{green-fg}의존성 없는 작업{/}';
    } else {
      reason = '{yellow-fg}의존성 해결된 작업{/}';
    }
  }
  
  let content = `{bold}ID:{/} #${recommendedTask.id} | `;
  content += `{bold}상태:{/} {${statusColor}-fg}${recommendedTask.status}{/} | `;
  content += `{bold}우선순위:{/} {${priorityColor}-fg}${recommendedTask.priority}{/} | `;
  content += `{bold}추천 이유:{/} ${reason}\n`;
  content += `{bold}제목:{/} ${taskTitle}`;

  recommendedBox.setContent(content);
  recommendedBox.setLabel(' 🎯 Recommended Next Task ');
}
