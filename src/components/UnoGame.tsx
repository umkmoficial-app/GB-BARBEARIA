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
  CheckCircle, 
  XCircle,
  Sparkles,
  Layers,
  ArrowLeftRight,
  ShieldAlert
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

// Procedural audio synthesizer for immersive waiting-room UNO card battles
class UnoAudio {
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

  playCard() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.12);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch (e) {}
  }

  playDraw() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.linearRampToValueAtTime(320, now + 0.18);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {}
  }

  playSpecial() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(400, now);
      osc1.frequency.linearRampToValueAtTime(800, now + 0.22);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(405, now);
      osc2.frequency.linearRampToValueAtTime(805, now + 0.22);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.22);
      osc2.stop(now + 0.22);
    } catch (e) {}
  }

  playUnoAlert() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(550, now);
      osc.frequency.setValueAtTime(750, now + 0.08);
      osc.frequency.setValueAtTime(950, now + 0.16);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.32);
    } catch (e) {}
  }

  playWin() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);
        gain.gain.setValueAtTime(0.12, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.3);
      });
    } catch (e) {}
  }
}

const audio = new UnoAudio();

interface UnoCard {
  id: string;
  color: 'red' | 'blue' | 'green' | 'yellow' | 'wild';
  value: string; // '0'-'9', 'skip', 'reverse', 'draw2', 'wild', 'wild4'
}

interface UnoRoomData {
  status: 'waiting' | 'playing' | 'finished';
  creator: { uid: string; name: string };
  opponent: { uid: string; name: string } | null;
  currentTurn: string; // uid of current player
  deck: UnoCard[];
  discardPile: UnoCard[];
  p1Hand: UnoCard[];
  p2Hand: UnoCard[];
  p1Uno: boolean;
  p2Uno: boolean;
  activeColor: 'red' | 'blue' | 'green' | 'yellow';
  winner: string | null;
  gameStatus: string;
  updatedAt: number;
}

// Compact, well-balanced deck logic for 1v1 play: ensures small database payloads and rapid matches.
const generateUnoDeck = (): UnoCard[] => {
  const colors: Array<'red' | 'blue' | 'green' | 'yellow'> = ['red', 'blue', 'green', 'yellow'];
  const deck: UnoCard[] = [];
  let cardId = 1;

  colors.forEach(color => {
    // 0 to 9 number cards
    for (let i = 0; i <= 9; i++) {
      deck.push({ id: `card_${cardId++}`, color, value: i.toString() });
    }
    // Action cards
    deck.push({ id: `card_${cardId++}`, color, value: 'skip' });
    deck.push({ id: `card_${cardId++}`, color, value: 'reverse' });
    deck.push({ id: `card_${cardId++}`, color, value: 'draw2' });
  });

  // Wild Cards
  for (let i = 0; i < 3; i++) {
    deck.push({ id: `card_${cardId++}`, color: 'wild', value: 'wild' });
    deck.push({ id: `card_${cardId++}`, color: 'wild', value: 'wild4' });
  }

  // Shuffle Deck
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
};

export function UnoGame({ user }: { user: any }) {
  const [gameMode, setGameMode] = useState<'menu' | 'ai' | 'local' | 'lobby' | 'online'>('menu');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showRules, setShowRules] = useState(false);

  // Profile Identity config
  const [localProfile, setLocalProfile] = useState({ uid: '', name: 'Cliente' });

  // Online Room parameters
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [onlineRooms, setOnlineRooms] = useState<any[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // Active game core states
  const [p1Hand, setP1Hand] = useState<UnoCard[]>([]); // P1 is Creator/Local P1
  const [p2Hand, setP2Hand] = useState<UnoCard[]>([]); // P2 is Opponent/AI/Local P2
  const [deck, setDeck] = useState<UnoCard[]>([]);
  const [discardPile, setDiscardPile] = useState<UnoCard[]>([]);
  const [currentTurn, setCurrentTurn] = useState<string>(''); // uid of whose turn it is
  const [activeColor, setActiveColor] = useState<'red' | 'blue' | 'green' | 'yellow'>('red');
  const [winner, setWinner] = useState<string | null>(null);
  const [p1Uno, setP1Uno] = useState(false);
  const [p2Uno, setP2Uno] = useState(false);
  const [gameStatus, setGameStatus] = useState('Escolha o modo para iniciar a partida de UNO!');

  // Real-time synchronization state helpers
  const [roomCreator, setRoomCreator] = useState<any>(null);
  const [roomOpponent, setRoomOpponent] = useState<any>(null);

  // Action flow controller states
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pendingWildCard, setPendingWildCard] = useState<UnoCard | null>(null);
  const [hasDrawnThisTurn, setHasDrawnThisTurn] = useState(false);
  const [lastDrawnCard, setLastDrawnCard] = useState<UnoCard | null>(null);
  const [unoAlertTriggered, setUnoAlertTriggered] = useState<string | null>(null); // name of player saying UNO!

  // Sound synchronization
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
      let guestId = localStorage.getItem('uno_guest_id');
      let guestName = localStorage.getItem('uno_guest_name');
      if (!guestId) {
        guestId = 'guest_uno_' + Math.random().toString(36).substring(2, 9);
        guestName = 'Cliente #' + Math.floor(1000 + Math.random() * 9000);
        localStorage.setItem('uno_guest_id', guestId);
        localStorage.setItem('uno_guest_name', guestName);
      }
      setLocalProfile({
        uid: guestId,
        name: guestName || 'Cliente'
      });
    }
  }, [user]);

  // Fetch online rooms
  const fetchOnlineLobbies = async () => {
    setLoadingRooms(true);
    try {
      const q = query(collection(db, 'uno_rooms'), where('status', '==', 'waiting'));
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
      const q = query(collection(db, 'uno_rooms'), where('status', '==', 'waiting'));
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
      const fullDeck = generateUnoDeck();
      // Deal 7 cards to each
      const dealP1 = fullDeck.splice(0, 7);
      const dealP2 = fullDeck.splice(0, 7);
      
      // Keep drawing until top discard is not wild/action for simple starts
      let firstDiscard = fullDeck.splice(0, 1)[0];
      while (firstDiscard.color === 'wild') {
        fullDeck.push(firstDiscard);
        firstDiscard = fullDeck.splice(0, 1)[0];
      }

      const initialColor = firstDiscard.color as 'red' | 'blue' | 'green' | 'yellow';

      const roomPayload: UnoRoomData = {
        status: 'waiting',
        creator: {
          uid: localProfile.uid,
          name: localProfile.name
        },
        opponent: null,
        currentTurn: localProfile.uid, // Creator starts
        deck: fullDeck,
        discardPile: [firstDiscard],
        p1Hand: dealP1,
        p2Hand: dealP2,
        p1Uno: false,
        p2Uno: false,
        activeColor: initialColor,
        winner: null,
        gameStatus: 'Mesa de UNO criada! Aguardando oponente entrar para começar...',
        updatedAt: Date.now()
      };

      const docRef = await addDoc(collection(db, 'uno_rooms'), roomPayload);
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
      const roomRef = doc(db, 'uno_rooms', targetRoomId);
      const opponentData = {
        uid: localProfile.uid,
        name: localProfile.name
      };

      await updateDoc(roomRef, {
        status: 'playing',
        opponent: opponentData,
        gameStatus: `Partida Iniciada! Vez de ${roomCreator?.name || 'Criador'}.`,
        updatedAt: Date.now()
      });

      setRoomId(targetRoomId);
      setIsCreator(false);
      setGameMode('online');
    } catch (e) {
      console.error(e);
    }
  };

  // Real-time subscription for online rooms
  useEffect(() => {
    if (gameMode !== 'online' || !roomId) return;

    const unsub = onSnapshot(doc(db, 'uno_rooms', roomId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as UnoRoomData;

        setP1Hand(data.p1Hand || []);
        setP2Hand(data.p2Hand || []);
        setDeck(data.deck || []);
        setDiscardPile(data.discardPile || []);
        setCurrentTurn(data.currentTurn);
        setActiveColor(data.activeColor);
        setWinner(data.winner);
        setGameStatus(data.gameStatus);
        setRoomCreator(data.creator);
        setRoomOpponent(data.opponent);
        setP1Uno(data.p1Uno || false);
        setP2Uno(data.p2Uno || false);

        // Reset draw state locally if turn changes
        const isMyTurn = data.currentTurn === localProfile.uid;
        if (!isMyTurn) {
          setHasDrawnThisTurn(false);
          setLastDrawnCard(null);
        }
      }
    });

    return () => unsub();
  }, [roomId, gameMode]);

  // Offline / Pass & Play start trigger
  const startNewOfflineGame = (mode: 'ai' | 'local') => {
    setGameMode(mode);
    const fullDeck = generateUnoDeck();
    const dealP1 = fullDeck.splice(0, 7);
    const dealP2 = fullDeck.splice(0, 7);

    let firstDiscard = fullDeck.splice(0, 1)[0];
    while (firstDiscard.color === 'wild') {
      fullDeck.push(firstDiscard);
      firstDiscard = fullDeck.splice(0, 1)[0];
    }

    setP1Hand(dealP1);
    setP2Hand(dealP2);
    setDeck(fullDeck);
    setDiscardPile([firstDiscard]);
    setCurrentTurn('p1');
    setActiveColor(firstDiscard.color as 'red' | 'blue' | 'green' | 'yellow');
    setWinner(null);
    setP1Uno(false);
    setP2Uno(false);
    setHasDrawnThisTurn(false);
    setLastDrawnCard(null);

    if (mode === 'ai') {
      setGameStatus('Jogo contra IA iniciado! Sua vez de jogar.');
    } else {
      setGameStatus('UNO Local! Vez do Jogador 1.');
    }
    audio.playSpecial();
  };

  // Check if a card is valid to play on the current board
  const canPlayCard = (card: UnoCard): boolean => {
    if (discardPile.length === 0) return true;
    const topCard = discardPile[discardPile.length - 1];

    // Wild cards are always playable
    if (card.color === 'wild') return true;

    // Match color
    if (card.color === activeColor) return true;

    // Match value
    if (card.value === topCard.value) return true;

    return false;
  };

  // Select color for wild cards
  const selectWildColor = async (color: 'red' | 'blue' | 'green' | 'yellow') => {
    if (!pendingWildCard) return;

    const card = pendingWildCard;
    setShowColorPicker(false);
    setPendingWildCard(null);

    if (gameMode === 'online' && roomId) {
      const isMyP1 = localProfile.uid === roomCreator.uid;
      let myHand = isMyP1 ? [...p1Hand] : [...p2Hand];
      myHand = myHand.filter(c => c.id !== card.id);

      const nextDiscard = [...discardPile, card];
      const nextTurn = isMyP1 ? roomOpponent.uid : roomCreator.uid;

      // Handle wild +4
      let opponentHand = isMyP1 ? [...p2Hand] : [...p1Hand];
      let updatedDeck = [...deck];
      let extraStatus = '';

      if (card.value === 'wild4') {
        const drawn: UnoCard[] = [];
        for (let i = 0; i < 4; i++) {
          if (updatedDeck.length === 0) {
            updatedDeck = rebuildDeckFromDiscard(nextDiscard);
          }
          if (updatedDeck.length > 0) {
            drawn.push(updatedDeck.shift()!);
          }
        }
        opponentHand.push(...drawn);
        extraStatus = ` e fez o oponente comprar 4 cartas!`;
        audio.playSpecial();
      } else {
        audio.playCard();
      }

      // Check UNO condition
      const currentUnoState = myHand.length === 1;

      const nextStatus = `${localProfile.name} jogou ${card.value === 'wild4' ? 'Coringa Compra 4' : 'Coringa'} e escolheu a cor ${translateColor(color)}${extraStatus}.`;

      // Check win
      const isWinner = myHand.length === 0;

      await updateDoc(doc(db, 'uno_rooms', roomId), {
        p1Hand: isMyP1 ? myHand : opponentHand,
        p2Hand: isMyP1 ? opponentHand : myHand,
        discardPile: nextDiscard,
        deck: updatedDeck,
        activeColor: color,
        currentTurn: nextTurn,
        p1Uno: isMyP1 ? currentUnoState : p1Uno,
        p2Uno: isMyP1 ? p2Uno : currentUnoState,
        winner: isWinner ? localProfile.name : null,
        status: isWinner ? 'finished' : 'playing',
        gameStatus: isWinner ? `PARABÉNS! ${localProfile.name} venceu a partida de UNO! 🎉` : nextStatus,
        updatedAt: Date.now()
      });
    } 
    else {
      // Local/AI Play
      const isP1 = currentTurn === 'p1';
      let myHand = isP1 ? [...p1Hand] : [...p2Hand];
      myHand = myHand.filter(c => c.id !== card.id);

      const nextDiscard = [...discardPile, card];
      let opponentHand = isP1 ? [...p2Hand] : [...p1Hand];
      let updatedDeck = [...deck];
      let extraStatus = '';

      if (card.value === 'wild4') {
        const drawn: UnoCard[] = [];
        for (let i = 0; i < 4; i++) {
          if (updatedDeck.length === 0) {
            updatedDeck = rebuildDeckFromDiscard(nextDiscard);
          }
          if (updatedDeck.length > 0) {
            drawn.push(updatedDeck.shift()!);
          }
        }
        opponentHand.push(...drawn);
        extraStatus = ` e fez o oponente comprar 4 cartas!`;
        audio.playSpecial();
      } else {
        audio.playCard();
      }

      // Sync local state
      if (isP1) {
        setP1Hand(myHand);
        setP2Hand(opponentHand);
        setP1Uno(myHand.length === 1);
      } else {
        setP2Hand(myHand);
        setP1Hand(opponentHand);
        setP2Uno(myHand.length === 1);
      }

      setDeck(updatedDeck);
      setDiscardPile(nextDiscard);
      setActiveColor(color);
      setHasDrawnThisTurn(false);
      setLastDrawnCard(null);

      // Check win
      if (myHand.length === 0) {
        setWinner(isP1 ? 'Jogador 1' : gameMode === 'ai' ? 'Robô AI' : 'Jogador 2');
        setGameStatus(`Fim de Jogo! ${isP1 ? 'Jogador 1' : gameMode === 'ai' ? 'Robô AI' : 'Jogador 2'} venceu a partida! 🎉`);
        audio.playWin();
        return;
      }

      // Next Turn (Opponent skipped due to wild4/special, or standard switch)
      // Standard Wild card passes turn. Wild 4 skips opponent.
      const nextTurn = card.value === 'wild4' ? (isP1 ? 'p1' : 'p2') : (isP1 ? 'p2' : 'p1');
      setCurrentTurn(nextTurn);

      const shooterName = isP1 ? 'Jogador 1' : gameMode === 'ai' ? 'Robô AI' : 'Jogador 2';
      const roundStatus = `${shooterName} jogou ${card.value === 'wild4' ? 'Coringa Compra 4' : 'Coringa'} e escolheu a cor ${translateColor(color)}${extraStatus}.`;
      setGameStatus(roundStatus);

      // Trigger AI move if next turn is AI
      if (gameMode === 'ai' && nextTurn === 'p2') {
        setTimeout(() => triggerAiMove(opponentHand, myHand, updatedDeck, nextDiscard, color, myHand.length === 1), 1500);
      }
    }
  };

  // Rebuild deck from discard pile when empty
  const rebuildDeckFromDiscard = (currentDiscard: UnoCard[]): UnoCard[] => {
    if (currentDiscard.length <= 1) return [];
    const topCard = currentDiscard[currentDiscard.length - 1];
    const newDeck = currentDiscard.slice(0, -1);
    
    // Shuffle new deck
    for (let i = newDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
  };

  // Play card triggers
  const playCard = async (card: UnoCard) => {
    if (winner || !canPlayCard(card)) return;

    // Turn Guard
    if (gameMode === 'online') {
      if (currentTurn !== localProfile.uid) return;
    } else {
      if (gameMode === 'ai' && currentTurn === 'p2') return;
    }

    // Handle Wild Card Selection first
    if (card.color === 'wild') {
      setPendingWildCard(card);
      setShowColorPicker(true);
      return;
    }

    if (gameMode === 'online' && roomId) {
      const isMyP1 = localProfile.uid === roomCreator.uid;
      let myHand = isMyP1 ? [...p1Hand] : [...p2Hand];
      myHand = myHand.filter(c => c.id !== card.id);

      const nextDiscard = [...discardPile, card];
      let opponentHand = isMyP1 ? [...p2Hand] : [...p1Hand];
      let updatedDeck = [...deck];
      let nextTurn = isMyP1 ? roomOpponent.uid : roomCreator.uid;
      let extraStatus = '';

      // Check actions
      if (card.value === 'skip' || card.value === 'reverse') {
        // Skip opponent turn, creator retains turn
        nextTurn = localProfile.uid;
        extraStatus = ' e PULO de vez!';
        audio.playSpecial();
      } else if (card.value === 'draw2') {
        // Opponent draws 2 and gets skipped (turn returns to active)
        const drawn: UnoCard[] = [];
        for (let i = 0; i < 2; i++) {
          if (updatedDeck.length === 0) {
            updatedDeck = rebuildDeckFromDiscard(nextDiscard);
          }
          if (updatedDeck.length > 0) {
            drawn.push(updatedDeck.shift()!);
          }
        }
        opponentHand.push(...drawn);
        nextTurn = localProfile.uid;
        extraStatus = ' e fez o oponente comprar 2 e perder a vez!';
        audio.playSpecial();
      } else {
        audio.playCard();
      }

      // Check UNO condition
      const currentUnoState = myHand.length === 1;

      const nextStatus = `${localProfile.name} jogou ${translateValue(card.value)} ${translateColor(card.color)}${extraStatus}.`;

      // Check win
      const isWinner = myHand.length === 0;

      await updateDoc(doc(db, 'uno_rooms', roomId), {
        p1Hand: isMyP1 ? myHand : opponentHand,
        p2Hand: isMyP1 ? opponentHand : myHand,
        discardPile: nextDiscard,
        deck: updatedDeck,
        activeColor: card.color as any,
        currentTurn: nextTurn,
        p1Uno: isMyP1 ? currentUnoState : p1Uno,
        p2Uno: isMyP1 ? p2Uno : currentUnoState,
        winner: isWinner ? localProfile.name : null,
        status: isWinner ? 'finished' : 'playing',
        gameStatus: isWinner ? `PARABÉNS! ${localProfile.name} venceu a partida de UNO! 🎉` : nextStatus,
        updatedAt: Date.now()
      });
    } 
    else {
      // Local or VS AI Play
      const isP1 = currentTurn === 'p1';
      let myHand = isP1 ? [...p1Hand] : [...p2Hand];
      myHand = myHand.filter(c => c.id !== card.id);

      const nextDiscard = [...discardPile, card];
      let opponentHand = isP1 ? [...p2Hand] : [...p1Hand];
      let updatedDeck = [...deck];
      let nextTurn = isP1 ? 'p2' : 'p1';
      let extraStatus = '';

      if (card.value === 'skip' || card.value === 'reverse') {
        nextTurn = isP1 ? 'p1' : 'p2';
        extraStatus = ' e pulou a vez do oponente!';
        audio.playSpecial();
      } else if (card.value === 'draw2') {
        const drawn: UnoCard[] = [];
        for (let i = 0; i < 2; i++) {
          if (updatedDeck.length === 0) {
            updatedDeck = rebuildDeckFromDiscard(nextDiscard);
          }
          if (updatedDeck.length > 0) {
            drawn.push(updatedDeck.shift()!);
          }
        }
        opponentHand.push(...drawn);
        nextTurn = isP1 ? 'p1' : 'p2';
        extraStatus = ' e fez o oponente comprar 2!';
        audio.playSpecial();
      } else {
        audio.playCard();
      }

      // Sync local state
      if (isP1) {
        setP1Hand(myHand);
        setP2Hand(opponentHand);
        setP1Uno(myHand.length === 1);
      } else {
        setP2Hand(myHand);
        setP1Hand(opponentHand);
        setP2Uno(myHand.length === 1);
      }

      setDeck(updatedDeck);
      setDiscardPile(nextDiscard);
      setActiveColor(card.color as 'red' | 'blue' | 'green' | 'yellow');
      setHasDrawnThisTurn(false);
      setLastDrawnCard(null);

      // Check win
      if (myHand.length === 0) {
        setWinner(isP1 ? 'Jogador 1' : gameMode === 'ai' ? 'Robô AI' : 'Jogador 2');
        setGameStatus(`Fim de Jogo! ${isP1 ? 'Jogador 1' : gameMode === 'ai' ? 'Robô AI' : 'Jogador 2'} venceu a partida de UNO! 🎉`);
        audio.playWin();
        return;
      }

      setCurrentTurn(nextTurn);

      const shooterName = isP1 ? 'Jogador 1' : gameMode === 'ai' ? 'Robô AI' : 'Jogador 2';
      const roundStatus = `${shooterName} jogou ${translateValue(card.value)} ${translateColor(card.color)}${extraStatus}.`;
      setGameStatus(roundStatus);

      // Trigger AI Move if turn is AI
      if (gameMode === 'ai' && nextTurn === 'p2') {
        setTimeout(() => triggerAiMove(opponentHand, myHand, updatedDeck, nextDiscard, card.color as any, myHand.length === 1), 1500);
      }
    }
  };

  // Draw card action
  const drawCard = async () => {
    if (winner || hasDrawnThisTurn) return;

    if (gameMode === 'online') {
      if (currentTurn !== localProfile.uid) return;
    } else {
      if (gameMode === 'ai' && currentTurn === 'p2') return;
    }

    audio.playDraw();

    let updatedDeck = [...deck];
    let nextDiscard = [...discardPile];
    if (updatedDeck.length === 0) {
      updatedDeck = rebuildDeckFromDiscard(nextDiscard);
    }

    if (updatedDeck.length === 0) return; // No cards to draw

    const card = updatedDeck.shift()!;

    if (gameMode === 'online' && roomId) {
      const isMyP1 = localProfile.uid === roomCreator.uid;
      const myHand = isMyP1 ? [...p1Hand, card] : [...p2Hand, card];

      setHasDrawnThisTurn(true);
      setLastDrawnCard(card);

      const nextStatus = `${localProfile.name} comprou uma carta do baralho.`;

      await updateDoc(doc(db, 'uno_rooms', roomId), {
        p1Hand: isMyP1 ? myHand : p1Hand,
        p2Hand: isMyP1 ? p2Hand : myHand,
        deck: updatedDeck,
        gameStatus: nextStatus,
        updatedAt: Date.now()
      });
    } 
    else {
      // Offline/Local Play
      const isP1 = currentTurn === 'p1';
      if (isP1) {
        setP1Hand([...p1Hand, card]);
      } else {
        setP2Hand([...p2Hand, card]);
      }

      setDeck(updatedDeck);
      setHasDrawnThisTurn(true);
      setLastDrawnCard(card);

      const shooterName = isP1 ? 'Jogador 1' : 'Jogador 2';
      setGameStatus(`${shooterName} comprou uma carta. Ela é jogável? Escolha abaixo.`);
    }
  };

  // Pass Turn Action after drawing
  const passTurn = async () => {
    if (!hasDrawnThisTurn || winner) return;

    if (gameMode === 'online' && roomId) {
      const isMyP1 = localProfile.uid === roomCreator.uid;
      const nextTurn = isMyP1 ? roomOpponent.uid : roomCreator.uid;
      const nextStatus = `${localProfile.name} passou a vez.`;

      await updateDoc(doc(db, 'uno_rooms', roomId), {
        currentTurn: nextTurn,
        gameStatus: nextStatus,
        updatedAt: Date.now()
      });

      setHasDrawnThisTurn(false);
      setLastDrawnCard(null);
    } 
    else {
      // Local/AI Pass
      const isP1 = currentTurn === 'p1';
      const nextTurn = isP1 ? 'p2' : 'p1';

      setCurrentTurn(nextTurn);
      setHasDrawnThisTurn(false);
      setLastDrawnCard(null);

      const shooterName = isP1 ? 'Jogador 1' : 'Jogador 2';
      setGameStatus(`${shooterName} passou a vez.`);

      if (gameMode === 'ai' && nextTurn === 'p2') {
        const aiHand = [...p2Hand];
        const playerHand = [...p1Hand];
        const currentDeck = [...deck];
        const currentDiscard = [...discardPile];
        setTimeout(() => triggerAiMove(aiHand, playerHand, currentDeck, currentDiscard, activeColor, playerHand.length === 1), 1500);
      }
    }
  };

  // Declare UNO Button shoutout
  const shoutUno = async () => {
    audio.playUnoAlert();
    setUnoAlertTriggered(localProfile.name);
    setTimeout(() => {
      setUnoAlertTriggered(null);
    }, 2000);

    if (gameMode === 'online' && roomId) {
      const isMyP1 = localProfile.uid === roomCreator.uid;
      await updateDoc(doc(db, 'uno_rooms', roomId), {
        p1Uno: isMyP1 ? true : p1Uno,
        p2Uno: isMyP1 ? p2Uno : true,
        gameStatus: `🗣️ ${localProfile.name} GRITOU UNO! 💥 Resta apenas 1 carta!`
      });
    } else {
      const isP1 = currentTurn === 'p1';
      if (isP1) {
        setP1Uno(true);
      } else {
        setP2Uno(true);
      }
      setGameStatus(`🗣️ ${isP1 ? 'Jogador 1' : 'Jogador 2'} GRITOU UNO! 💥`);
    }
  };

  // AI Automation Decision Maker
  const triggerAiMove = (
    aiHand: UnoCard[], 
    playerHand: UnoCard[], 
    currentDeck: UnoCard[], 
    currentDiscard: UnoCard[],
    currColor: 'red' | 'blue' | 'green' | 'yellow',
    isPlayerAtUno: boolean
  ) => {
    // 1. Check if AI has any valid playable card
    const playableCards = aiHand.filter(card => {
      if (card.color === 'wild') return true;
      if (card.color === currColor) return true;
      const top = currentDiscard[currentDiscard.length - 1];
      return card.value === top.value;
    });

    if (playableCards.length > 0) {
      // Strategy: Prefer action cards if player is at UNO, otherwise standard cards.
      let selectedCard = playableCards[0];
      const actionCards = playableCards.filter(c => c.value === 'draw2' || c.value === 'skip' || c.value === 'reverse' || c.value === 'wild4');
      if (isPlayerAtUno && actionCards.length > 0) {
        selectedCard = actionCards[0];
      }

      // Play selection
      if (selectedCard.color === 'wild') {
        // AI chooses the color of which it has the most cards
        const colorCounts = { red: 0, blue: 0, green: 0, yellow: 0 };
        aiHand.forEach(c => {
          if (c.color !== 'wild') colorCounts[c.color as 'red' | 'blue' | 'green' | 'yellow']++;
        });
        const chosenColor = Object.keys(colorCounts).reduce((a, b) => 
          colorCounts[a as keyof typeof colorCounts] > colorCounts[b as keyof typeof colorCounts] ? a : b
        ) as 'red' | 'blue' | 'green' | 'yellow';

        const updatedAiHand = aiHand.filter(c => c.id !== selectedCard.id);
        const nextDiscard = [...currentDiscard, selectedCard];
        let updatedPlayerHand = [...playerHand];
        let extraStatus = '';
        let updatedDeck = [...currentDeck];

        if (selectedCard.value === 'wild4') {
          const drawn: UnoCard[] = [];
          for (let i = 0; i < 4; i++) {
            if (updatedDeck.length === 0) {
              updatedDeck = rebuildDeckFromDiscard(nextDiscard);
            }
            if (updatedDeck.length > 0) {
              drawn.push(updatedDeck.shift()!);
            }
          }
          updatedPlayerHand.push(...drawn);
          extraStatus = ` e fez você comprar 4 cartas!`;
          audio.playSpecial();
        } else {
          audio.playCard();
        }

        setP2Hand(updatedAiHand);
        setP1Hand(updatedPlayerHand);
        setDeck(updatedDeck);
        setDiscardPile(nextDiscard);
        setActiveColor(chosenColor);
        setCurrentTurn(selectedCard.value === 'wild4' ? 'p2' : 'p1');

        if (updatedAiHand.length === 1) {
          setP2Uno(true);
          audio.playUnoAlert();
          setUnoAlertTriggered('Robô AI');
          setTimeout(() => setUnoAlertTriggered(null), 2000);
        }

        if (updatedAiHand.length === 0) {
          setWinner('Robô AI');
          setGameStatus('Fim de Jogo! O Robô AI venceu a partida! 🤖');
          audio.playWin();
          return;
        }

        setGameStatus(`Robô AI jogou Coringa e escolheu a cor ${translateColor(chosenColor)}${extraStatus}.`);
      } else {
        // Standard Card Play
        const updatedAiHand = aiHand.filter(c => c.id !== selectedCard.id);
        const nextDiscard = [...currentDiscard, selectedCard];
        let updatedPlayerHand = [...playerHand];
        let nextTurn = 'p1';
        let extraStatus = '';
        let updatedDeck = [...currentDeck];

        if (selectedCard.value === 'skip' || selectedCard.value === 'reverse') {
          nextTurn = 'p2';
          extraStatus = ' e pulou a sua vez!';
          audio.playSpecial();
        } else if (selectedCard.value === 'draw2') {
          const drawn: UnoCard[] = [];
          for (let i = 0; i < 2; i++) {
            if (updatedDeck.length === 0) {
              updatedDeck = rebuildDeckFromDiscard(nextDiscard);
            }
            if (updatedDeck.length > 0) {
              drawn.push(updatedDeck.shift()!);
            }
          }
          updatedPlayerHand.push(...drawn);
          nextTurn = 'p2';
          extraStatus = ' e fez você comprar 2 e perder a vez!';
          audio.playSpecial();
        } else {
          audio.playCard();
        }

        setP2Hand(updatedAiHand);
        setP1Hand(updatedPlayerHand);
        setDeck(updatedDeck);
        setDiscardPile(nextDiscard);
        setActiveColor(selectedCard.color as any);
        setCurrentTurn(nextTurn);

        if (updatedAiHand.length === 1) {
          setP2Uno(true);
          audio.playUnoAlert();
          setUnoAlertTriggered('Robô AI');
          setTimeout(() => setUnoAlertTriggered(null), 2000);
        }

        if (updatedAiHand.length === 0) {
          setWinner('Robô AI');
          setGameStatus('Fim de Jogo! O Robô AI venceu a partida! 🤖');
          audio.playWin();
          return;
        }

        setGameStatus(`Robô AI jogou ${translateValue(selectedCard.value)} ${translateColor(selectedCard.color)}${extraStatus}.`);

        // If AI skipped player, let AI move again
        if (nextTurn === 'p2') {
          setTimeout(() => triggerAiMove(updatedAiHand, updatedPlayerHand, updatedDeck, nextDiscard, selectedCard.color as any, updatedPlayerHand.length === 1), 1500);
        }
      }
    } else {
      // AI must draw card
      audio.playDraw();
      let updatedDeck = [...currentDeck];
      let nextDiscard = [...currentDiscard];

      if (updatedDeck.length === 0) {
        updatedDeck = rebuildDeckFromDiscard(nextDiscard);
      }

      if (updatedDeck.length > 0) {
        const drawn = updatedDeck.shift()!;
        const nextAiHand = [...aiHand, drawn];
        setP2Hand(nextAiHand);
        setDeck(updatedDeck);

        // Can play drawn card?
        const canPlayDrawn = drawn.color === 'wild' || drawn.color === currColor || drawn.value === nextDiscard[nextDiscard.length - 1].value;

        if (canPlayDrawn) {
          // Play it immediately!
          setTimeout(() => {
            triggerAiMove(nextAiHand, playerHand, updatedDeck, nextDiscard, currColor, isPlayerAtUno);
          }, 1000);
        } else {
          // Pass turn
          setCurrentTurn('p1');
          setGameStatus('Robô AI comprou uma carta e passou a vez.');
        }
      } else {
        // Deck completely empty and nothing to discard, AI passes
        setCurrentTurn('p1');
        setGameStatus('Robô AI não pôde comprar e passou a vez.');
      }
    }
  };

  const handleExit = async () => {
    if (gameMode === 'online' && roomId && isCreator) {
      try {
        await deleteDoc(doc(db, 'uno_rooms', roomId));
      } catch (e) {}
    }
    setGameMode('menu');
    setRoomId(null);
  };

  // Helper translations
  const translateColor = (color: string) => {
    switch (color) {
      case 'red': return 'Vermelho 🔴';
      case 'blue': return 'Azul 🔵';
      case 'green': return 'Verde 🟢';
      case 'yellow': return 'Amarelo 🟡';
      case 'wild': return 'Coringa 🌈';
      default: return color;
    }
  };

  const translateValue = (val: string) => {
    switch (val) {
      case 'skip': return 'Bloquear 🚫';
      case 'reverse': return 'Inverter 🔄';
      case 'draw2': return 'Compra 2 ➕2';
      case 'wild': return 'Coringa';
      case 'wild4': return 'Compra 4 Coringa ➕4';
      default: return val;
    }
  };

  const getCardBg = (color: string) => {
    switch (color) {
      case 'red': return 'bg-gradient-to-br from-red-600 to-red-800 text-white border-red-500';
      case 'blue': return 'bg-gradient-to-br from-blue-600 to-blue-800 text-white border-blue-500';
      case 'green': return 'bg-gradient-to-br from-green-600 to-green-800 text-white border-green-500';
      case 'yellow': return 'bg-gradient-to-br from-amber-400 to-amber-600 text-black border-amber-300';
      case 'wild': return 'bg-gradient-to-br from-neutral-800 to-neutral-950 text-white border-neutral-700';
      default: return 'bg-neutral-800 text-white border-neutral-700';
    }
  };

  // Determine current active player turn name
  const getCurrentTurnName = () => {
    if (gameMode === 'online') {
      if (currentTurn === localProfile.uid) return 'Sua Vez 🫵';
      return `Vez de ${roomOpponent?.name || 'Oponente'} ⏳`;
    }
    if (currentTurn === 'p1') return 'Sua Vez (Jogador 1) 🫵';
    return gameMode === 'ai' ? 'Vez do Robô AI 🤖' : 'Vez do Jogador 2 ⏳';
  };

  // Current active hands representation
  const activeHand = gameMode === 'online' 
    ? (localProfile.uid === roomCreator?.uid ? p1Hand : p2Hand) 
    : p1Hand;

  const opponentHandCount = gameMode === 'online'
    ? (localProfile.uid === roomCreator?.uid ? p2Hand.length : p1Hand.length)
    : p2Hand.length;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6" id="uno_game_panel">
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
                <h3 className="text-lg font-black uppercase tracking-wider">Regras do UNO</h3>
              </div>
              
              <div className="text-sm text-white/70 space-y-3 max-h-[350px] overflow-y-auto pr-2">
                <p>
                  <strong>1. O Objetivo:</strong> Seja o primeiro jogador a descartar todas as cartas da sua mão.
                </p>
                <p>
                  <strong>2. Combinações:</strong> Você pode descartar uma carta se ela coincidir com a cor ativa ou com o número/símbolo da pilha de descarte, ou se for um Coringa.
                </p>
                <p>
                  <strong>3. Cartas Especiais:</strong>
                  <br />- <strong>Bloquear (Skip):</strong> Pula a vez do adversário (em 1v1 você joga novamente).
                  <br />- <strong>Compra 2 (+2):</strong> Oponente compra 2 cartas e perde a vez.
                  <br />- <strong>Coringa:</strong> Muda a cor ativa para qualquer uma das 4 cores.
                  <br />- <strong>Compra 4 (+4):</strong> Oponente compra 4 cartas e você escolhe a nova cor.
                </p>
                <p>
                  <strong>4. Gritar UNO!:</strong> Quando restar apenas 1 carta na sua mão, você deve clicar no botão <strong>UNO!</strong> imediatamente para alertar os outros clientes.
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

      {/* Wild Color Selection Modal */}
      <AnimatePresence>
        {showColorPicker && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-[#181818] border border-white/10 p-6 rounded-3xl w-full max-w-xs text-center space-y-4 shadow-2xl"
            >
              <h3 className="text-sm font-black uppercase text-amber-500 tracking-wider">Escolha a Cor Ativa</h3>
              <p className="text-xs text-white/50">Selecione uma cor para continuar a rodada:</p>
              
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => selectWildColor('red')}
                  className="h-16 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs tracking-wider border-2 border-red-500 shadow-md cursor-pointer transition-all active:scale-95"
                >
                  Vermelho
                </button>
                <button 
                  onClick={() => selectWildColor('blue')}
                  className="h-16 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs tracking-wider border-2 border-blue-500 shadow-md cursor-pointer transition-all active:scale-95"
                >
                  Azul
                </button>
                <button 
                  onClick={() => selectWildColor('green')}
                  className="h-16 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-black uppercase text-xs tracking-wider border-2 border-green-500 shadow-md cursor-pointer transition-all active:scale-95"
                >
                  Verde
                </button>
                <button 
                  onClick={() => selectWildColor('yellow')}
                  className="h-16 rounded-2xl bg-yellow-500 hover:bg-yellow-600 text-black font-black uppercase text-xs tracking-wider border-2 border-yellow-400 shadow-md cursor-pointer transition-all active:scale-95"
                >
                  Amarelo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* UNO Shout Alert Notification Banner overlay */}
      <AnimatePresence>
        {unoAlertTriggered && (
          <motion.div 
            initial={{ scale: 0.5, opacity: 0, y: -40 }}
            animate={{ scale: 1.1, opacity: 1, y: 0 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center p-4"
          >
            <div className="bg-amber-500 border-4 border-black text-black font-black uppercase px-8 py-5 rounded-3xl shadow-2xl flex flex-col items-center gap-1 animate-bounce">
              <Sparkles className="w-8 h-8 text-black animate-spin" />
              <p className="text-4xl tracking-tighter italic font-black">UNO!!! 🗣️</p>
              <p className="text-xs font-bold mt-1 text-black/80">{unoAlertTriggered} tem apenas 1 carta!</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Info Panel */}
      <div className="flex flex-col sm:flex-row items-center justify-between bg-white/5 border border-white/10 p-5 rounded-3xl gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 font-bold text-xl shrink-0">
            🃏
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black tracking-tight text-white uppercase italic flex flex-wrap items-center justify-center sm:justify-start gap-2">
              Clube do UNO <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-500 not-italic font-semibold">Ao Vivo 1v1</span>
            </h2>
            <p className="text-xs text-white/40">Desafie a Inteligência Artificial ou jogue em tempo real com outros clientes!</p>
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
            title={soundEnabled ? 'Silenciar' : 'Ativar Efeitos'}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5 text-amber-500" /> : <VolumeX className="w-5 h-5 text-white/40" />}
          </button>

          {gameMode !== 'menu' && (
            <button 
              onClick={handleExit}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
            >
              Sair do Jogo
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
              <h3 className="text-base font-black uppercase text-white tracking-wider group-hover:text-amber-500 transition-colors">UNO Online</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Divirta-se jogando UNO em tempo real! Crie uma mesa e jogue com outros clientes que aguardam atendimento.
              </p>
            </div>
            <button 
              onClick={() => setGameMode('lobby')}
              className="mt-6 w-full py-3 bg-amber-500 text-black font-bold uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              Buscar Mesas <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Mode 2: VS AI Computer */}
          <div className="bg-[#151515] border border-white/10 rounded-3xl p-5 flex flex-col justify-between hover:border-amber-500/30 transition-all hover:scale-[1.02] duration-300 shadow-xl group text-left">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black uppercase text-white tracking-wider group-hover:text-amber-500 transition-colors">Robô Computador</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Pratique suas estratégias de cartas jogando partidas táticas contra a inteligência do computador.
              </p>
            </div>
            <button 
              onClick={() => startNewOfflineGame('ai')}
              className="mt-6 w-full py-3 bg-white/5 group-hover:bg-amber-500 group-hover:text-black text-white font-bold uppercase tracking-widest text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              Jogar com IA <Play className="w-4 h-4" />
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
                Desafie um amigo na barbearia dividindo a mesma tela de celular, ocultando as mãos de cartas alternadamente!
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
          {/* Active Player Profile Tag */}
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
              Criar Mesa de UNO <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* List display */}
          <div className="bg-[#151515] border border-white/10 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-white/60">Mesas de UNO Disponíveis</h3>
              <button 
                onClick={fetchOnlineLobbies}
                className="text-[10px] font-bold text-amber-500 hover:underline uppercase tracking-wider"
              >
                Atualizar Lista
              </button>
            </div>

            {loadingRooms ? (
              <p className="text-white/40 text-xs py-8">Buscando oponentes de cartas...</p>
            ) : onlineRooms.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <p className="text-white/40 text-sm italic">Nenhuma mesa aguardando jogadores.</p>
                <p className="text-xs text-white/30 max-w-sm mx-auto">
                  Abra sua própria mesa de UNO! Clientes conectados na barbearia verão o convite no feed e entrarão para jogar.
                </p>
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
                        🃏
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-black text-white">{room.creator.name}</p>
                        <p className="text-[10px] text-white/40">Esperando Oponente para UNO...</p>
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
        /* LIVE GAMEPLAY PANEL */
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Game Scoreboard / Turn HUD */}
          <div className="bg-[#151515] border border-white/10 p-4 rounded-3xl space-y-3 shadow-xl">
            <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2.5">
              <span className="text-[9px] uppercase tracking-widest bg-amber-500/15 text-amber-500 font-black px-2.5 py-1 rounded-full flex items-center gap-1">
                <Layers className="w-3 h-3" /> {deck.length} no Baralho
              </span>
              <span className="text-[10px] text-white/40 font-bold uppercase">
                {gameMode === 'online' ? 'Partida Online' : gameMode === 'ai' ? 'Contra Computador' : 'UNO Local'}
              </span>
            </div>

            {/* Match Indicators */}
            <div className="grid grid-cols-3 items-center text-center">
              {/* Creator/Local Player 1 */}
              <div className="text-left space-y-1">
                <p className="text-[10px] text-white/40 uppercase font-black truncate max-w-[120px]">
                  {gameMode === 'online' ? roomCreator?.name : 'Jogador 1'}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-white">{p1Hand.length}</span>
                  <span className="text-[10px] text-white/40 uppercase font-semibold">Cartas</span>
                </div>
                {p1Hand.length === 1 && (
                  <span className="px-2 py-0.5 bg-amber-500 text-black font-black text-[9px] rounded-full uppercase tracking-wider animate-pulse">UNO!</span>
                )}
              </div>

              {/* Turn Banner Indicator */}
              <div className="space-y-1">
                <p className="text-[9px] text-amber-500 uppercase font-black tracking-widest animate-pulse">Turno Atual</p>
                <p className="text-xs font-black text-white truncate max-w-[100px] mx-auto bg-white/5 border border-white/10 px-2.5 py-1 rounded-full shadow-inner">
                  {getCurrentTurnName()}
                </p>
              </div>

              {/* Opponent/Local Player 2 */}
              <div className="text-right space-y-1">
                <p className="text-[10px] text-white/40 uppercase font-black truncate max-w-[120px] ml-auto">
                  {gameMode === 'online' ? (roomOpponent?.name || 'Aguardando...') : gameMode === 'ai' ? 'Robô AI' : 'Jogador 2'}
                </p>
                <div className="flex items-baseline gap-2 justify-end">
                  <span className="text-[10px] text-white/40 uppercase font-semibold">Cartas</span>
                  <span className="text-2xl font-black text-white">{opponentHandCount}</span>
                </div>
                {opponentHandCount === 1 && (
                  <span className="px-2 py-0.5 bg-amber-500 text-black font-black text-[9px] rounded-full uppercase tracking-wider animate-pulse">UNO!</span>
                )}
              </div>
            </div>

            {/* Turn Announcement text info */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-3 text-center text-xs text-white/80 font-medium">
              {gameStatus}
            </div>
          </div>

          {/* ACTIVE DISCARD BOARD & DECK TABLE */}
          <div className="bg-[#111] border border-white/5 rounded-3xl p-6 min-h-[220px] flex flex-col items-center justify-center relative shadow-inner overflow-hidden">
            {/* Field glowing active color border/glow background */}
            <div className={`absolute inset-0 bg-gradient-to-b opacity-5 pointer-events-none transition-all duration-500 ${
              activeColor === 'red' ? 'from-red-600 to-black' :
              activeColor === 'blue' ? 'from-blue-600 to-black' :
              activeColor === 'green' ? 'from-green-600 to-black' :
              'from-yellow-500 to-black'
            }`} />

            {/* Glowing active color ring indication */}
            <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full backdrop-blur-md">
              <span className={`w-3.5 h-3.5 rounded-full animate-ping ${
                activeColor === 'red' ? 'bg-red-500' :
                activeColor === 'blue' ? 'bg-blue-500' :
                activeColor === 'green' ? 'bg-green-500' :
                'bg-yellow-400'
              }`} />
              <span className="text-[10px] text-white/60 font-black uppercase tracking-wider">
                Cor: {translateColor(activeColor).split(' ')[0]}
              </span>
            </div>

            {/* Active discard pile card and Draw Pile representation */}
            <div className="flex items-center justify-center gap-12 py-4">
              {/* Draw Pile (Simulating deck of cards stacked) */}
              <button 
                onClick={drawCard}
                disabled={winner || hasDrawnThisTurn || (gameMode === 'online' && currentTurn !== localProfile.uid)}
                className={`relative group w-20 h-28 rounded-2xl bg-gradient-to-br from-neutral-800 to-neutral-950 border-2 border-neutral-700 p-1 cursor-pointer transition-all active:scale-95 flex flex-col items-center justify-between shadow-2xl ${
                  winner || hasDrawnThisTurn || (gameMode === 'online' && currentTurn !== localProfile.uid) ? 'opacity-40 cursor-not-allowed' : 'hover:-translate-y-1.5 hover:border-amber-500'
                }`}
              >
                {/* 3D Stacked Layers */}
                <div className="absolute -bottom-1 -right-1 w-full h-full bg-neutral-900 border border-neutral-800 rounded-2xl -z-10" />
                <div className="absolute -bottom-2 -right-2 w-full h-full bg-neutral-950 border border-neutral-900 rounded-2xl -z-20" />

                <div className="w-full h-full border border-neutral-700/50 rounded-xl flex flex-col items-center justify-center bg-zinc-900 relative overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.15),transparent_70%)]" />
                  <span className="text-[10px] text-amber-500 font-black tracking-widest uppercase">UNO</span>
                  <p className="text-[9px] text-white/40 mt-1 uppercase font-bold">Comprar</p>
                </div>
              </button>

              {/* Active Discard pile card */}
              {discardPile.length > 0 ? (
                <div className="relative">
                  {discardPile.slice(-3, -1).map((prevCard, pIdx) => (
                    <div 
                      key={prevCard.id}
                      className={`absolute w-20 h-28 rounded-2xl p-1 shadow-md opacity-30 border -z-10 transform`}
                      style={{
                        transform: `rotate(${(pIdx - 1) * 12}deg) translate(${(pIdx - 1) * 8}px, ${(pIdx - 1) * 4}px)`
                      }}
                    >
                      <div className={`w-full h-full rounded-xl ${getCardBg(prevCard.color)}`} />
                    </div>
                  ))}

                  {/* Top card of discard pile */}
                  <motion.div 
                    initial={{ scale: 0.85, y: 10, rotate: 0 }}
                    animate={{ scale: 1, y: 0 }}
                    className={`w-20 h-28 rounded-2xl ${getCardBg(discardPile[discardPile.length - 1].color)} border-2 p-1 relative shadow-2xl flex flex-col items-center justify-between overflow-hidden`}
                  >
                    {/* Oval background */}
                    <div className="absolute inset-2 bg-white/10 rounded-full transform rotate-12 -z-0 pointer-events-none" />

                    <span className="text-[10px] font-black tracking-tighter self-start pl-1 z-10">
                      {translateValue(discardPile[discardPile.length - 1].value).charAt(0).toUpperCase()}
                    </span>

                    <div className="z-10 font-black text-2xl italic tracking-tighter my-auto transform skew-x-3">
                      {discardPile[discardPile.length - 1].value === 'skip' ? '🚫' :
                       discardPile[discardPile.length - 1].value === 'reverse' ? '🔄' :
                       discardPile[discardPile.length - 1].value === 'draw2' ? '+2' :
                       discardPile[discardPile.length - 1].value === 'wild' ? '🌈' :
                       discardPile[discardPile.length - 1].value === 'wild4' ? '+4' :
                       discardPile[discardPile.length - 1].value}
                    </div>

                    <span className="text-[10px] font-black tracking-tighter self-end pr-1 z-10 transform rotate-180">
                      {translateValue(discardPile[discardPile.length - 1].value).charAt(0).toUpperCase()}
                    </span>
                  </motion.div>
                </div>
              ) : (
                <div className="w-20 h-28 rounded-2xl bg-[#0a0a0a] border border-white/5 flex items-center justify-center">
                  <p className="text-xs text-white/30 italic">Mesa Vazia</p>
                </div>
              )}
            </div>

            {/* Drawn card option buttons (if player drew playable card) */}
            {hasDrawnThisTurn && lastDrawnCard && !winner && (
              <div className="mt-4 flex flex-col items-center gap-2 bg-white/5 border border-white/10 p-3.5 rounded-2xl max-w-xs w-full">
                <p className="text-[10px] text-white/60 font-bold uppercase tracking-wider text-center">Você comprou:</p>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-14 rounded-xl ${getCardBg(lastDrawnCard.color)} border p-0.5 flex flex-col justify-between items-center text-xs relative overflow-hidden`}>
                    <div className="absolute inset-1 bg-white/10 rounded-full transform rotate-12" />
                    <span className="text-[8px] font-black self-start">{lastDrawnCard.value.charAt(0).toUpperCase()}</span>
                    <span className="font-black text-sm z-10 italic">
                      {lastDrawnCard.value === 'skip' ? '🚫' : lastDrawnCard.value === 'draw2' ? '+2' : lastDrawnCard.value}
                    </span>
                    <span className="text-[8px] font-black self-end transform rotate-180">{lastDrawnCard.value.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-black text-white">{translateValue(lastDrawnCard.value)}</p>
                    <p className="text-[10px] text-white/50">{translateColor(lastDrawnCard.color)}</p>
                  </div>
                </div>

                <div className="flex gap-2 w-full mt-2.5">
                  {canPlayCard(lastDrawnCard) ? (
                    <button 
                      onClick={() => playCard(lastDrawnCard)}
                      className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-black uppercase text-[10px] tracking-wider rounded-xl transition-all cursor-pointer"
                    >
                      Jogar Carta
                    </button>
                  ) : (
                    <div className="flex-1 py-2 bg-white/5 text-white/40 font-bold text-[10px] uppercase text-center rounded-xl select-none">
                      Não Jogável
                    </div>
                  )}
                  <button 
                    onClick={passTurn}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold uppercase text-[10px] tracking-wider rounded-xl transition-all cursor-pointer"
                  >
                    Passar Vez
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ACTIVE HUMAN PLAYER HAND - Interactive Carousel of Cards */}
          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-black uppercase tracking-wider text-white/60">Sua Mão ({activeHand.length} cartas)</span>
              {activeHand.length === 2 && (
                <button 
                  onClick={shoutUno}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-black uppercase tracking-widest text-[10px] rounded-full transition-all cursor-pointer shadow-lg animate-pulse"
                >
                  Gritar UNO! 🗣️
                </button>
              )}
            </div>

            {/* HAND SCROLL ROW */}
            <div className="flex items-center gap-3 py-3 overflow-x-auto justify-start max-w-full touch-pan-x scrollbar-thin scrollbar-thumb-white/10">
              {activeHand.length === 0 ? (
                <div className="text-center py-6 w-full">
                  <p className="text-xs text-white/30 italic">Sem cartas na mão.</p>
                </div>
              ) : (
                activeHand.map(card => {
                  const playable = canPlayCard(card);
                  const isMyTurn = gameMode === 'online' ? currentTurn === localProfile.uid : currentTurn === 'p1';

                  return (
                    <motion.button 
                      key={card.id}
                      onClick={() => playCard(card)}
                      disabled={winner || !playable || !isMyTurn || hasDrawnThisTurn}
                      whileHover={{ scale: 1.08, y: -8 }}
                      className={`relative shrink-0 w-20 h-28 rounded-2xl ${getCardBg(card.color)} border-2 p-1 shadow-md flex flex-col justify-between items-center overflow-hidden transition-all duration-300 ${
                        !playable || !isMyTurn || hasDrawnThisTurn 
                          ? 'opacity-40 cursor-not-allowed scale-95 border-black/25' 
                          : 'cursor-pointer hover:shadow-amber-500/10 hover:border-amber-500'
                      }`}
                    >
                      {/* Inner oval background */}
                      <div className="absolute inset-2 bg-white/10 rounded-full transform rotate-12" />

                      <span className="text-[10px] font-black self-start pl-1 z-10">
                        {translateValue(card.value).charAt(0).toUpperCase()}
                      </span>

                      <div className="z-10 font-black text-2xl italic tracking-tighter my-auto transform skew-x-3">
                        {card.value === 'skip' ? '🚫' :
                         card.value === 'reverse' ? '🔄' :
                         card.value === 'draw2' ? '+2' :
                         card.value === 'wild' ? '🌈' :
                         card.value === 'wild4' ? '+4' :
                         card.value}
                      </div>

                      <span className="text-[10px] font-black self-end pr-1 z-10 transform rotate-180">
                        {translateValue(card.value).charAt(0).toUpperCase()}
                      </span>
                    </motion.button>
                  );
                })
              )}
            </div>

            {activeHand.length > 4 && (
              <div className="text-[10px] text-white/30 tracking-wider uppercase font-semibold text-center animate-pulse">
                ↔ Arraste para o lado para ver todas as cartas ↔
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
