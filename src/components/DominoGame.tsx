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
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Sparkles,
  Award,
  BookOpen,
  ArrowRight,
  Tv,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  getDocs, 
  onSnapshot, 
  updateDoc, 
  query, 
  where,
  deleteDoc
} from 'firebase/firestore';

// Domino Tile Structure
export interface DominoTile {
  id: number;
  left: number;
  right: number;
  isPlayed: boolean;
  playedSide?: 'left' | 'right';
  isFlipped?: boolean;
}

// Procedural sound effects for laying wood domino tiles
class AudioManager {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  constructor() {}

  private init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
  }

  playTileClick(pitch: number = 1.0) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220 * pitch, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch (e) {}
  }

  playShuffle() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // Synthesize 3 consecutive short scratchy rustles
      for (let i = 0; i < 3; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100 + i * 50, now + i * 0.1);
        osc.frequency.exponentialRampToValueAtTime(40, now + i * 0.1 + 0.08);

        gain.gain.setValueAtTime(0.15, now + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.08);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + i * 0.1);
        osc.stop(now + i * 0.1 + 0.08);
      }
    } catch (e) {}
  }
}

const audio = new AudioManager();

export function DominoGame({ user }: { user: any }) {
  const [gameMode, setGameMode] = useState<'menu' | 'solo' | 'pvp' | 'ai' | 'lobby' | 'online'>('menu');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showRules, setShowRules] = useState(false);

  // Profile Identity (logged in user or auto-generated guest)
  const [localProfile, setLocalProfile] = useState<{ uid: string; name: string; photoURL?: string }>({
    uid: '',
    name: 'Cliente'
  });

  // Local Offline Game States
  const [playerHand, setPlayerHand] = useState<DominoTile[]>([]);
  const [opponentHand, setOpponentHand] = useState<DominoTile[]>([]);
  const [boneyard, setBoneyard] = useState<DominoTile[]>([]);
  const [board, setBoard] = useState<DominoTile[]>([]);
  const [turn, setTurn] = useState<'p1' | 'p2'>('p1');
  const [gameStatus, setGameStatus] = useState('');
  const [winner, setWinner] = useState<string | null>(null);

  // Online Multiplayer States
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [onlineRooms, setOnlineRooms] = useState<any[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomOpponent, setRoomOpponent] = useState<any>(null);
  const [roomCreator, setRoomCreator] = useState<any>(null);

  // Interaction States
  const [selectedTile, setSelectedTile] = useState<DominoTile | null>(null);
  const [aiThinking, setAiThinking] = useState(false);

  // Trackers to avoid double clacking sounds
  const lastBoardLengthRef = useRef(0);
  const lastBoneyardLengthRef = useRef(0);

  // Initialize profile
  useEffect(() => {
    if (user) {
      setLocalProfile({
        uid: user.uid,
        name: user.displayName || user.email?.split('@')[0] || 'Cliente',
        photoURL: user.photoURL || ''
      });
    } else {
      let guestId = localStorage.getItem('domino_guest_id');
      let guestName = localStorage.getItem('domino_guest_name');
      if (!guestId) {
        guestId = 'guest_' + Math.random().toString(36).substring(2, 9);
        guestName = 'Cliente #' + Math.floor(1000 + Math.random() * 9000);
        localStorage.setItem('domino_guest_id', guestId);
        localStorage.setItem('domino_guest_name', guestName);
      }
      setLocalProfile({
        uid: guestId,
        name: guestName || 'Cliente'
      });
    }
  }, [user]);

  // Audio Sync
  useEffect(() => {
    audio.enabled = soundEnabled;
  }, [soundEnabled]);

  // Load public lobby rooms
  const loadOnlineLobbies = async () => {
    setLoadingRooms(true);
    try {
      const q = query(collection(db, 'domino_rooms'), where('status', '==', 'waiting'));
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
      loadOnlineLobbies();
      // Also establish a live list subscription
      const q = query(collection(db, 'domino_rooms'), where('status', '==', 'waiting'));
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

  // Generate complete set of 28 Double-Six Dominoes
  const generateSet = (): DominoTile[] => {
    const list: DominoTile[] = [];
    let id = 1;
    for (let i = 0; i <= 6; i++) {
      for (let j = i; j <= 6; j++) {
        list.push({
          id: id++,
          left: i,
          right: j,
          isPlayed: false
        });
      }
    }
    return list;
  };

  // Create real-time online room in Firestore
  const createOnlineRoom = async () => {
    audio.playShuffle();
    const fullDeck = generateSet();
    const shuffled = [...fullDeck].sort(() => Math.random() - 0.5);
    
    // Deal 7 pieces to P1, 7 to P2
    const p1 = shuffled.slice(0, 7);
    const p2 = shuffled.slice(7, 14);
    const remaining = shuffled.slice(14);

    try {
      const roomPayload = {
        status: 'waiting',
        creator: {
          uid: localProfile.uid,
          name: localProfile.name,
          photoURL: localProfile.photoURL || ''
        },
        opponent: null,
        turn: 'p1',
        board: [],
        boneyard: remaining,
        p1Hand: p1,
        p2Hand: p2,
        winner: null,
        gameStatus: 'Sala criada! Aguardando outro cliente da barbearia entrar...',
        updatedAt: Date.now()
      };

      const docRef = await addDoc(collection(db, 'domino_rooms'), roomPayload);
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
    audio.playShuffle();
    try {
      const roomRef = doc(db, 'domino_rooms', targetRoomId);
      const opponentData = {
        uid: localProfile.uid,
        name: localProfile.name,
        photoURL: localProfile.photoURL || ''
      };

      await updateDoc(roomRef, {
        status: 'playing',
        opponent: opponentData,
        gameStatus: `Duelo iniciado! ${localProfile.name} entrou na mesa de Dominó.`,
        updatedAt: Date.now()
      });

      setRoomId(targetRoomId);
      setIsCreator(false);
      setGameMode('online');
    } catch (e) {
      console.error(e);
    }
  };

  // Real-time synchronization listener
  useEffect(() => {
    if (gameMode !== 'online' || !roomId) return;

    lastBoardLengthRef.current = 0;
    lastBoneyardLengthRef.current = 0;

    const unsub = onSnapshot(doc(db, 'domino_rooms', roomId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        
        setBoard(data.board || []);
        setBoneyard(data.boneyard || []);
        setTurn(data.turn || 'p1');
        setWinner(data.winner || null);
        setGameStatus(data.gameStatus || '');
        setRoomCreator(data.creator);
        setRoomOpponent(data.opponent);

        // Map private hands depending on which client side we are
        if (isCreator) {
          setPlayerHand(data.p1Hand || []);
          setOpponentHand(data.p2Hand || []);
        } else {
          setPlayerHand(data.p2Hand || []);
          setOpponentHand(data.p1Hand || []);
        }

        // Sound effects trigger dynamically on updates
        if (data.board && data.board.length > lastBoardLengthRef.current) {
          audio.playTileClick(1.0);
        }
        lastBoardLengthRef.current = data.board ? data.board.length : 0;

        if (data.boneyard && data.boneyard.length < lastBoneyardLengthRef.current) {
          audio.playTileClick(0.85);
        }
        lastBoneyardLengthRef.current = data.boneyard ? data.boneyard.length : 0;
      }
    });

    return () => unsub();
  }, [roomId, isCreator, gameMode]);

  // Offline Game Startup
  const startNewGame = (mode: 'solo' | 'pvp' | 'ai') => {
    setGameMode(mode);
    audio.playShuffle();
    
    const fullDeck = generateSet();
    const shuffled = [...fullDeck].sort(() => Math.random() - 0.5);
    
    const p1 = shuffled.slice(0, 7);
    const p2 = shuffled.slice(7, 14);
    const remaining = shuffled.slice(14);

    setPlayerHand(p1);
    setOpponentHand(p2);
    setBoneyard(remaining);
    setBoard([]);
    setTurn('p1');
    setWinner(null);
    setSelectedTile(null);

    if (mode === 'solo') {
      setGameStatus('Modo de Treino ativo! Jogue as peças combinando as pontas abertas.');
    } else {
      setGameStatus('Jogo iniciado! O Jogador 1 começa colocando qualquer peça.');
    }
  };

  // Core board logic rules
  const getBoardEnds = (): { left: number; right: number } | null => {
    if (board.length === 0) return null;
    
    const first = board[0];
    const last = board[board.length - 1];

    const leftEnd = first.isFlipped ? first.right : first.left;
    const rightEnd = last.isFlipped ? last.left : last.right;

    return { left: leftEnd, right: rightEnd };
  };

  const canPlayTile = (tile: DominoTile): { canLeft: boolean; canRight: boolean } => {
    if (board.length === 0) {
      return { canLeft: true, canRight: true };
    }

    const ends = getBoardEnds();
    if (!ends) return { canLeft: false, canRight: false };

    const matchLeft = tile.left === ends.left || tile.right === ends.left;
    const matchRight = tile.left === ends.right || tile.right === ends.right;

    return {
      canLeft: matchLeft,
      canRight: matchRight
    };
  };

  // Perform Domino play action
  const playTile = async (tile: DominoTile, side: 'left' | 'right') => {
    if (winner || aiThinking) return;

    // Check if it is current online turn
    if (gameMode === 'online') {
      const activeRole = turn === 'p1' ? 'creator' : 'opponent';
      const myRole = isCreator ? 'creator' : 'opponent';
      if (activeRole !== myRole) return;
    } else if (gameMode === 'ai' && turn === 'p2') {
      return;
    }

    // Solve new board
    let updatedBoard = [...board];
    let newTile = { ...tile, isPlayed: true, playedSide: side };

    if (board.length === 0) {
      newTile.isFlipped = false;
      updatedBoard = [newTile];
    } else {
      const ends = getBoardEnds();
      if (!ends) return;
      const targetNum = side === 'left' ? ends.left : ends.right;

      if (side === 'left') {
        if (tile.right === targetNum) {
          newTile.isFlipped = false;
        } else if (tile.left === targetNum) {
          newTile.isFlipped = true;
        } else {
          return;
        }
        updatedBoard = [newTile, ...updatedBoard];
      } else {
        if (tile.left === targetNum) {
          newTile.isFlipped = false;
        } else if (tile.right === targetNum) {
          newTile.isFlipped = true;
        } else {
          return;
        }
        updatedBoard = [...updatedBoard, newTile];
      }
    }

    const newHand = playerHand.filter(t => t.id !== tile.id);

    if (gameMode === 'online' && roomId) {
      // Fire update to Firestore database
      const myHandKey = isCreator ? 'p1Hand' : 'p2Hand';
      const nextTurn = turn === 'p1' ? 'p2' : 'p1';

      let winCheck = false;
      let winnerName: string | null = null;
      let statusString = `${localProfile.name} jogou a peça [${tile.left}|${tile.right}].`;

      if (newHand.length === 0) {
        winCheck = true;
        winnerName = localProfile.name;
        statusString = `Vitória! ${localProfile.name} jogou a última peça e bateu o dominó!`;
      }

      await updateDoc(doc(db, 'domino_rooms', roomId), {
        board: updatedBoard,
        [myHandKey]: newHand,
        turn: nextTurn,
        gameStatus: statusString,
        winner: winnerName,
        status: winCheck ? 'finished' : 'playing',
        updatedAt: Date.now()
      });

      setSelectedTile(null);
    } else {
      // Offline Game logic flow
      audio.playTileClick(1.1);
      setBoard(updatedBoard);
      
      if (turn === 'p1') {
        setPlayerHand(newHand);
      } else {
        setOpponentHand(newHand);
      }

      setSelectedTile(null);

      // Simple turn change logic for PvPs
      if (gameMode === 'pvp') {
        const nextTurn = turn === 'p1' ? 'p2' : 'p1';
        setTurn(nextTurn);
        setGameStatus(`Vez do Jogador ${nextTurn === 'p1' ? '1' : '2'}.`);
      } else if (gameMode === 'solo') {
        setGameStatus('Bela jogada! Continue combinando os lados.');
      } else if (gameMode === 'ai') {
        setTurn('p2');
        setGameStatus('Robô pensando...');
      }
    }
  };

  // Draw from boneyard deck
  const drawFromBoneyard = async () => {
    if (winner || boneyard.length === 0 || aiThinking) return;

    if (gameMode === 'online') {
      const activeRole = turn === 'p1' ? 'creator' : 'opponent';
      const myRole = isCreator ? 'creator' : 'opponent';
      if (activeRole !== myRole) return;

      if (roomId) {
        const nextTile = boneyard[0];
        const newBoneyard = boneyard.slice(1);
        const myHandKey = isCreator ? 'p1Hand' : 'p2Hand';
        const newHand = [...playerHand, nextTile];

        await updateDoc(doc(db, 'domino_rooms', roomId), {
          boneyard: newBoneyard,
          [myHandKey]: newHand,
          gameStatus: `${localProfile.name} comprou do dorminhoco.`,
          updatedAt: Date.now()
        });
      }
    } else {
      const nextTile = boneyard[0];
      setBoneyard(prev => prev.slice(1));
      audio.playTileClick(0.85);

      if (turn === 'p1') {
        setPlayerHand(prev => [...prev, nextTile]);
        setGameStatus('Você comprou uma peça do dorminhoco.');
      } else {
        setOpponentHand(prev => [...prev, nextTile]);
        setGameStatus('Jogador 2 comprou do dorminhoco.');
      }
    }
  };

  // Manual turn passing
  const passTurn = async () => {
    if (winner || aiThinking) return;

    if (gameMode === 'online' && roomId) {
      const activeRole = turn === 'p1' ? 'creator' : 'opponent';
      const myRole = isCreator ? 'creator' : 'opponent';
      if (activeRole !== myRole) return;

      const nextTurn = turn === 'p1' ? 'p2' : 'p1';
      await updateDoc(doc(db, 'domino_rooms', roomId), {
        turn: nextTurn,
        gameStatus: `${localProfile.name} não tinha jogadas e passou a vez.`,
        updatedAt: Date.now()
      });
    } else {
      const nextPlayer = turn === 'p1' ? 'p2' : 'p1';
      setTurn(nextPlayer);
      setGameStatus(`Turno passado. Agora é a vez de ${nextPlayer === 'p1' ? 'Jogador 1' : gameMode === 'ai' ? 'Computador' : 'Jogador 2'}`);
    }
  };

  // Exit Room
  const exitToMenu = () => {
    setGameMode('menu');
    setRoomId(null);
  };

  // Offline Game Monitor (PVP and Solo win evaluation)
  useEffect(() => {
    if (gameMode === 'menu' || gameMode === 'lobby' || gameMode === 'online') return;

    if (playerHand.length === 0 && board.length > 0) {
      setWinner('Jogador 1');
      setGameStatus('Parabéns! O Jogador 1 bateu e venceu!');
      return;
    }
    if (opponentHand.length === 0 && board.length > 0) {
      setWinner(gameMode === 'ai' ? 'Computador' : 'Jogador 2');
      setGameStatus(gameMode === 'ai' ? 'O Computador bateu!' : 'O Jogador 2 bateu e venceu!');
      return;
    }

    // Block locked scenario with empty deck
    if (board.length > 0 && boneyard.length === 0) {
      const p1HasMove = playerHand.some(t => {
        const { canLeft, canRight } = canPlayTile(t);
        return canLeft || canRight;
      });
      const p2HasMove = opponentHand.some(t => {
        const { canLeft, canRight } = canPlayTile(t);
        return canLeft || canRight;
      });

      if (!p1HasMove && !p2HasMove) {
        const p1Sum = playerHand.reduce((acc, t) => acc + t.left + t.right, 0);
        const p2Sum = opponentHand.reduce((acc, t) => acc + t.left + t.right, 0);

        if (p1Sum < p2Sum) {
          setWinner('Jogador 1');
          setGameStatus(`Jogo Fechado! Vitória do Jogador 1 por contagem (${p1Sum} vs ${p2Sum}).`);
        } else if (p2Sum < p1Sum) {
          setWinner(gameMode === 'ai' ? 'Computador' : 'Jogador 2');
          setGameStatus(`Jogo Fechado! Vitória por contagem (${p2Sum} vs ${p1Sum}).`);
        } else {
          setWinner('Empate');
          setGameStatus(`Jogo Fechado! Empate perfeito com ${p1Sum} pontos.`);
        }
      }
    }
  }, [playerHand.length, opponentHand.length, board.length, boneyard.length, gameMode]);

  // AI Logic Execution Loop
  useEffect(() => {
    if (gameMode !== 'ai' || turn !== 'p2' || winner || aiThinking) return;

    setAiThinking(true);
    setGameStatus('Computador calculando jogada...');

    const timer = setTimeout(() => {
      const playable = opponentHand.map(tile => {
        const { canLeft, canRight } = canPlayTile(tile);
        return { tile, canLeft, canRight };
      }).filter(item => item.canLeft || item.canRight);

      if (playable.length > 0) {
        playable.sort((a, b) => (b.tile.left + b.tile.right) - (a.tile.left + a.tile.right));
        const chosen = playable[0];
        const side = chosen.canRight ? 'right' : 'left';
        
        playTile(chosen.tile, side);
        setTurn('p1');
      } else {
        if (boneyard.length > 0) {
          const nextTile = boneyard[0];
          setBoneyard(prev => prev.slice(1));
          setOpponentHand(prev => [...prev, nextTile]);
          setGameStatus('O Computador comprou do dorminhoco.');
          audio.playTileClick(0.8);
        } else {
          setTurn('p1');
          setGameStatus('O Computador passou a vez.');
        }
      }
      setAiThinking(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, [turn, gameMode, winner, opponentHand.length, boneyard.length]);

  // Render Dots inside Domino halves
  const renderHalfDots = (val: number) => {
    const dotPositions: Record<number, string[]> = {
      0: [],
      1: ['col-start-2 row-start-2'],
      2: ['col-start-1 row-start-1', 'col-start-3 row-start-3'],
      3: ['col-start-1 row-start-1', 'col-start-2 row-start-2', 'col-start-3 row-start-3'],
      4: ['col-start-1 row-start-1', 'col-start-3 row-start-1', 'col-start-1 row-start-3', 'col-start-3 row-start-3'],
      5: ['col-start-1 row-start-1', 'col-start-3 row-start-1', 'col-start-2 row-start-2', 'col-start-1 row-start-3', 'col-start-3 row-start-3'],
      6: ['col-start-1 row-start-1', 'col-start-1 row-start-2', 'col-start-1 row-start-3', 'col-start-3 row-start-1', 'col-start-3 row-start-2', 'col-start-3 row-start-3'],
    };

    const positions = dotPositions[val] || [];

    return (
      <div className="grid grid-cols-3 grid-rows-3 w-8 h-8 p-1 gap-0.5 justify-items-center items-center">
        {positions.map((pos, idx) => (
          <div 
            key={idx} 
            className={`w-1.5 h-1.5 rounded-full bg-zinc-900 ${pos}`} 
          />
        ))}
      </div>
    );
  };

  const handleTileSelect = (tile: DominoTile) => {
    if (winner || aiThinking) return;

    if (gameMode === 'online') {
      const activeRole = turn === 'p1' ? 'creator' : 'opponent';
      const myRole = isCreator ? 'creator' : 'opponent';
      if (activeRole !== myRole) return;
    } else if (turn !== 'p1') {
      return;
    }

    setSelectedTile(selectedTile?.id === tile.id ? null : tile);
  };

  const scoreSumOfHand = (hand: DominoTile[]) => {
    return hand.reduce((acc, t) => acc + t.left + t.right, 0);
  };

  // Determine if it is my turn in online mode
  const isMyOnlineTurn = () => {
    if (gameMode !== 'online') return turn === 'p1';
    const activeRole = turn === 'p1' ? 'creator' : 'opponent';
    const myRole = isCreator ? 'creator' : 'opponent';
    return activeRole === myRole;
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6" id="domino_game_panel">
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
                <h3 className="text-lg font-black uppercase tracking-wider">Regras do Dominó</h3>
              </div>
              
              <div className="text-sm text-white/70 space-y-3 max-h-[350px] overflow-y-auto pr-2">
                <p>
                  <strong>1. Início de Jogo:</strong> Cada jogador começa com 7 peças no seu tabuleiro. As peças restantes ficam ocultas no dorminhoco (boneyard).
                </p>
                <p>
                  <strong>2. Combinação:</strong> Para fazer uma jogada válida, você deve colocar uma peça com o valor correspondente a uma das duas pontas abertas da mesa (esquerda ou direita).
                </p>
                <p>
                  <strong>3. Compra (Dorminhoco):</strong> Se for a sua vez e você não tiver nenhuma peça que encaixe, deverá comprar peças do dorminhoco até vir uma jogável.
                </p>
                <p>
                  <strong>4. Passar Turno:</strong> Se o dorminhoco estiver vazio e você continuar sem jogadas, deve clicar no botão "Passar Turno" para dar a vez.
                </p>
                <p>
                  <strong>5. Vitória:</strong> O primeiro a jogar todas as suas peças vence ("bate"). Se o jogo travar (fechar sem jogadas possíveis), quem tiver a menor soma de pontos nas peças da mão vence!
                </p>
              </div>

              <button 
                onClick={() => setShowRules(false)}
                className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-black font-bold uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer"
              >
                Vamos Jogar!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-center justify-between bg-white/5 border border-white/10 p-5 rounded-3xl gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 font-bold text-xl shrink-0">
            🀰
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black tracking-tight text-white uppercase italic flex flex-wrap items-center justify-center sm:justify-start gap-2">
              Clube do Dominó <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500 not-italic font-semibold">Ao Vivo Multijogador</span>
            </h2>
            <p className="text-xs text-white/40">Divirta-se jogando dominó em tempo real com outros clientes que aguardam atendimento!</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowRules(true)}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all cursor-pointer"
            title="Ver Regras Oficiais"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all cursor-pointer"
            title={soundEnabled ? 'Mudo' : 'Ativar Sons de Madeira'}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5 text-amber-500" /> : <VolumeX className="w-5 h-5 text-white/40" />}
          </button>

          {gameMode !== 'menu' && (
            <button 
              onClick={exitToMenu}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              Voltar ao Menu
            </button>
          )}
        </div>
      </div>

      {gameMode === 'menu' ? (
        /* GAME MODES SELECTION MENU */
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-4"
        >
          {/* Mode 1: Real-time Online (Multiplayer) */}
          <div className="bg-[#151515] border-2 border-amber-500/30 rounded-3xl p-5 flex flex-col justify-between hover:border-amber-500 transition-all hover:scale-[1.02] duration-300 shadow-xl group text-left relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-amber-500 text-black px-3 py-1 font-black text-[9px] uppercase tracking-widest rounded-bl-xl">
              Recomendado
            </div>
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-500 shrink-0">
                <Tv className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black uppercase text-white tracking-wider group-hover:text-amber-500 transition-colors">Jogar Ao Vivo</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Duelo em tempo real! Crie uma mesa ou entre no jogo de outros clientes da barbearia que estão esperando.
              </p>
            </div>
            <button 
              onClick={() => setGameMode('lobby')}
              className="mt-6 w-full py-3 bg-amber-500 text-black font-bold uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              Buscar Mesas <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Mode 2: Solo training */}
          <div className="bg-[#151515] border border-white/10 rounded-3xl p-5 flex flex-col justify-between hover:border-amber-500/30 transition-all hover:scale-[1.02] duration-300 shadow-xl group text-left">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <User className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black uppercase text-white tracking-wider group-hover:text-amber-500 transition-colors">Treino Solo</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Jogue as peças livremente na mesa para praticar as melhores combinações e entender as pontas abertas.
              </p>
            </div>
            <button 
              onClick={() => startNewGame('solo')}
              className="mt-6 w-full py-3 bg-white/5 group-hover:bg-amber-500 group-hover:text-black text-white font-bold uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              Iniciar Treino <Play className="w-4 h-4" />
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
                Duelo no mesmo aparelho! Jogue contra seu amigo passando o celular/tablet após cada jogada de peça.
              </p>
            </div>
            <button 
              onClick={() => startNewGame('pvp')}
              className="mt-6 w-full py-3 bg-white/5 group-hover:bg-amber-500 group-hover:text-black text-white font-bold uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              Jogar Local <Play className="w-4 h-4" />
            </button>
          </div>

          {/* Mode 4: VS AI Robot */}
          <div className="bg-[#151515] border border-white/10 rounded-3xl p-5 flex flex-col justify-between hover:border-amber-500/30 transition-all hover:scale-[1.02] duration-300 shadow-xl group text-left">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black uppercase text-white tracking-wider group-hover:text-amber-500 transition-colors">Contra Robô</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Sem ninguém para jogar? Desafie nosso robô em uma partida estratégica e dinâmica de dominó.
              </p>
            </div>
            <button 
              onClick={() => startNewGame('ai')}
              className="mt-6 w-full py-3 bg-white/5 group-hover:bg-amber-500 group-hover:text-black text-white font-bold uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              Jogar com Robô <Play className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      ) : gameMode === 'lobby' ? (
        /* ONLINE LOBBY ROOMS SELECTOR */
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Identity Info bar */}
          <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-3xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500 font-black">
                {localProfile.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <p className="text-[10px] text-amber-500/70 font-bold uppercase tracking-widest">Seu Perfil de Jogador</p>
                <p className="text-sm font-black text-white">{localProfile.name}</p>
              </div>
            </div>
            <button 
              onClick={createOnlineRoom}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-black uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer shadow-lg flex items-center gap-2"
            >
              Criar Nova Mesa <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* List of active rooms */}
          <div className="bg-[#151515] border border-white/10 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-white/60">Mesas de Dominó Ativas</h3>
              <button 
                onClick={loadOnlineLobbies}
                className="text-[10px] font-bold text-amber-500 hover:underline uppercase tracking-wider"
              >
                Atualizar Lista
              </button>
            </div>

            {loadingRooms ? (
              <p className="text-white/40 text-xs py-8">Carregando mesas disponíveis...</p>
            ) : onlineRooms.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <p className="text-white/40 text-sm italic">Nenhuma mesa aberta no momento.</p>
                <p className="text-xs text-white/30 max-w-sm mx-auto">Seja o primeiro a abrir uma mesa de dominó! Os outros clientes verão sua sala e poderão entrar ao vivo.</p>
                <button 
                  onClick={createOnlineRoom}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                >
                  Criar Mesa Agora
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
                        🀰
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-black text-white">{room.creator.name}</p>
                        <p className="text-[10px] text-white/40">Esperando oponente...</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => joinOnlineRoom(room.id)}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-black uppercase tracking-widest text-[10px] rounded-lg transition-all cursor-pointer"
                    >
                      Entrar na Mesa
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      ) : (
        /* ACTIVE DOMINOES BOARD GAMEPLAY */
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Game HUD Status */}
          <div className="bg-[#151515] border border-white/10 p-4 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-left">
              <div className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider ${
                isMyOnlineTurn() 
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 animate-pulse' 
                  : 'bg-amber-500/10 border border-amber-500/20 text-amber-500'
              }`}>
                {isMyOnlineTurn() ? 'Seu Turno de Jogar' : 'Aguardando Jogada'}
              </div>
              <p className="text-xs text-white/70 font-medium">{gameStatus}</p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[11px] text-white/40 uppercase tracking-widest font-bold">Dorminhoco:</span>
              <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
                <div className="w-2.5 h-4 bg-amber-500/20 border border-amber-500/40 rounded-sm" />
                <span className="text-xs font-black text-white">{boneyard.length} peças</span>
              </div>
            </div>
          </div>

          {/* ACTIVE PLAYERS OVERVIEW IN ROOM (If Online) */}
          {gameMode === 'online' && (
            <div className="grid grid-cols-2 gap-4">
              {/* Creator Profile */}
              <div className={`bg-white/5 border p-3 rounded-2xl flex items-center gap-3 ${
                turn === 'p1' ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/5'
              }`}>
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 font-bold">
                  {roomCreator?.name ? roomCreator.name.charAt(0).toUpperCase() : 'C'}
                </div>
                <div className="text-left">
                  <p className="text-[9px] text-white/30 uppercase tracking-widest font-black">Jogador 1 (Criador)</p>
                  <p className="text-xs font-extrabold text-white">{roomCreator?.name || 'Carregando...'}</p>
                </div>
              </div>

              {/* Opponent Profile */}
              <div className={`bg-white/5 border p-3 rounded-2xl flex items-center gap-3 ${
                turn === 'p2' ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/5'
              }`}>
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 font-bold">
                  {roomOpponent?.name ? roomOpponent.name.charAt(0).toUpperCase() : 'O'}
                </div>
                <div className="text-left">
                  <p className="text-[9px] text-white/30 uppercase tracking-widest font-black">Jogador 2 (Oponente)</p>
                  <p className="text-xs font-extrabold text-white">
                    {roomOpponent ? roomOpponent.name : 'Aguardando jogador entrar...'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* OPPONENT'S HAND HIDDEN OVERVIEW (Sleek face down domino indicators) */}
          {opponentHand.length > 0 && (
            <div className="space-y-1 bg-white/5 border border-white/5 p-4 rounded-3xl">
              <p className="text-[9px] text-white/30 uppercase tracking-widest font-black text-left">Mão do Oponente ({opponentHand.length} peças)</p>
              <div className="flex items-center gap-2 overflow-x-auto py-1">
                {opponentHand.map((_, idx) => (
                  <div 
                    key={idx}
                    className="w-8 h-12 bg-[#121212] border-2 border-amber-500/20 rounded-lg shadow-inner flex items-center justify-center relative overflow-hidden shrink-0"
                  >
                    {/* Atmospheric luxury cross details for domino backs */}
                    <div className="absolute inset-2 border border-amber-500/5 rounded" />
                    <span className="text-[10px] text-amber-500/20 font-black">🀰</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MAIN DOMINO PLAY BOARD CANVAS TABLE */}
          <div className="bg-[#0c0d0f] border border-white/5 rounded-3xl p-4 sm:p-8 min-h-[240px] sm:min-h-[300px] flex flex-col items-center justify-center relative shadow-inner overflow-hidden">
            {board.length === 0 ? (
              <div className="text-center space-y-2 py-12">
                <p className="text-white/40 text-sm italic">Nenhuma peça jogada na mesa ainda.</p>
                {isMyOnlineTurn() && (
                  <p className="text-xs text-amber-500/80 font-bold">Selecione uma de suas peças abaixo para iniciar o jogo!</p>
                )}
              </div>
            ) : (
              <>
                /* THE BOARD ROW OF PLAYED DOMINOES */
                <div className="w-full flex items-center gap-1.5 py-4 px-2 sm:px-12 overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 touch-pan-x">
                  <div className="flex items-center gap-1.5 mx-auto">
                    {board.map((tile, idx) => {
                      const isDouble = tile.left === tile.right;
                      const displayLeft = tile.isFlipped ? tile.right : tile.left;
                      const displayRight = tile.isFlipped ? tile.left : tile.right;

                      return (
                        <motion.div 
                          key={tile.id}
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className={`flex shrink-0 ${
                            isDouble 
                              ? 'flex-col rotate-0' 
                              : 'flex-row'
                          } bg-amber-50 border-2 border-zinc-900 rounded-lg p-0.5 shadow-md items-center`}
                        >
                          {/* Left Side */}
                          <div className="bg-amber-50/10">
                            {renderHalfDots(displayLeft)}
                          </div>

                          {/* Split Divider */}
                          <div className={`${isDouble ? 'w-8 h-[2px]' : 'w-[2px] h-8'} bg-zinc-900`} />

                          {/* Right Side */}
                          <div className="bg-amber-50/10">
                            {renderHalfDots(displayRight)}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                {board.length > 3 && (
                  <div className="text-[10px] text-white/30 tracking-wider uppercase font-semibold mt-2 animate-pulse sm:hidden">
                    ↔ Arraste para o lado para ver a mesa ↔
                  </div>
                )}
              </>
            )}

            {/* Match Ends Neon Indicators */}
            {board.length > 0 && (
              <div className="absolute inset-x-0 bottom-3 flex justify-between px-6">
                <div className="text-[10px] text-white/30 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Ponta Esquerda: <strong className="text-amber-500">{getBoardEnds()?.left}</strong>
                </div>
                <div className="text-[10px] text-white/30 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                  Ponta Direita: <strong className="text-amber-500">{getBoardEnds()?.right}</strong>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                </div>
              </div>
            )}

            {/* Winner Overlay Banner */}
            <AnimatePresence>
              {winner && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute inset-0 bg-black/95 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center space-y-4 z-10 p-6"
                >
                  <Award className="w-14 h-14 text-amber-500 animate-bounce" />
                  <h3 className="text-2xl font-black uppercase tracking-widest text-white italic text-center">
                    {winner === 'Jogador 1' || winner === localProfile.name ? 'Você Ganhou!' : `${winner} Venceu!`}
                  </h3>
                  <p className="text-xs text-white/50 text-center max-w-sm">
                    Excelente jogo! Os clientes na barbearia estão vibrando com a sua rodada de dominó!
                  </p>
                  <button 
                    onClick={() => {
                      if (gameMode === 'online') {
                        setGameMode('lobby');
                        setRoomId(null);
                      } else {
                        startNewGame(gameMode);
                      }
                    }}
                    className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-black font-black uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer shadow-lg flex items-center gap-2"
                  >
                    Jogar Outra Partida <RotateCcw className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ACTIVE CONTROLS & BOARD INTERACTION ACTIONS */}
          <div className="bg-[#151515] border border-white/10 p-5 rounded-3xl space-y-4">
            
            {/* Action Buttons for play ends */}
            {selectedTile && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4"
              >
                <div className="text-left">
                  <p className="text-xs text-amber-400 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" /> Peça selecionada: [{selectedTile.left} | {selectedTile.right}]
                  </p>
                  <p className="text-[11px] text-white/50">Escolha em qual ponta aberta do dominó você deseja colocar esta peça:</p>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                  <button 
                    disabled={!canPlayTile(selectedTile).canLeft}
                    onClick={() => playTile(selectedTile, 'left')}
                    className="flex-1 md:flex-none px-5 py-2.5 bg-amber-500 disabled:bg-white/5 hover:bg-amber-600 disabled:text-white/20 text-black font-black uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer flex items-center gap-2 justify-center"
                  >
                    <ChevronLeft className="w-4 h-4" /> Ponta Esquerda ({getBoardEnds()?.left ?? '*'})
                  </button>
                  <button 
                    disabled={!canPlayTile(selectedTile).canRight}
                    onClick={() => playTile(selectedTile, 'right')}
                    className="flex-1 md:flex-none px-5 py-2.5 bg-amber-500 disabled:bg-white/5 hover:bg-amber-600 disabled:text-white/20 text-black font-black uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer flex items-center gap-2 justify-center"
                  >
                    Ponta Direita ({getBoardEnds()?.right ?? '*'}) <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Boneyard and Pass Turn panel */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-4">
              <div className="text-left">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Seu Tabuleiro de Peças</p>
                <p className="text-xs text-white/60">Selecione uma peça com valores correspondentes para poder jogar na mesa.</p>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={drawFromBoneyard}
                  disabled={boneyard.length === 0 || winner || aiThinking || !isMyOnlineTurn()}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 border border-white/10 rounded-xl text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2"
                >
                  <Plus className="w-4 h-4 text-amber-500" /> Comprar do Dorminhoco
                </button>
                <button 
                  onClick={passTurn}
                  disabled={winner || aiThinking || !isMyOnlineTurn()}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 border border-white/10 rounded-xl text-white/60 hover:text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  Passar Turno
                </button>
              </div>
            </div>

            {/* HUMAN HAND TILES CAROUSEL ROW */}
            <div className="flex items-center gap-3 py-3 overflow-x-auto justify-start max-w-full touch-pan-x scrollbar-thin scrollbar-thumb-white/10">
              {playerHand.map(tile => {
                const isPlayable = canPlayTile(tile).canLeft || canPlayTile(tile).canRight;
                const isSelected = selectedTile?.id === tile.id;

                return (
                  <motion.button 
                    key={tile.id}
                    whileHover={{ y: -5 }}
                    onClick={() => handleTileSelect(tile)}
                    disabled={!isMyOnlineTurn() || winner || aiThinking}
                    className={`flex flex-row shrink-0 bg-amber-50 hover:bg-amber-100 disabled:opacity-65 border-2 ${
                      isSelected 
                        ? 'border-amber-500 shadow-amber-500/20 scale-105 shadow-lg' 
                        : isPlayable && isMyOnlineTurn()
                        ? 'border-emerald-500 shadow-md shadow-emerald-500/5' 
                        : 'border-zinc-900 shadow'
                    } rounded-xl p-1 items-center transition-all cursor-pointer`}
                  >
                    {/* Left side dots */}
                    <div className="bg-amber-50/10">
                      {renderHalfDots(tile.left)}
                    </div>

                    {/* Divider line */}
                    <div className="w-[2.5px] h-9 bg-zinc-900 mx-0.5" />

                    {/* Right side dots */}
                    <div className="bg-amber-50/10">
                      {renderHalfDots(tile.right)}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Hand Score indicator */}
            <div className="flex justify-between text-[11px] text-white/30 uppercase tracking-widest font-black pt-2">
              <span>Soma de Pontos na Mão: <strong className="text-white">{scoreSumOfHand(playerHand)}</strong></span>
              <span>Total de peças restantes: <strong className="text-white">{playerHand.length}</strong></span>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
