import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  RotateCcw, 
  User, 
  Users, 
  Cpu, 
  HelpCircle, 
  Volume2, 
  VolumeX, 
  Plus, 
  Award, 
  BookOpen, 
  ArrowRight, 
  Tv, 
  Shield, 
  Flame,
  Target,
  Trophy,
  CheckCircle,
  XCircle,
  TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  onSnapshot, 
  updateDoc, 
  doc, 
  query, 
  where,
  deleteDoc
} from 'firebase/firestore';

// Procedural sound synthesizer for realistic soccer/penalty audio cues
class SoccerAudio {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  constructor() {}

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  }

  playWhistle() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1200, now);
      osc1.frequency.linearRampToValueAtTime(1400, now + 0.1);
      osc1.frequency.linearRampToValueAtTime(1300, now + 0.25);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1210, now);
      osc2.frequency.linearRampToValueAtTime(1410, now + 0.1);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.3);
      osc2.stop(now + 0.3);
    } catch (e) {}
  }

  playKick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch (e) {}
  }

  playSave() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // White noise for gloves clap
      const bufferSize = this.ctx.sampleRate * 0.15; // 0.15s buffer
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1000;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      noiseNode.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noiseNode.start(now);
      noiseNode.stop(now + 0.15);
    } catch (e) {}
  }

  playGoalCheer() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // Synthesize deep crowd noise
      const bufferSize = this.ctx.sampleRate * 1.5; // 1.5s crowd roar
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, now);
      filter.frequency.exponentialRampToValueAtTime(800, now + 0.3);
      filter.frequency.exponentialRampToValueAtTime(250, now + 1.4);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

      noiseNode.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noiseNode.start(now);
      noiseNode.stop(now + 1.5);
    } catch (e) {}
  }

  playFoul() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.setValueAtTime(140, now + 0.1);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {}
  }
}

const audio = new SoccerAudio();

interface PenaltyRoomData {
  status: 'waiting' | 'playing' | 'finished';
  creator: { uid: string; name: string };
  opponent: { uid: string; name: string } | null;
  round: number;
  turn: 'p1_kick' | 'p2_kick';
  p1Score: number;
  p2Score: number;
  p1Attempts: string[];
  p2Attempts: string[];
  kickerAction: number | null; // 1 to 9
  gkAction: number | null; // 1 to 9
  gameState: 'waiting_choices' | 'animating' | 'result';
  lastShotResult: 'goal' | 'save' | 'post' | 'out' | null;
  winner: string | null;
  gameStatus: string;
  updatedAt: number;
}

export function PenaltyGame({ user }: { user: any }) {
  const [gameMode, setGameMode] = useState<'menu' | 'ai' | 'local' | 'lobby' | 'online'>('menu');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showRules, setShowRules] = useState(false);

  // Profile configuration
  const [localProfile, setLocalProfile] = useState({ uid: '', name: 'Cliente' });

  // Online Room parameters
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [onlineRooms, setOnlineRooms] = useState<any[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // Game Play states (Synced for local, and used for UI state)
  const [round, setRound] = useState(1);
  const [turn, setTurn] = useState<'p1_kick' | 'p2_kick'>('p1_kick'); // P1 is Creator/Player, P2 is Opponent/AI
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [p1Attempts, setP1Attempts] = useState<string[]>([]); // Array of '⚽', '🧤', '❌'
  const [p2Attempts, setP2Attempts] = useState<string[]>([]);
  const [kickerAction, setKickerAction] = useState<number | null>(null);
  const [gkAction, setGkAction] = useState<number | null>(null);
  const [gameState, setGameState] = useState<'waiting_choices' | 'animating' | 'result'>('waiting_choices');
  const [lastShotResult, setLastShotResult] = useState<'goal' | 'save' | 'post' | 'out' | null>(null);
  const [winner, setWinner] = useState<string | null>(null);
  const [gameStatus, setGameStatus] = useState('Escolha o modo para iniciar a disputa de pênaltis!');

  // Real-time synchronization state helpers
  const [roomCreator, setRoomCreator] = useState<any>(null);
  const [roomOpponent, setRoomOpponent] = useState<any>(null);

  // Local/Pass & play auxiliary state to hide/reveal choices
  const [secretKickerChoice, setSecretKickerChoice] = useState<number | null>(null);
  const [secretGkChoice, setSecretGkChoice] = useState<number | null>(null);
  const [localRoleTurn, setLocalRoleTurn] = useState<'kicker' | 'goalkeeper'>('kicker');

  // Animation controller coordinates
  const [ballOffset, setBallOffset] = useState({ x: 0, y: 0, scale: 1 });
  const [gkOffset, setGkOffset] = useState({ x: 0, y: 0, dive: 'center' }); // center, left, right, up_left, up_right, down_left, down_right

  // Grid coordinates mapping to animate the ball correctly to the goal grid
  // Grid 1 to 9 (1: Top Left, 2: Top Center, 3: Top Right, etc.)
  const getGridCoordinates = (num: number) => {
    switch (num) {
      case 1: return { x: -100, y: -90, dive: 'up_left' };
      case 2: return { x: 0, y: -100, dive: 'up' };
      case 3: return { x: 100, y: -90, dive: 'up_right' };
      case 4: return { x: -110, y: -30, dive: 'left' };
      case 5: return { x: 0, y: -30, dive: 'center' };
      case 6: return { x: 110, y: -30, dive: 'right' };
      case 7: return { x: -100, y: 30, dive: 'down_left' };
      case 8: return { x: 0, y: 40, dive: 'down' };
      case 9: return { x: 100, y: 30, dive: 'down_right' };
      default: return { x: 0, y: 0, dive: 'center' };
    }
  };

  // Sound sync
  useEffect(() => {
    audio.enabled = soundEnabled;
  }, [soundEnabled]);

  // Set Profile Identity
  useEffect(() => {
    if (user) {
      setLocalProfile({
        uid: user.uid,
        name: user.displayName || user.email?.split('@')[0] || 'Cliente'
      });
    } else {
      let guestId = localStorage.getItem('penalty_guest_id');
      let guestName = localStorage.getItem('penalty_guest_name');
      if (!guestId) {
        guestId = 'guest_penalty_' + Math.random().toString(36).substring(2, 9);
        guestName = 'Cliente #' + Math.floor(1000 + Math.random() * 9000);
        localStorage.setItem('penalty_guest_id', guestId);
        localStorage.setItem('penalty_guest_name', guestName);
      }
      setLocalProfile({
        uid: guestId,
        name: guestName || 'Cliente'
      });
    }
  }, [user]);

  // Fetch online lobbies
  const fetchOnlineLobbies = async () => {
    setLoadingRooms(true);
    try {
      const q = query(collection(db, 'penalty_rooms'), where('status', '==', 'waiting'));
      const snapshot = await getDocs(q);
      const list: any[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setOnlineRooms(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    if (gameMode === 'lobby') {
      fetchOnlineLobbies();
      const q = query(collection(db, 'penalty_rooms'), where('status', '==', 'waiting'));
      const unsub = onSnapshot(q, (snapshot) => {
        const list: any[] = [];
        snapshot.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        setOnlineRooms(list);
      });
      return () => unsub();
    }
  }, [gameMode]);

  // Create real-time online room in Firestore
  const createOnlineRoom = async () => {
    try {
      const roomPayload: PenaltyRoomData = {
        status: 'waiting',
        creator: {
          uid: localProfile.uid,
          name: localProfile.name
        },
        opponent: null,
        round: 1,
        turn: 'p1_kick',
        p1Score: 0,
        p2Score: 0,
        p1Attempts: [],
        p2Attempts: [],
        kickerAction: null,
        gkAction: null,
        gameState: 'waiting_choices',
        lastShotResult: null,
        winner: null,
        gameStatus: 'Mesa criada! Aguardando oponente entrar para a disputa...',
        updatedAt: Date.now()
      };

      const docRef = await addDoc(collection(db, 'penalty_rooms'), roomPayload);
      setRoomId(docRef.id);
      setIsCreator(true);
      setGameMode('online');
      setRoomCreator(roomPayload.creator);
      setRoomOpponent(null);
    } catch (e) {
      console.error(e);
    }
  };

  // Join existing online room in Firestore
  const joinOnlineRoom = async (targetRoomId: string) => {
    try {
      const roomRef = doc(db, 'penalty_rooms', targetRoomId);
      const opponentData = {
        uid: localProfile.uid,
        name: localProfile.name
      };

      await updateDoc(roomRef, {
        status: 'playing',
        opponent: opponentData,
        gameStatus: `Disputa iniciada! ${localProfile.name} entrou para defender/chutar.`,
        updatedAt: Date.now()
      });

      setRoomId(targetRoomId);
      setIsCreator(false);
      setGameMode('online');
    } catch (e) {
      console.error(e);
    }
  };

  // Real-time synchronization subscription for active online room
  useEffect(() => {
    if (gameMode !== 'online' || !roomId) return;

    const unsub = onSnapshot(doc(db, 'penalty_rooms', roomId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as PenaltyRoomData;

        // Synchronize general states
        setRound(data.round);
        setTurn(data.turn);
        setP1Score(data.p1Score);
        setP2Score(data.p2Score);
        setP1Attempts(data.p1Attempts || []);
        setP2Attempts(data.p2Attempts || []);
        setRoomCreator(data.creator);
        setRoomOpponent(data.opponent);
        setWinner(data.winner);
        setGameStatus(data.gameStatus);

        // Keep action logs for animations
        setKickerAction(data.kickerAction);
        setGkAction(data.gkAction);

        // Trigger animation flow if both choices are registered and we are in waiting_choices
        if (data.kickerAction !== null && data.gkAction !== null && data.gameState === 'waiting_choices' && gameState === 'waiting_choices') {
          triggerShotAnimation(data.kickerAction, data.gkAction, data.turn);
        }
      }
    });

    return () => unsub();
  }, [roomId, gameMode, gameState]);

  // Determine current role of the local user in the online game
  const getMyOnlineRole = () => {
    if (gameMode !== 'online') return null;
    const currentIsP1Turn = turn === 'p1_kick';
    
    if (isCreator) {
      // Creator is P1
      return currentIsP1Turn ? 'kicker' : 'goalkeeper';
    } else {
      // Opponent is P2
      return currentIsP1Turn ? 'goalkeeper' : 'kicker';
    }
  };

  // Offline or Pass-and-play Start Trigger
  const startNewOfflineGame = (mode: 'ai' | 'local') => {
    setGameMode(mode);
    setRound(1);
    setTurn('p1_kick');
    setP1Score(0);
    setP2Score(0);
    setP1Attempts([]);
    setP2Attempts([]);
    setKickerAction(null);
    setGkAction(null);
    setSecretKickerChoice(null);
    setSecretGkChoice(null);
    setLocalRoleTurn('kicker');
    setGameState('waiting_choices');
    setLastShotResult(null);
    setWinner(null);
    
    if (mode === 'ai') {
      setGameStatus('Sua vez de Chutar! Selecione um quadrante no gol.');
    } else {
      setGameStatus('Rodada 1: Jogador 1 Chuta, Jogador 2 Defende!');
    }
  };

  // Submit choices for local or online play
  const makeChoice = async (quadrant: number) => {
    if (gameState !== 'waiting_choices' || winner) return;

    if (gameMode === 'online' && roomId) {
      const myRole = getMyOnlineRole();
      
      if (myRole === 'kicker') {
        audio.playKick();
        await updateDoc(doc(db, 'penalty_rooms', roomId), {
          kickerAction: quadrant,
          gameStatus: `O Batedor escolheu onde chutar! Aguardando o Goleiro...`
        });
      } else if (myRole === 'goalkeeper') {
        await updateDoc(doc(db, 'penalty_rooms', roomId), {
          gkAction: quadrant,
          gameStatus: `O Goleiro se posicionou! Aguardando o Batedor...`
        });
      }
    } 
    else if (gameMode === 'ai') {
      // Player choice
      const isPlayerKicker = turn === 'p1_kick';

      if (isPlayerKicker) {
        audio.playKick();
        // Player kicks, AI Goalkeeper chooses randomly
        const aiGkChoice = Math.floor(Math.random() * 9) + 1;
        setKickerAction(quadrant);
        setGkAction(aiGkChoice);
        triggerShotAnimation(quadrant, aiGkChoice, 'p1_kick');
      } else {
        // Player is Goalkeeper, AI kicks randomly
        const aiKickerChoice = Math.floor(Math.random() * 9) + 1;
        setKickerAction(aiKickerChoice);
        setGkAction(quadrant);
        triggerShotAnimation(aiKickerChoice, quadrant, 'p2_kick');
      }
    }
    else if (gameMode === 'local') {
      // Local Pass and Play
      if (localRoleTurn === 'kicker') {
        audio.playKick();
        setSecretKickerChoice(quadrant);
        // Switch role input to goalkeeper
        setLocalRoleTurn('goalkeeper');
        setGameStatus('Agora passe o celular para o Goleiro escolher o canto de defesa em segredo!');
      } else {
        // Goalkeeper submitted
        setSecretGkChoice(quadrant);
        
        // Resolve immediately
        setKickerAction(secretKickerChoice);
        setGkAction(quadrant);
        triggerShotAnimation(secretKickerChoice!, quadrant, turn);
      }
    }
  };

  // Core Physics and Animation triggering
  const triggerShotAnimation = (kick: number, save: number, shootingTurn: 'p1_kick' | 'p2_kick') => {
    setGameState('animating');
    audio.playWhistle();

    const ballCoords = getGridCoordinates(kick);
    const gkCoords = getGridCoordinates(save);

    // 1. Reset anim offsets
    setBallOffset({ x: 0, y: 0, scale: 1 });
    setGkOffset({ x: 0, y: 0, dive: 'center' });

    // 2. Animate elements with synchronized timing
    setTimeout(() => {
      // Goalkeeper dives
      setGkOffset({
        x: gkCoords.x * 0.75,
        y: gkCoords.y * 0.35,
        dive: gkCoords.dive
      });

      // Ball travels to goal
      setBallOffset({
        x: ballCoords.x,
        y: ballCoords.y,
        scale: 0.35 // flies deep into the distance
      });
    }, 450);

    // 3. Resolve results after animation finishes
    setTimeout(() => {
      resolveShotOutcome(kick, save, shootingTurn);
    }, 1200);
  };

  // Calculate penalty shootout outcome
  const resolveShotOutcome = async (kick: number, save: number, shootingTurn: 'p1_kick' | 'p2_kick') => {
    let result: 'goal' | 'save' | 'post' | 'out' = 'goal';
    
    if (kick === save) {
      result = 'save';
      audio.playSave();
    } else {
      // Add a slight chance of hitting the post or out for high corners (1, 3) to make the simulation organic
      const isCorner = kick === 1 || kick === 3;
      const rnd = Math.random();
      if (isCorner && rnd < 0.12) {
        result = 'post';
        audio.playFoul();
      } else if (isCorner && rnd < 0.08) {
        result = 'out';
        audio.playFoul();
      } else {
        result = 'goal';
        audio.playGoalCheer();
      }
    }

    setLastShotResult(result);
    setGameState('result');

    // Update score lists locally (for UI immediate update)
    let nextP1Score = p1Score;
    let nextP2Score = p2Score;
    let nextP1Attempts = [...p1Attempts];
    let nextP2Attempts = [...p2Attempts];

    const mark = result === 'goal' ? '⚽' : result === 'save' ? '🧤' : '❌';

    if (shootingTurn === 'p1_kick') {
      nextP1Attempts.push(mark);
      if (result === 'goal') nextP1Score += 1;
      setP1Attempts(nextP1Attempts);
      setP1Score(nextP1Score);
    } else {
      nextP2Attempts.push(mark);
      if (result === 'goal') nextP2Score += 1;
      setP2Attempts(nextP2Attempts);
      setP2Score(nextP2Score);
    }

    // Determine state transition or check for game over
    let nextRound = round;
    let nextTurn = shootingTurn;
    let localWinner: string | null = null;
    let nextStatus = '';

    // Check game over logic
    // Penalties are usually 5 rounds. If after certain rounds, one player has a margin that cannot be overcome, they win.
    const p1Remaining = Math.max(0, 5 - nextP1Attempts.length);
    const p2Remaining = Math.max(0, 5 - nextP2Attempts.length);

    const isGameOver = () => {
      // Early win check
      if (nextP1Score > nextP2Score + p2Remaining) return 'p1';
      if (nextP2Score > nextP1Score + p1Remaining) return 'p2';
      
      // Tied after 5 complete rounds => Sudden Death (Golden Goals)
      if (nextP1Attempts.length >= 5 && nextP2Attempts.length >= 5) {
        if (nextP1Attempts.length === nextP2Attempts.length) {
          if (nextP1Score > nextP2Score) return 'p1';
          if (nextP2Score > nextP1Score) return 'p2';
        }
      }
      return null;
    };

    const gameOverCode = isGameOver();

    if (gameOverCode) {
      if (gameMode === 'online') {
        localWinner = gameOverCode === 'p1' ? roomCreator?.name : (roomOpponent?.name || 'Jogador 2');
        nextStatus = `FIM DE JOGO! Campeão da Disputa: ${localWinner}! 🎉`;
      } else if (gameMode === 'ai') {
        localWinner = gameOverCode === 'p1' ? 'Você' : 'O Robô AI';
        nextStatus = `FIM DE JOGO! Campeão da Disputa: ${localWinner}! 🎉`;
      } else {
        localWinner = gameOverCode === 'p1' ? 'Jogador 1' : 'Jogador 2';
        nextStatus = `FIM DE JOGO! Campeão da Disputa: ${localWinner}! 🎉`;
      }
    } else {
      // Switch turns
      if (shootingTurn === 'p1_kick') {
        nextTurn = 'p2_kick';
        if (gameMode === 'ai') {
          nextStatus = `Sua vez de ser o Goleiro! Defenda a batida do Robô AI.`;
        } else if (gameMode === 'local') {
          nextStatus = `Agora Jogador 2 Chuta e Jogador 1 Defende!`;
        } else {
          nextStatus = `Revezamento! Agora o Oponente chuta. Se prepare para defender!`;
        }
      } else {
        nextTurn = 'p1_kick';
        nextRound += 1;
        if (gameMode === 'ai') {
          nextStatus = `Rodada ${nextRound}! Sua vez de chutar.`;
        } else if (gameMode === 'local') {
          nextStatus = `Rodada ${nextRound}! Jogador 1 Chuta, Jogador 2 Defende.`;
        } else {
          nextStatus = `Rodada ${nextRound}! Sua vez de Chutar. Escolha o canto!`;
        }
      }
    }

    setRound(nextRound);
    setTurn(nextTurn);
    setWinner(localWinner);
    setGameStatus(nextStatus);

    // Save final state update to Firestore
    if (gameMode === 'online' && roomId) {
      await updateDoc(doc(db, 'penalty_rooms', roomId), {
        round: nextRound,
        turn: nextTurn,
        p1Score: nextP1Score,
        p2Score: nextP2Score,
        p1Attempts: nextP1Attempts,
        p2Attempts: nextP2Attempts,
        kickerAction: null,
        gkAction: null,
        gameState: 'waiting_choices',
        lastShotResult: result,
        winner: localWinner,
        gameStatus: nextStatus,
        updatedAt: Date.now()
      });
    }
  };

  // Continue to next round
  const continueNextRound = () => {
    setKickerAction(null);
    setGkAction(null);
    setSecretKickerChoice(null);
    setSecretGkChoice(null);
    setLocalRoleTurn('kicker');
    setGameState('waiting_choices');
    setLastShotResult(null);

    // Animate ball and gk back to center
    setBallOffset({ x: 0, y: 0, scale: 1 });
    setGkOffset({ x: 0, y: 0, dive: 'center' });
  };

  const handleExit = async () => {
    if (gameMode === 'online' && roomId && isCreator) {
      try {
        await deleteDoc(doc(db, 'penalty_rooms', roomId));
      } catch (e) {}
    }
    setGameMode('menu');
    setRoomId(null);
  };

  // Render score board indicators (dots representing balls/gloves)
  const renderAttemptMarkers = (attempts: string[]) => {
    const list = [...attempts];
    while (list.length < 5) {
      list.push('⚫'); // empty marker
    }
    return (
      <div className="flex gap-1.5 items-center justify-center">
        {list.map((item, idx) => (
          <span 
            key={idx} 
            className={`text-sm ${
              item === '⚽' ? 'animate-bounce' : item === '🧤' ? 'opacity-80' : 'opacity-30'
            }`}
          >
            {item}
          </span>
        ))}
      </div>
    );
  };

  // Help calculate the direction label
  const getDirectionName = (num: number) => {
    switch (num) {
      case 1: return 'Canto Superior Esquerdo ↖';
      case 2: return 'Centro Superior ⬆';
      case 3: return 'Canto Superior Direito ↗';
      case 4: return 'Canto Esquerdo Meio ⬅';
      case 5: return 'Centro do Gol 🎯';
      case 6: return 'Canto Direito Meio ➡';
      case 7: return 'Canto Inferior Esquerdo ↙';
      case 8: return 'Centro Inferior ⬇';
      case 9: return 'Canto Inferior Direito ↘';
      default: return 'Centro';
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6" id="penalty_game_panel">
      {/* Rules Modal */}
      <AnimatePresence>
        {showRules && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#151515] border border-white/10 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl text-left"
            >
              <div className="flex items-center gap-3 text-amber-500 border-b border-white/10 pb-3">
                <BookOpen className="w-6 h-6 shrink-0" />
                <h3 className="text-lg font-black uppercase tracking-wider">Regras dos Pênaltis</h3>
              </div>
              
              <div className="text-sm text-white/70 space-y-3 max-h-[350px] overflow-y-auto pr-2">
                <p>
                  <strong>1. O Duelo:</strong> Um jogador chuta e o outro defende (Goleiro). Quem marcar mais gols após 5 rodadas é o vencedor.
                </p>
                <p>
                  <strong>2. Mecânica do Chute:</strong> Escolha um dos 9 quadrantes do gol para chutar.
                </p>
                <p>
                  <strong>3. Mecânica de Defesa:</strong> O Goleiro escolhe secretamente um quadrante para pular.
                </p>
                <p>
                  <strong>4. Defesa e Gol:</strong> Se o Goleiro pular exatamente no quadrante do chute, ele realiza uma <strong>DEFESA!</strong> Caso contrário, é <strong>GOL!</strong>
                </p>
                <p>
                  <strong>5. Risco e Recompensa:</strong> Chutar nos cantos superiores (1 e 3) tem um pequeno risco de mandar a bola para a trave ou para fora, mas são os cantos mais difíceis de defender!
                </p>
              </div>

              <button 
                onClick={() => setShowRules(false)}
                className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-black font-bold uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer"
              >
                Entendido!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Info Panel */}
      <div className="flex flex-col sm:flex-row items-center justify-between bg-white/5 border border-white/10 p-5 rounded-3xl gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 font-bold text-xl shrink-0">
            ⚽
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black tracking-tight text-white uppercase italic flex flex-wrap items-center justify-center sm:justify-start gap-2">
              Disputa de Pênaltis <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500 not-italic font-semibold">Ao Vivo 1v1</span>
            </h2>
            <p className="text-xs text-white/40">Desafie a Inteligência Artificial, jogue local ou convide outros clientes ao vivo!</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowRules(true)}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all cursor-pointer"
            title="Ver Regras"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all cursor-pointer"
            title={soundEnabled ? 'Silenciar' : 'Ativar Efeitos Sonoros'}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5 text-amber-500" /> : <VolumeX className="w-5 h-5 text-white/40" />}
          </button>

          {gameMode !== 'menu' && (
            <button 
              onClick={handleExit}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              Voltar ao Menu
            </button>
          )}
        </div>
      </div>

      {gameMode === 'menu' ? (
        /* MODE SELECTION CARDS */
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {/* Mode 1: Real-time Online (Multiplayer) */}
          <div className="bg-[#151515] border-2 border-amber-500/30 rounded-3xl p-5 flex flex-col justify-between hover:border-amber-500 transition-all hover:scale-[1.02] duration-300 shadow-xl group text-left relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-amber-500 text-black px-3 py-1 font-black text-[9px] uppercase tracking-widest rounded-bl-xl">
              Ao Vivo
            </div>
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-500 shrink-0">
                <Tv className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black uppercase text-white tracking-wider group-hover:text-amber-500 transition-colors">Disputar Online</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Jogue em tempo real! Crie uma sala e dispute chutes e defesas com outros clientes conectados à barbearia.
              </p>
            </div>
            <button 
              onClick={() => setGameMode('lobby')}
              className="mt-6 w-full py-3 bg-amber-500 text-black font-bold uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              Ver Salas Ativas <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Mode 2: VS AI Robot */}
          <div className="bg-[#151515] border border-white/10 rounded-3xl p-5 flex flex-col justify-between hover:border-amber-500/30 transition-all hover:scale-[1.02] duration-300 shadow-xl group text-left">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black uppercase text-white tracking-wider group-hover:text-amber-500 transition-colors">Treino Contra IA</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Pratique suas finalizações e suas defesas jogando contra a Inteligência Artificial com decisões táticas inteligentes.
              </p>
            </div>
            <button 
              onClick={() => startNewOfflineGame('ai')}
              className="mt-6 w-full py-3 bg-white/5 group-hover:bg-amber-500 group-hover:text-black text-white font-bold uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              Jogar com Robô <Play className="w-4 h-4" />
            </button>
          </div>

          {/* Mode 3: Local Pass & Play */}
          <div className="bg-[#151515] border border-white/10 rounded-3xl p-5 flex flex-col justify-between hover:border-amber-500/30 transition-all hover:scale-[1.02] duration-300 shadow-xl group text-left">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black uppercase text-white tracking-wider group-hover:text-amber-500 transition-colors">Local (1v1)</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Chute e defenda com seu amigo de barbearia no mesmo aparelho celular, alternando após cada chute em segredo!
              </p>
            </div>
            <button 
              onClick={() => startNewOfflineGame('local')}
              className="mt-6 w-full py-3 bg-white/5 group-hover:bg-amber-500 group-hover:text-black text-white font-bold uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              Jogar Local <Play className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      ) : gameMode === 'lobby' ? (
        /* ONLINE LOBBY ROOMS LIST */
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6 animate-fade-in"
        >
          {/* Active Player Tag */}
          <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-3xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500 font-black">
                {localProfile.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <p className="text-[10px] text-amber-500/70 font-bold uppercase tracking-widest">Seu Perfil</p>
                <p className="text-sm font-black text-white">{localProfile.name}</p>
              </div>
            </div>
            <button 
              onClick={createOnlineRoom}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-black uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer shadow-lg flex items-center gap-2"
            >
              Criar Desafio <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* List display */}
          <div className="bg-[#151515] border border-white/10 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-white/60">Salas de Pênaltis Disponíveis</h3>
              <button 
                onClick={fetchOnlineLobbies}
                className="text-[10px] font-bold text-amber-500 hover:underline uppercase tracking-wider"
              >
                Atualizar Lista
              </button>
            </div>

            {loadingRooms ? (
              <p className="text-white/40 text-xs py-8">Procurando desafiantes...</p>
            ) : onlineRooms.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <p className="text-white/40 text-sm italic">Nenhum jogador esperando.</p>
                <p className="text-xs text-white/30 max-w-sm mx-auto">
                  Crie sua sala de pênalti! Outros clientes na barbearia verão o seu convite no celular e entrarão para duelar.
                </p>
                <button 
                  onClick={createOnlineRoom}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                >
                  Abrir Sala Agora
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {onlineRooms.map(room => (
                  <div 
                    key={room.id}
                    className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between hover:border-amber-500/20 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white font-bold shrink-0">
                        ⚽
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-black text-white">{room.creator.name}</p>
                        <p className="text-[10px] text-white/40">Esperando Goleiro/Kicker...</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => joinOnlineRoom(room.id)}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-black uppercase tracking-widest text-[10px] rounded-lg transition-all cursor-pointer"
                    >
                      Aceitar Desafio
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      ) : (
        /* LIVE GAMEPLAY PANEL */
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Mobile Optimized SCOREBOARD & HUD */}
          <div className="bg-[#151515] border border-white/10 p-4 rounded-3xl space-y-4 shadow-xl">
            {/* Match Info / Mode */}
            <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2.5">
              <span className="text-[9px] uppercase tracking-widest bg-amber-500/15 text-amber-500 font-black px-2 py-0.5 rounded-full">
                Rodada {round}
              </span>
              <span className="text-[10px] text-white/40 font-bold uppercase">
                {gameMode === 'online' ? 'Duelo Online' : gameMode === 'ai' ? 'Vs Computador' : 'Passar e Jogar'}
              </span>
            </div>

            {/* Main Score Layout (Big and scannable on mobile screens) */}
            <div className="grid grid-cols-3 items-center text-center">
              {/* Player 1 Info & Scores */}
              <div className="space-y-1 text-left">
                <p className="text-[10px] text-white/40 uppercase font-black truncate max-w-[120px]">
                  {gameMode === 'online' ? roomCreator?.name : 'Jogador 1'}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white">{p1Score}</span>
                  <span className="text-[10px] text-emerald-500 font-bold uppercase">Gols</span>
                </div>
                {renderAttemptMarkers(p1Attempts)}
              </div>

              {/* VS separator */}
              <div className="text-center font-black italic text-white/20 text-lg">
                VS
              </div>

              {/* Player 2 Info & Scores */}
              <div className="space-y-1 text-right">
                <p className="text-[10px] text-white/40 uppercase font-black truncate max-w-[120px] ml-auto">
                  {gameMode === 'online' ? (roomOpponent?.name || 'Aguardando...') : gameMode === 'ai' ? 'Robô AI' : 'Jogador 2'}
                </p>
                <div className="flex items-baseline gap-2 justify-end">
                  <span className="text-[10px] text-emerald-500 font-bold uppercase">Gols</span>
                  <span className="text-3xl font-black text-white">{p2Score}</span>
                </div>
                {renderAttemptMarkers(p2Attempts)}
              </div>
            </div>

            {/* Status Announcement text */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-center text-xs text-white/80 font-medium">
              {gameStatus}
            </div>
          </div>

          {/* THE STADIUM CANVAS/SOCCER NET VIEWPORT */}
          <div className="bg-[#0b1f13] border-4 border-emerald-950 rounded-3xl p-4 min-h-[320px] relative shadow-inner overflow-hidden flex flex-col justify-end items-center aspect-[4/3] max-w-lg mx-auto">
            {/* Field Green Grass Striping */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#09351c] to-[#04200f] opacity-80 z-0 pointer-events-none" />
            
            {/* Soccer Goalpost Frame Rendered with HTML/CSS */}
            <div className="absolute top-10 left-10 right-10 bottom-24 border-t-[8px] border-l-[8px] border-r-[8px] border-white/90 rounded-t-lg shadow-2xl z-10 pointer-events-none flex flex-col justify-between">
              {/* Goal Netting Effect Layer */}
              <div className="w-full h-full bg-[linear-gradient(rgba(255,255,255,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.15)_1px,transparent_1px)] bg-[size:10px_10px]" />
            </div>

            {/* The Goal Line on Grass */}
            <div className="absolute bottom-24 left-0 right-0 h-[3px] bg-white/45 z-10 pointer-events-none" />

            {/* THE GOALKEEPER LAYER */}
            <motion.div 
              animate={{ 
                x: gkOffset.x, 
                y: gkOffset.y,
                rotate: gkOffset.dive === 'left' ? -35 : gkOffset.dive === 'right' ? 35 : gkOffset.dive === 'up_left' ? -45 : gkOffset.dive === 'up_right' ? 45 : 0
              }}
              transition={{ type: 'spring', damping: 15, stiffness: 120 }}
              className="absolute bottom-24 left-1/2 -ml-12 z-20 pointer-events-none flex flex-col items-center"
            >
              {/* Gloves / Torso representation */}
              <div className="flex gap-12 -mb-2">
                <div className="w-6 h-6 rounded-full bg-amber-500 border border-black flex items-center justify-center text-[10px] font-black shadow-lg">🧤</div>
                <div className="w-6 h-6 rounded-full bg-amber-500 border border-black flex items-center justify-center text-[10px] font-black shadow-lg">🧤</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-red-600 border-2 border-white shadow-xl flex items-center justify-center font-black text-xs text-white">
                GK
              </div>
              <div className="w-2 h-10 bg-zinc-800" />
            </motion.div>

            {/* THE SOCCER BALL LAYER */}
            <motion.div 
              animate={{ 
                x: ballOffset.x, 
                y: ballOffset.y, 
                scale: ballOffset.scale,
                rotate: ballOffset.x * 4 
              }}
              transition={{ type: 'spring', damping: 20, stiffness: 80 }}
              className="absolute bottom-6 left-1/2 -ml-6 z-30 pointer-events-none w-12 h-12 rounded-full bg-white border border-zinc-800 shadow-2xl flex items-center justify-center"
            >
              {/* Classic Soccer Pentagons */}
              <div className="w-full h-full rounded-full bg-[radial-gradient(circle_at_30%_30%,#ffffff,#e2e8f0_60%,#cbd5e1)] flex items-center justify-center overflow-hidden relative">
                <div className="absolute top-1 left-2 w-2 h-2 rounded-full bg-black/80 rotate-12" />
                <div className="absolute top-4 left-5 w-3 h-3 rounded-full bg-black/80" />
                <div className="absolute bottom-2 left-1 w-2.5 h-2.5 rounded-full bg-black/80" />
                <div className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-black/80" />
                <div className="absolute top-2 right-1 w-2.5 h-2.5 rounded-full bg-black/80" />
              </div>
            </motion.div>

            {/* Target overlay quadrants (Visible during target selection mode for kickers/defenders) */}
            {gameState === 'waiting_choices' && (
              <div className="absolute top-10 left-10 right-10 bottom-24 z-40 grid grid-cols-3 grid-rows-3 gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => {
                  const isSubmitted = (getMyOnlineRole() === 'kicker' && kickerAction === num) || 
                                      (getMyOnlineRole() === 'goalkeeper' && gkAction === num);
                  return (
                    <button
                      key={num}
                      onClick={() => makeChoice(num)}
                      className={`relative w-full h-full rounded border-2 transition-all flex items-center justify-center group cursor-pointer ${
                        isSubmitted 
                          ? 'border-amber-500 bg-amber-500/25' 
                          : 'border-white/10 hover:border-amber-500/40 hover:bg-white/5'
                      }`}
                    >
                      <span className="text-[10px] text-white/20 group-hover:text-amber-500/80 font-bold">
                        {num}
                      </span>
                      {isSubmitted && (
                        <div className="absolute inset-0 bg-amber-500/10 flex items-center justify-center animate-pulse">
                          <CheckCircle className="w-6 h-6 text-amber-500" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Live Interactive Results Neon Announcements */}
            {gameState === 'result' && (
              <div className="absolute inset-0 z-40 bg-black/75 flex flex-col items-center justify-center p-6 text-center">
                <motion.div 
                  initial={{ scale: 0.5, y: -20, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  className="space-y-4"
                >
                  <p className="text-[10px] uppercase tracking-widest text-white/50 font-black">Resultado da Batida</p>
                  
                  {lastShotResult === 'goal' && (
                    <div className="space-y-1">
                      <h3 className="text-4xl font-extrabold text-emerald-500 uppercase italic tracking-widest drop-shadow-lg">🎉 GOL!!! 🎉</h3>
                      <p className="text-xs text-white/80">Chute no canto {kickerAction} superou o goleiro!</p>
                    </div>
                  )}

                  {lastShotResult === 'save' && (
                    <div className="space-y-1">
                      <h3 className="text-4xl font-extrabold text-amber-500 uppercase italic tracking-widest drop-shadow-lg">🧤 DEFESA!!! 🧤</h3>
                      <p className="text-xs text-white/80">O Goleiro previu e pulou no canto {gkAction}!</p>
                    </div>
                  )}

                  {lastShotResult === 'post' && (
                    <div className="space-y-1">
                      <h3 className="text-4xl font-extrabold text-red-500 uppercase italic tracking-widest drop-shadow-lg">💥 NA TRAVE!!! 💥</h3>
                      <p className="text-xs text-white/80">Bola raspou no travessão no canto {kickerAction}!</p>
                    </div>
                  )}

                  {lastShotResult === 'out' && (
                    <div className="space-y-1">
                      <h3 className="text-4xl font-extrabold text-zinc-400 uppercase italic tracking-widest">❌ PARA FORA! ❌</h3>
                      <p className="text-xs text-white/80">O batedor tirou demais e isolou a cobrança!</p>
                    </div>
                  )}

                  <div className="bg-white/5 p-3 rounded-2xl border border-white/5 space-y-1 text-xs text-left max-w-xs mx-auto">
                    <p className="text-white/60">🎯 Direção do Chute: <span className="font-bold text-white">{getDirectionName(kickerAction || 0)}</span></p>
                    <p className="text-white/60">🧤 Direção da Defesa: <span className="font-bold text-white">{getDirectionName(gkAction || 0)}</span></p>
                  </div>

                  {!winner && (
                    <button 
                      onClick={continueNextRound}
                      className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-black uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer shadow-lg"
                    >
                      Continuar Cobranças
                    </button>
                  )}
                </motion.div>
              </div>
            )}
          </div>

          {/* Controls Panel & Instructions depending on current role */}
          {!winner && gameState === 'waiting_choices' && (
            <div className="bg-[#151515] border border-white/10 p-5 rounded-3xl space-y-4 text-center">
              {gameMode === 'local' && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-2xl text-xs text-amber-500 font-bold mb-2">
                  {localRoleTurn === 'kicker' 
                    ? '👉 JOGADOR 1 (Batedor): Escolha seu quadrante de chute!' 
                    : '🧤 JOGADOR 2 (Goleiro): Toque no quadrante de defesa em segredo!'
                  }
                </div>
              )}

              {gameMode === 'online' && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-2xl text-xs text-amber-500 font-bold mb-2">
                  {getMyOnlineRole() === 'kicker' 
                    ? '👉 VOCÊ É O BATEDOR! Selecione o quadrante no Gol para chutar.' 
                    : '🧤 VOCÊ É O GOLEIRO! Selecione o quadrante para pular na defesa.'
                  }
                </div>
              )}

              <p className="text-xs text-white/40 max-w-md mx-auto">
                Dica tática: Os cantos superiores 1 e 3 são ótimos, mas têm risco de trave. Chutar no centro é seguro se o goleiro pular para os lados!
              </p>
            </div>
          )}

          {/* Full Screen Winner Splash Screen */}
          {winner && (
            <div className="bg-amber-500/10 border-2 border-amber-500 p-8 rounded-3xl text-center space-y-5 shadow-2xl">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 mx-auto text-3xl font-black">
                🏆
              </div>
              <div className="space-y-1.5">
                <h3 className="text-2xl font-black uppercase tracking-wider text-white">Disputa Encerrada</h3>
                <p className="text-sm font-medium text-amber-500">
                  {winner === 'Você' ? 'Parabéns, você dominou a disputa e venceu! 🎉' : `Parabéns ao Campeão: ${winner}!`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto">
                <button 
                  onClick={() => {
                    if (gameMode === 'online') {
                      createOnlineRoom();
                    } else {
                      startNewOfflineGame(gameMode as any);
                    }
                  }}
                  className="py-3 bg-amber-500 hover:bg-amber-600 text-black font-extrabold uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer shadow-lg flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" /> Revanche
                </button>
                <button 
                  onClick={handleExit}
                  className="py-3 bg-white/5 hover:bg-white/10 text-white font-extrabold uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer"
                >
                  Sair do Jogo
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
