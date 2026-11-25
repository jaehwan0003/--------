// DOM 요소 참조
const gameBoard = document.getElementById('game-board');
const gridButtons = document.querySelectorAll('.grid-btn');
const speedButtons = document.querySelectorAll('.speed-btn');
const speedPanel = document.getElementById('speed-panel');
const selectedGridText = document.getElementById('selected-grid-text');
const currentModeBadge = document.getElementById('current-mode-badge');
const roundDisplay = document.getElementById('round-display');
const bestScoreDisplay = document.getElementById('best-score-display');
const messageBox = document.getElementById('message-box');
const startBtn = document.getElementById('start-btn');

// 속도 난이도별 파라미터 설정 (점등 시간, 칸 사이 대기 시간)
const SPEED_CONFIG = {
  easy: {
    label: '쉬움',
    lightOnMs: 650,   // 불빛이 켜져 있는 시간 (ms)
    gapMs: 250        // 다음 불빛까지의 간격 (ms)
  },
  normal: {
    label: '보통',
    lightOnMs: 420,
    gapMs: 180
  },
  hard: {
    label: '어려움',
    lightOnMs: 220,
    gapMs: 110
  }
};

// 게임 상태 변수
let gridSize = 3;            // 3 ~ 8
let speedKey = 'normal';     // 'easy' | 'normal' | 'hard'
let sequence = [];           // 정답 패턴 배열
let playerSequence = [];     // 사용자 입력 배열
let round = 0;
let isPlaying = false;
let isShowingSequence = false;

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

// 모드별 최고 기록 키 생성 (예: memory_best_5_hard)
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

// 현재 선택된 크기와 속도 UI 업데이트
function updateModeUI() {
  const speedLabel = SPEED_CONFIG[speedKey].label;
  selectedGridText.textContent = `${gridSize}×${gridSize}`;
  currentModeBadge.textContent = `${gridSize}×${gridSize} · ${speedLabel}`;
  loadBestScore();
}

// 동적 NxN 보드 생성 (3x3 ~ 8x8)
function createBoard(size) {
  gameBoard.innerHTML = '';
  // 칸 수가 많아질수록 간격(gap)을 자동 축소해 8x8에서도 깨지지 않도록 처리
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

// 1단계: 격자 크기 버튼 클릭 이벤트 (3x3 ~ 8x8)
gridButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (isPlaying) return;
    gridButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    gridSize = Number(btn.dataset.size);
    createBoard(gridSize);
    updateModeUI();

    // 2단계 속도 선택 창을 시각적으로 강조해 자연스럽게 속도 선택 유도
    speedPanel.classList.remove('highlight-pop');
    void speedPanel.offsetWidth; // 애니메이션 리셋
    speedPanel.classList.add('highlight-pop');

    messageBox.innerHTML = `<strong>${gridSize}×${gridSize}</strong> 선택됨! 아래에서 <strong>속도 난이도</strong>를 고른 뒤 시작하세요.`;
  });
});

// 2단계: 속도 난이도 버튼 클릭 이벤트 (쉬움 / 보통 / 어려움)
speedButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (isPlaying) return;
    speedButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    speedKey = btn.dataset.speed;
    updateModeUI();

    const speedLabel = SPEED_CONFIG[speedKey].label;
    messageBox.innerHTML = `<strong>${gridSize}×${gridSize} (${speedLabel})</strong> 모드 준비 완료! <strong>게임 시작</strong>을 누르세요.`;
  });
});

// 지연 함수
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 특정 타일 점등 효과
async function flashTile(index, durationMs) {
  const tiles = document.querySelectorAll('.tile');
  const tile = tiles[index];
  if (!tile) return;

  // 타일 위치에 따라 다른 음높이 출력 (260Hz ~ 620Hz)
  const totalTiles = gridSize * gridSize;
  const freq = 260 + (index / totalTiles) * 360;
  playTone(freq, durationMs / 1000);

  tile.classList.add('active');
  await sleep(durationMs);
  tile.classList.remove('active');
}

// 다음 라운드 시작 및 패턴 시연
async function nextRound() {
  isShowingSequence = true;
  playerSequence = [];
  round++;
  roundDisplay.textContent = round;

  const totalTiles = gridSize * gridSize;
  const randomTile = Math.floor(Math.random() * totalTiles);
  sequence.push(randomTile);

  const { lightOnMs, gapMs } = SPEED_CONFIG[speedKey];
  messageBox.innerHTML = `👀 패턴을 기억하세요! (<strong>${sequence.length}단계</strong> · ${SPEED_CONFIG[speedKey].label} 속도)`;

  await sleep(500);

  for (let i = 0; i < sequence.length; i++) {
    await flashTile(sequence[i], lightOnMs);
    await sleep(gapMs);
  }

  isShowingSequence = false;
  messageBox.innerHTML = `👆 순서대로 클릭하세요! (<strong>0 / ${sequence.length}</strong>)`;
}

// 사용자 타일 클릭 처리
async function handleTileClick(index, tileElement) {
  if (!isPlaying || isShowingSequence) return;

  const currentStep = playerSequence.length;
  playerSequence.push(index);

  // 정답 비교
  if (index === sequence[currentStep]) {
    const totalTiles = gridSize * gridSize;
    const freq = 260 + (index / totalTiles) * 360;
    playTone(freq, 0.14);

    tileElement.classList.add('correct');
    setTimeout(() => tileElement.classList.remove('correct'), 200);

    messageBox.innerHTML = `👆 순서대로 클릭하세요! (<strong>${playerSequence.length} / ${sequence.length}</strong>)`;

    // 현재 라운드 패턴을 모두 맞혔을 때
    if (playerSequence.length === sequence.length) {
      isShowingSequence = true;
      saveBestScore(round);
      messageBox.innerHTML = `🎉 <strong>${round}라운드 성공!</strong> 다음 단계로 넘어갑니다...`;
      await sleep(700);
      nextRound();
    }
  } else {
    // 오답 처리
    playTone(140, 0.4, 'sawtooth');
    tileElement.classList.add('wrong');
    setTimeout(() => tileElement.classList.remove('wrong'), 500);

    const finalScore = round - 1;
    saveBestScore(finalScore);
    isPlaying = false;
    startBtn.disabled = false;
    startBtn.textContent = '다시 도전하기';

    messageBox.innerHTML = `❌ <strong>게임 오버!</strong> (${gridSize}×${gridSize} · ${SPEED_CONFIG[speedKey].label} 모드 최종 <strong>${finalScore}라운드</strong> 달성)`;
  }
}

// 게임 시작 버튼
startBtn.addEventListener('click', () => {
  sequence = [];
  playerSequence = [];
  round = 0;
  isPlaying = true;
  startBtn.disabled = true;
  startBtn.textContent = '게임 진행 중...';
  nextRound();
});

// 초기 실행
createBoard(gridSize);
updateModeUI();