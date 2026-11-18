const grid = document.getElementById('grid');
const startBtn = document.getElementById('start-btn');
const levelDisplay = document.getElementById('level-display');
const bestDisplay = document.getElementById('best-display');
const statusMessage = document.getElementById('status-message');
const diffButtons = document.querySelectorAll('.diff-btn');

// 난이도별 설정값 (격자 줄 수, 불빛 켜지는 시간, 다음 불빛까지 대기 시간)
const DIFFICULTIES = {
  easy: { label: '쉬움', cols: 3, lightDuration: 550, gapDuration: 280 },
  normal: { label: '보통', cols: 4, lightDuration: 380, gapDuration: 200 },
  hard: { label: '어려움', cols: 5, lightDuration: 240, gapDuration: 130 }
};

let currentDiff = 'easy';
let sequence = [];
let playerSequence = [];
let level = 0;
let canClick = false;
let gameId = 0;

function getBestScore(diff) {
  return Number(localStorage.getItem(`memoryBest_${diff}`)) || 0;
}

function setBestScore(diff, score) {
  localStorage.setItem(`memoryBest_${diff}`, score);
}

// 난이도에 맞춰 3x3, 4x4, 5x5 타일을 동적으로 생성
function setupBoard(diff) {
  const config = DIFFICULTIES[diff];
  grid.style.setProperty('--cols', config.cols);
  grid.innerHTML = '';

  const totalTiles = config.cols * config.cols;
  for (let i = 0; i < totalTiles; i++) {
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.dataset.index = i;
    grid.appendChild(tile);
  }

  bestDisplay.textContent = getBestScore(diff);
}

// Web Audio API로 최대 25개 타일까지 조화로운 음계 효과음 생성
let audioCtx = null;
function playTone(index, isError = false) {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  // 펜타토닉(5음계) 비율을 활용해 어떤 순서로 눌러도 맑은 화음 느낌 유지
  const ratios = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
  const octave = Math.floor(index / 5);
  const noteFreq = 130.81 * Math.pow(2, octave) * ratios[index % 5];

  osc.type = isError ? 'sawtooth' : 'sine';
  osc.frequency.setValueAtTime(isError ? 130 : noteFreq, audioCtx.currentTime);

  gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (isError ? 0.4 : 0.25));

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + (isError ? 0.4 : 0.25));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lightUpTile(index, duration) {
  const tiles = grid.querySelectorAll('.tile');
  const tile = tiles[index];
  if (!tile) return;

  tile.classList.add('active');
  playTone(index, false);
  await sleep(duration);
  tile.classList.remove('active');
}

// 난이도 버튼 클릭 이벤트
diffButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const selectedDiff = btn.dataset.diff;
    if (selectedDiff === currentDiff && level === 0) return;

    // 진행 중이던 게임 초기화
    gameId++;
    canClick = false;
    sequence = [];
    playerSequence = [];
    level = 0;
    levelDisplay.textContent = 0;

    diffButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    currentDiff = selectedDiff;
    setupBoard(currentDiff);

    startBtn.textContent = '게임 시작';
    statusMessage.textContent = `[${DIFFICULTIES[currentDiff].label}] 모드가 선택되었습니다. 시작을 눌러주세요!`;
    statusMessage.style.color = '#e2e8f0';
  });
});

// 게임 시작 버튼
startBtn.addEventListener('click', () => {
  gameId++;
  sequence = [];
  playerSequence = [];
  level = 0;
  startBtn.textContent = '처음부터 다시 시작';
  nextLevel(gameId);
});

// 다음 단계 진행
async function nextLevel(currentGameId) {
  canClick = false;
  playerSequence = [];
  level++;
  levelDisplay.textContent = level;
  statusMessage.textContent = '👀 불빛 순서를 잘 기억하세요!';
  statusMessage.style.color = '#38bdf8';

  const config = DIFFICULTIES[currentDiff];
  const totalTiles = config.cols * config.cols;
  const nextTileIndex = Math.floor(Math.random() * totalTiles);
  sequence.push(nextTileIndex);

  await sleep(550);
  if (gameId !== currentGameId) return;

  for (let i = 0; i < sequence.length; i++) {
    if (gameId !== currentGameId) return;
    await lightUpTile(sequence[i], config.lightDuration);
    await sleep(config.gapDuration);
  }

  if (gameId !== currentGameId) return;
  canClick = true;
  statusMessage.textContent = '👆 기억한 순서대로 눌러주세요!';
  statusMessage.style.color = '#4ade80';
}

// 타일 클릭 처리 (이벤트 위임 방식)
grid.addEventListener('click', async (e) => {
  const tile = e.target.closest('.tile');
  if (!tile || !canClick) return;

  const clickedIndex = Number(tile.dataset.index);
  playerSequence.push(clickedIndex);
  const currentStep = playerSequence.length - 1;
  const config = DIFFICULTIES[currentDiff];

  // 1. 틀린 타일을 눌렀을 경우
  if (playerSequence[currentStep] !== sequence[currentStep]) {
    canClick = false;
    tile.classList.add('wrong');
    playTone(clickedIndex, true);
    statusMessage.textContent = `❌ 아쉽습니다! [${config.label}] ${level}단계에서 종료되었습니다.`;
    statusMessage.style.color = '#f87171';
    startBtn.textContent = '다시 도전하기';

    setTimeout(() => {
      tile.classList.remove('wrong');
    }, 400);
    return;
  }

  // 2. 맞는 타일을 눌렀을 경우
  const clickFlash = Math.min(200, config.lightDuration * 0.6);
  lightUpTile(clickedIndex, clickFlash);

  // 3. 이번 단계 완료 시
  if (playerSequence.length === sequence.length) {
    canClick = false;
    const currentBest = getBestScore(currentDiff);
    if (level > currentBest) {
      setBestScore(currentDiff, level);
      bestDisplay.textContent = level;
    }

    statusMessage.textContent = '🎉 정답입니다! 다음 단계로...';
    statusMessage.style.color = '#facc15';

    const currentGameId = gameId;
    await sleep(850);
    if (gameId === currentGameId) {
      nextLevel(currentGameId);
    }
  }
});

// 초기 화면 3x3 보드 세팅
setupBoard(currentDiff);