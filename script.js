// DOM 요소 참조
const gameBoard = document.getElementById('game-board');
const gridButtons = document.querySelectorAll('.grid-btn');
const speedButtons = document.querySelectorAll('.speed-btn');
const speedPanel = document.getElementById('speed-panel');
const selectedGridText = document.getElementById('selected-grid-text');
const currentModeBadge = document.getElementById('current-mode-badge');
const roundDisplay = document.getElementById('round-display');
const avgReactionDisplay = document.getElementById('avg-reaction-display');
const bestScoreDisplay = document.getElementById('best-score-display');
const messageBox = document.getElementById('message-box');
const startBtn = document.getElementById('start-btn');

// 진단 리포트 카드 DOM 요소
const reportCard = document.getElementById('report-card');
const reportGrade = document.getElementById('report-grade');
const reportBrainType = document.getElementById('report-brain-type');
const reportTypeDesc = document.getElementById('report-type-desc');
const reportTotalScore = document.getElementById('report-total-score');
const reportRound = document.getElementById('report-round');
const reportAvgMs = document.getElementById('report-avg-ms');
const reportMultiplier = document.getElementById('report-multiplier');

// 속도 난이도별 파라미터 및 가중치
const SPEED_CONFIG = {
  easy: {
    label: '쉬움',
    lightOnMs: 650,
    gapMs: 250,
    weight: 1.0
  },
  normal: {
    label: '보통',
    lightOnMs: 420,
    gapMs: 180,
    weight: 1.3
  },
  hard: {
    label: '어려움',
    lightOnMs: 220,
    gapMs: 110,
    weight: 1.7
  }
};

// 게임 상태 변수
let gridSize = 3;            // 3 ~ 8
let speedKey = 'normal';     // 'easy' | 'normal' | 'hard'
let sequence = [];
let playerSequence = [];
let round = 0;
let isPlaying = false;
let isShowingSequence = false;

// 반응 속도(ms) 측정용 변수
let lastActionTimestamp = 0;
let reactionTimes = [];      // 모든 성공 클릭의 반응 속도(ms) 배열

// Web Audio API 사운드 합성기
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, duration = 0.15, type = 'sine') {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

// 모드별 최고 기록 저장 및 불러오기
function getBestScoreKey() {
  return `memory_best_${gridSize}_${speedKey}`;
}

function loadBestScore() {
  const saved = localStorage.getItem(getBestScoreKey());
  bestScoreDisplay.textContent = saved ? saved : '0';
}

function saveBestScore(score) {
  const currentBest = Number(localStorage.getItem(getBestScoreKey()) || 0);
  if (score > currentBest) {
    localStorage.setItem(getBestScoreKey(), score);
    bestScoreDisplay.textContent = score;
  }
}

// 평균 반응 속도(ms) 계산
function getAverageReactionMs() {
  if (reactionTimes.length === 0) return 0;
  const sum = reactionTimes.reduce((acc, cur) => acc + cur, 0);
  return Math.round(sum / reactionTimes.length);
}

// 상태 표시 UI 업데이트
function updateModeUI() {
  const speedLabel = SPEED_CONFIG[speedKey].label;
  selectedGridText.textContent = `${gridSize}×${gridSize}`;
  currentModeBadge.textContent = `${gridSize}×${gridSize} · ${speedLabel}`;
  loadBestScore();
}

// 동적 NxN 보드 생성
function createBoard(size) {
  gameBoard.innerHTML = '';
  const gapSize = size >= 7 ? 4 : size >= 5 ? 6 : 8;
  gameBoard.style.gap = `${gapSize}px`;
  gameBoard.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  gameBoard.style.gridTemplateRows = `repeat(${size}, 1fr)`;

  const totalTiles = size * size;
  for (let i = 0; i < totalTiles; i++) {
    const tile = document.createElement('div');
    tile.classList.add('tile');
    tile.dataset.index = i;
    tile.addEventListener('click', () => handleTileClick(i, tile));
    gameBoard.appendChild(tile);
  }
}

// 1단계: 격자 크기 선택 이벤트
gridButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (isPlaying) return;
    gridButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    gridSize = Number(btn.dataset.size);
    createBoard(gridSize);
    updateModeUI();
    reportCard.classList.add('hidden');

    speedPanel.classList.remove('highlight-pop');
    void speedPanel.offsetWidth;
    speedPanel.classList.add('highlight-pop');

    messageBox.innerHTML = `<strong>${gridSize}×${gridSize}</strong> 선택됨! <strong>속도 난이도</strong>를 고른 뒤 시작하세요.`;
  });
});

// 2단계: 속도 난이도 선택 이벤트
speedButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (isPlaying) return;
    speedButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    speedKey = btn.dataset.speed;
    updateModeUI();
    reportCard.classList.add('hidden');

    const speedLabel = SPEED_CONFIG[speedKey].label;
    messageBox.innerHTML = `<strong>${gridSize}×${gridSize} (${speedLabel})</strong> 준비 완료! <strong>게임 시작</strong>을 누르세요.`;
  });
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function flashTile(index, durationMs) {
  const tiles = document.querySelectorAll('.tile');
  const tile = tiles[index];
  if (!tile) return;

  const totalTiles = gridSize * gridSize;
  const freq = 260 + (index / totalTiles) * 360;
  playTone(freq, durationMs / 1000);

  tile.classList.add('active');
  await sleep(durationMs);
  tile.classList.remove('active');
}

// 다음 라운드 시작 및 패턴 출력
async function nextRound() {
  isShowingSequence = true;
  playerSequence = [];
  round++;
  roundDisplay.textContent = round;

  const totalTiles = gridSize * gridSize;
  const randomTile = Math.floor(Math.random() * totalTiles);
  sequence.push(randomTile);

  const { lightOnMs, gapMs } = SPEED_CONFIG[speedKey];
  messageBox.innerHTML = `👀 패턴을 기억하세요! (<strong>${sequence.length}단계</strong> · ${SPEED_CONFIG[speedKey].label})`;

  await sleep(500);

  for (let i = 0; i < sequence.length; i++) {
    await flashTile(sequence[i], lightOnMs);
    await sleep(gapMs);
  }

  // 패턴 시연이 끝난 정밀 시각 기록 (첫 클릭 반응 속도 기준점)
  isShowingSequence = false;
  lastActionTimestamp = performance.now();
  messageBox.innerHTML = `👆 순서대로 클릭하세요! (<strong>0 / ${sequence.length}</strong>)`;
}

// 종합 인지 등급 & 두뇌 유형 판정 알고리즘
function evaluateCognitiveProfile(clearedRounds, avgMs) {
  // 1. 난이도 가중치 계산 (격자 크기 계수 × 속도 계수)
  const gridFactor = 1 + (gridSize - 3) * 0.25; // 3x3=1.0 ~ 8x8=2.25
  const speedFactor = SPEED_CONFIG[speedKey].weight;
  const totalMultiplier = Number((gridFactor * speedFactor).toFixed(2));

  // 2. 반응 속도 보너스 계산 (빠를수록 높은 보너스, 최소 0점)
  const speedBonus = avgMs > 0 ? Math.max(0, Math.round((1000 - avgMs) * 0.4)) : 0;

  // 3. 종합 인지 점수 산출 수식
  const baseScore = clearedRounds * 150 + speedBonus;
  const totalScore = clearedRounds === 0 ? 0 : Math.round(baseScore * totalMultiplier);

  // 4. 종합 등급 판정 (S / A / B / C)
  let grade = 'C';
  if (totalScore >= 1800) grade = 'S';
  else if (totalScore >= 1100) grade = 'A';
  else if (totalScore >= 550) grade = 'B';

  // 5. 다중 변수 기반 두뇌 유형 진단 (도달 라운드 + 반응 속도 + 공간 크기)
  let brainType = '';
  let typeDesc = '';

  if (clearedRounds === 0) {
    brainType = '워밍업 탐색가형';
    typeDesc = '첫 라운드에서 패턴을 놓쳤습니다. 한 번 더 도전해 정확한 인지 데이터를 측정해 보세요!';
  } else if (avgMs <= 450 && clearedRounds >= 5) {
    brainType = '⚡ 초고속 공간 직관형';
    typeDesc = '빠른 시각 정보 처리 속도(450ms 이하)와 높은 작업 기억 용량을 동시에 갖춘 최상위 인지 유형입니다.';
  } else if (avgMs <= 480 && clearedRounds < 5) {
    brainType = '🚀 번개 같은 순발력형';
    typeDesc = '반응 속도가 매우 빠르지만 패턴이 길어질 때 집중력 분산이 나타납니다. 호흡을 가다듬으면 S등급에 도달할 수 있습니다.';
  } else if (avgMs > 480 && clearedRounds >= 5) {
    brainType = '🧠 신중한 정밀 분석가형';
    typeDesc = '머릿속으로 패턴 구조를 차분히 검증한 뒤 정확하게 인출하는 전략적 기억 처리 유형입니다.';
  } else {
    brainType = '⚖️ 균형 잡힌 안정형';
    typeDesc = '안정적인 속도와 정확도로 정보를 처리하고 있습니다. 격자 크기나 속도를 한 단계 높여 훈련해 보세요.';
  }

  return {
    grade,
    brainType,
    typeDesc,
    totalScore,
    totalMultiplier
  };
}

// 진단 리포트 카드 화면 출력
function showDiagnosisReport(clearedRounds, avgMs) {
  const result = evaluateCognitiveProfile(clearedRounds, avgMs);

  reportGrade.textContent = result.grade;
  reportGrade.className = `grade-circle grade-${result.grade}`;
  reportBrainType.textContent = result.brainType;
  reportTypeDesc.textContent = result.typeDesc;
  reportTotalScore.textContent = `${result.totalScore.toLocaleString()}점`;
  reportRound.textContent = `${clearedRounds}단계`;
  reportAvgMs.textContent = avgMs > 0 ? `${avgMs}ms` : '측정 불가';
  reportMultiplier.textContent = `×${result.totalMultiplier}`;

  reportCard.classList.remove('hidden');
}

// 사용자 타일 클릭 처리
async function handleTileClick(index, tileElement) {
  if (!isPlaying || isShowingSequence) return;

  // 클릭 시점 반응 속도(ms) 계산 (소수점 정밀 측정을 위해 performance.now() 사용)
  const now = performance.now();
  const reactionMs = Math.round(now - lastActionTimestamp);
  lastActionTimestamp = now;

  const currentStep = playerSequence.length;
  playerSequence.push(index);

  // 정답인 경우
  if (index === sequence[currentStep]) {
    reactionTimes.push(reactionMs);
    const avgMs = getAverageReactionMs();
    avgReactionDisplay.textContent = `${avgMs} ms`;

    const totalTiles = gridSize * gridSize;
    const freq = 260 + (index / totalTiles) * 360;
    playTone(freq, 0.14);

    tileElement.classList.add('correct');
    setTimeout(() => tileElement.classList.remove('correct'), 200);

    messageBox.innerHTML = `👆 순서대로 클릭하세요! (<strong>${playerSequence.length} / ${sequence.length}</strong> · 방금 ${reactionMs}ms)`;

    if (playerSequence.length === sequence.length) {
      isShowingSequence = true;
      saveBestScore(round);
      messageBox.innerHTML = `🎉 <strong>${round}라운드 성공!</strong> (평균 반응속도 ${avgMs}ms)`;
      await sleep(750);
      nextRound();
    }
  } else {
    // 오답인 경우 -> 게임 종료 및 종합 인지 진단 리포트 출력
    playTone(140, 0.4, 'sawtooth');
    tileElement.classList.add('wrong');
    setTimeout(() => tileElement.classList.remove('wrong'), 500);

    const clearedRounds = round - 1;
    const finalAvgMs = getAverageReactionMs();
    saveBestScore(clearedRounds);

    isPlaying = false;
    startBtn.disabled = false;
    startBtn.textContent = '다시 도전하기';

    messageBox.innerHTML = `❌ <strong>게임 오버!</strong> 아래에서 <strong>종합 인지 진단 리포트</strong>를 확인하세요.`;
    showDiagnosisReport(clearedRounds, finalAvgMs);
  }
}

// 게임 시작 버튼
startBtn.addEventListener('click', () => {
  sequence = [];
  playerSequence = [];
  reactionTimes = [];
  round = 0;
  isPlaying = true;
  avgReactionDisplay.textContent = '- ms';
  reportCard.classList.add('hidden');
  startBtn.disabled = true;
  startBtn.textContent = '게임 진행 중...';
  nextRound();
});

// 초기 실행
createBoard(gridSize);
updateModeUI();