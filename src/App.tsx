import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, 
  Clock, 
  Users, 
  Scissors, 
  ChevronRight, 
  Plus, 
  CheckCircle2, 
  XCircle,
  X,
  Bell,
  MapPin,
  Phone,
  Instagram,
  Facebook,
  LogIn,
  LogOut,
  Database,
  LayoutDashboard,
  Settings,
  Trash2,
  Edit3,
  Save,
  TrendingUp,
  DollarSign,
  Mail,
  Lock,
  ShieldAlert,
  User as UserIcon,
  Sparkles,
  MessageSquare
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from './lib/utils';
import { Haircut, Appointment } from './types';
import { motion, AnimatePresence } from 'motion/react';

// GB Barbearia Welcome Logo
import gbWelcomeLogo from './assets/images/gb_barbearia_logo_original_1785266773192.jpg';

// Firebase Imports
import { auth, googleProvider, facebookProvider, db } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInAnonymously
} from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  orderBy,
  serverTimestamp,
  getDocs,
  writeBatch
} from 'firebase/firestore';

type UnifiedUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  provider: 'firebase' | 'google.com';
  isAnonymous?: boolean;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

const getOrCreateGuestUser = (): UnifiedUser => {
  const defaultGuest: UnifiedUser = {
    uid: 'guest_' + Math.random().toString(36).substring(2, 11),
    email: 'guest@remixbarberflow.local',
    displayName: 'Cliente Convidado',
    photoURL: null,
    provider: 'firebase',
    isAnonymous: true
  };
  try {
    const stored = localStorage.getItem('guest_user');
    if (stored) {
      return JSON.parse(stored);
    }
    localStorage.setItem('guest_user', JSON.stringify(defaultGuest));
    return defaultGuest;
  } catch (e) {
    return defaultGuest;
  }
};

export default function App() {
  const [user, setUser] = useState<UnifiedUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [haircuts, setHaircuts] = useState<Haircut[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoadingHaircuts, setIsLoadingHaircuts] = useState(true);
  const [isLoadingAppointments, setIsLoadingAppointments] = useState(true);
  const [selectedHaircut, setSelectedHaircut] = useState<Haircut | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'catalog' | 'queue' | 'admin'>('catalog');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Welcome Modal State
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(true);

  // Auth Modal State
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Google Direct Login Fallback State
  const [isGoogleDirectMode, setIsGoogleDirectMode] = useState(false);
  const [googleDirectName, setGoogleDirectName] = useState('');
  const [googleDirectEmail, setGoogleDirectEmail] = useState('');

  // Admin / Barber Mode States
  const [isDemoAdminMode, setIsDemoAdminMode] = useState(false); // Disabled by default for real security
  const [adminSubTab, setAdminSubTab] = useState<'agenda' | 'walk-in' | 'services'>('agenda');
  
  // Admin authentication states (Owner verification)
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() => {
    return localStorage.getItem('isAdminUnlocked') === 'true';
  });
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);

  // Walk-in States
  const [walkInName, setWalkInName] = useState('');
  const [walkInHaircutId, setWalkInHaircutId] = useState('');
  const [walkInTime, setWalkInTime] = useState('');

  // Rescheduling States
  const [reschedulingApp, setReschedulingApp] = useState<Appointment | null>(null);
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);

  // 1-Click WhatsApp Direct Notification State for Admin Gabriel (55 21 98988-4121)
  const [whatsappNotifyModal, setWhatsappNotifyModal] = useState<{
    customerName: string;
    haircutName: string;
    bookingTime: string;
  } | null>(null);

  const sendWhatsAppNotificationToAdmin = (customerName: string, haircutName: string, bookingTime: string) => {
    const adminPhone = '5521989884121';
    const text = `*GB BARBEARIA - Notificação de Agendamento!* ✂️\n\n` +
      `👤 *Cliente:* ${customerName}\n` +
      `✂️ *Serviço:* ${haircutName}\n` +
      `⏰ *Horário:* ${bookingTime}\n\n` +
      `_Enviado via Notificação 1-Clique pelo App GB BARBEARIA._`;
    const url = `https://wa.me/${adminPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Admin State
  const [editingHaircut, setEditingHaircut] = useState<Partial<Haircut> | null>(null);
  const [isHaircutModalOpen, setIsHaircutModalOpen] = useState(false);

  const isOwnerEmail = user?.email === 'contato@arthurdiniz.com' || user?.email === 'umkmoficial@gmail.com';
  const isAdmin = isAdminUnlocked || isOwnerEmail;

  const handleDatabaseError = (error: any, operationType: OperationType, table: string) => {
    const errInfo = {
      error: error?.message || String(error),
      operationType,
      path: table,
      authInfo: {
        userId: user?.uid || 'anonymous',
        email: user?.email || 'anonymous',
        emailVerified: false,
        isAnonymous: !user,
        tenantId: '',
        providerInfo: []
      }
    };
    console.warn('Database Error: ', JSON.stringify(errInfo));
    // Only display blocking error banner for user mutations (create, update, delete)
    if (operationType !== OperationType.LIST && operationType !== OperationType.GET) {
      setError(`Erro de operação no banco (${table}): ${errInfo.error}`);
    }
  };

  useEffect(() => {
    // Restore Google direct user if logged in previously
    const savedGUser = localStorage.getItem('google_direct_user');
    if (savedGUser) {
      try {
        const parsed = JSON.parse(savedGUser);
        if (parsed && parsed.email) {
          setUser(parsed);
          setIsAuthModalOpen(false);
        }
      } catch (e) {
        console.warn('Saved google direct user parse error:', e);
      }
    }

    // Listen to Firebase Auth
    const unsubscribeFirebase = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && !firebaseUser.isAnonymous) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          provider: 'firebase',
          isAnonymous: false
        });
        setError(null);
        setIsAuthModalOpen(false);
      } else if (!localStorage.getItem('google_direct_user')) {
        if (firebaseUser && firebaseUser.isAnonymous) {
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || 'Cliente Convidado',
            photoURL: null,
            provider: 'firebase',
            isAnonymous: true
          });
        } else {
          try {
            const anonCred = await signInAnonymously(auth);
            setUser({
              uid: anonCred.user.uid,
              email: anonCred.user.email,
              displayName: 'Cliente Convidado',
              photoURL: null,
              provider: 'firebase',
              isAnonymous: true
            });
          } catch (err: any) {
            console.warn("Anonymous auth not available, falling back to local guest session:", err?.code || err?.message);
            const guestUser = getOrCreateGuestUser();
            setUser(guestUser);
          }
        }
        
        // Open welcome/login modal on start if not logged in with an account and not skipped
        if (!localStorage.getItem('auth_skipped')) {
          setIsAuthModalOpen(true);
        }
      }
      setIsAuthReady(true);
    });

    return () => {
      unsubscribeFirebase();
    };
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    // Fetch and Subscribe to Haircuts
    const newBeardImage = 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=80';
    const defaultHaircuts = [
      { name: 'Corte Degradê Futuro', price: 45, duration: 30, image: 'https://images.unsplash.com/photo-1622286342621-4bd786c2447c?auto=format&fit=crop&w=800&q=80', description: 'Degradê moderno feito com acabamento de alta precisão' },
      { name: 'Barba Terapêutica Cyber', price: 35, duration: 25, image: newBeardImage, description: 'Toalha quente e tratamento com óleos essenciais' },
      { name: 'Combo Completo Neon', price: 70, duration: 50, image: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=800&q=80', description: 'Corte de cabelo + barba + acabamento com toalha quente' },
      { name: 'Platinado Holográfico', price: 120, duration: 90, image: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=800&q=80', description: 'Descoloração e tonalização de alto impacto' },
      { name: 'Pigmentação & Camuflagem', price: 40, duration: 25, image: 'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?auto=format&fit=crop&w=800&q=80', description: 'Pigmentação de barba e cabelo para alinhar o perfil e corrigir falhas' },
      { name: 'Corte Infantil Kids', price: 35, duration: 25, image: 'https://images.unsplash.com/photo-1595152772835-219674b2a8a6?auto=format&fit=crop&w=800&q=80', description: 'Atendimento especial para os pequenos com paciência e estilo' },
      { name: 'Sobrancelha na Navalha', price: 20, duration: 15, image: 'https://images.unsplash.com/photo-1562004760-aceed7bb0fe3?auto=format&fit=crop&w=800&q=80', description: 'Desenho e alinhamento das sobrancelhas para valorizar o olhar' }
    ];

    const haircutsQuery = query(collection(db, 'haircuts'), orderBy('price', 'asc'));
    const unsubscribeHaircuts = onSnapshot(haircutsQuery, async (snapshot) => {
      // Cleanup deleted service and update existing doc images
      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.name === 'Hidratação & Selagem Capilar') {
          try {
            deleteDoc(docSnap.ref);
          } catch (e) {
            console.error('Error deleting service:', e);
          }
        }
        if (data.name === 'Barba Terapêutica Cyber' && data.image !== newBeardImage) {
          try {
            updateDoc(docSnap.ref, { image: newBeardImage });
          } catch (e) {
            console.error('Error updating beard image:', e);
          }
        }
      });

      if (snapshot.empty) {
        try {
          const batch = writeBatch(db);
          defaultHaircuts.forEach(haircut => {
            const docRef = doc(collection(db, 'haircuts'));
            batch.set(docRef, haircut);
          });
          await batch.commit();
        } catch (e) {
          console.error('Error seeding haircuts:', e);
        }
      }

      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Haircut));
      setHaircuts(data);
      setIsLoadingHaircuts(false);
    }, (err) => {
      handleDatabaseError(err, OperationType.LIST, 'haircuts');
      setHaircuts(prev => prev.length > 0 ? prev : defaultHaircuts.map((h, i) => ({ id: `default-${i}`, ...h })));
      setIsLoadingHaircuts(false);
    });

    // Fetch and Subscribe to Appointments
    const appointmentsQuery = query(collection(db, 'appointments'), orderBy('startTime', 'asc'));
    const unsubscribeAppointments = onSnapshot(appointmentsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      setAppointments(data);
      setIsLoadingAppointments(false);
    }, (err) => {
      handleDatabaseError(err, OperationType.LIST, 'appointments');
      setIsLoadingAppointments(false);
    });

    return () => {
      unsubscribeHaircuts();
      unsubscribeAppointments();
    };
  }, [isAuthReady]);

  // Lembrete automático no próprio aplicativo 20 minutos antes do agendamento
  useEffect(() => {
    if (!appointments || appointments.length === 0) return;

    const checkAndTriggerAppReminders = async () => {
      const now = new Date();
      for (const app of appointments) {
        if (app.status === 'cancelled' || app.status === 'completed') continue;
        if (app.reminder20minSent) continue;

        try {
          const appTime = parseISO(app.startTime);
          const diffInMinutes = (appTime.getTime() - now.getTime()) / (1000 * 60);

          // Se faltar entre 0 e 20.5 minutos para o horário do cliente
          if (diffInMinutes > 0 && diffInMinutes <= 20.5) {
            console.log(`[Lembrete no App 20min] Agendamento ${app.id} para ${app.customerName} é em ${Math.round(diffInMinutes)} min.`);

            // Atualiza o documento no Firestore para registrar que o lembrete foi acionado no app
            await updateDoc(doc(db, 'appointments', app.id), {
              reminder20minSent: true,
              reminderSentAt: new Date().toISOString()
            });

            const hc = haircuts.find(h => h.id === app.haircutId);
            const haircutName = hc ? hc.name : 'Corte de Cabelo';
            const formattedTime = format(appTime, 'HH:mm');

            // Dispara notificação no próprio aplicativo se o usuário estiver logado e for o cliente
            if (user && (user.email === app.customerEmail || user.uid === app.uid || user.displayName === app.customerName)) {
              setSuccess(`⏰ LEMBRETE NO APLICATIVO: Vaaaamos lá, sua hora está chegando! Faltam apenas 20 min para o seu atendimento às ${formattedTime}!`);
            }
          }
        } catch (err) {
          console.error('Erro ao processar lembrete no app:', err);
        }
      }
    };

    checkAndTriggerAppReminders();
    const interval = setInterval(checkAndTriggerAppReminders, 15000);
    return () => clearInterval(interval);
  }, [appointments, haircuts, user]);

  const handleGoogleLogin = async () => {
    setError(null);
    setIsAuthenticating(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        try {
          await setDoc(doc(db, 'users', result.user.uid), {
            displayName: result.user.displayName || 'Usuário Google',
            email: result.user.email,
            photoURL: result.user.photoURL,
            role: 'user',
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (fErr) {
          console.warn('Firestore google user sync error:', fErr);
        }
        setUser({
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL,
          provider: 'google.com',
          isAnonymous: false
        });
        setIsAuthModalOpen(false);
        localStorage.removeItem('auth_skipped');
        setSuccess('Login com Google realizado com sucesso!');
      }
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        setIsAuthenticating(false);
        return;
      }
      console.warn('Google Login popup error, activating Google Direct Auth mode:', err);
      // Automatically enable Google Direct Mode in modal if pop-up fails or domain is unauthorized
      setIsGoogleDirectMode(true);
      setError(null);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleGoogleDirectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleDirectEmail.trim()) {
      setError('Por favor, informe seu e-mail do Google (Gmail).');
      return;
    }
    const cleanEmail = googleDirectEmail.trim().toLowerCase();
    const cleanName = googleDirectName.trim() || cleanEmail.split('@')[0];
    const googleUid = `google-${cleanEmail.replace(/[^a-zA-Z0-9]/g, '')}`;

    const googleUserData: UnifiedUser = {
      uid: googleUid,
      email: cleanEmail,
      displayName: cleanName,
      photoURL: 'https://lh3.googleusercontent.com/a/default-user',
      provider: 'google.com',
      isAnonymous: false
    };

    try {
      await setDoc(doc(db, 'users', googleUid), {
        displayName: cleanName,
        email: cleanEmail,
        photoURL: 'https://lh3.googleusercontent.com/a/default-user',
        provider: 'google.com',
        role: 'user',
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (fErr) {
      console.warn('Firestore google direct user setDoc error:', fErr);
    }

    localStorage.setItem('google_direct_user', JSON.stringify(googleUserData));
    localStorage.removeItem('auth_skipped');
    setUser(googleUserData);
    setIsAuthModalOpen(false);
    setIsGoogleDirectMode(false);
    setError(null);
    setSuccess(`Login com Conta Google realizado com sucesso! (${cleanEmail})`);
  };

  const handleLogout = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (e) {
      console.warn('Firebase sign out warn:', e);
    }
    localStorage.removeItem('google_direct_user');
    setUser(null);
    setIsAdminUnlocked(false);
    localStorage.removeItem('isAdminUnlocked');
    localStorage.removeItem('auth_skipped');
    setIsAuthModalOpen(true);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsAuthenticating(true);

    if (!firstName.trim() || !lastName.trim()) {
      setError('Por favor, informe seu nome e sobrenome.');
      setIsAuthenticating(false);
      return;
    }
    if (!age || Number(age) < 1 || Number(age) > 120) {
      setError('Por favor, informe uma idade válida.');
      setIsAuthenticating(false);
      return;
    }

    try {
      let activeUser = auth.currentUser;
      if (!activeUser) {
        try {
          const anonCred = await signInAnonymously(auth);
          activeUser = anonCred.user;
        } catch (anonErr) {
          console.warn("Anonymously sign in skipped:", anonErr);
        }
      }

      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      const userEmail = email.trim() || activeUser?.email || null;
      if (activeUser) {
        try {
          await updateProfile(activeUser, { displayName: fullName });
        } catch (pErr) {
          console.warn('Update profile error:', pErr);
        }

        try {
          await setDoc(doc(db, 'users', activeUser.uid), {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            displayName: fullName,
            email: userEmail,
            age: Number(age),
            role: 'user',
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (firestoreErr) {
          console.warn('Firestore user doc create error:', firestoreErr);
        }

        setUser({
          uid: activeUser.uid,
          email: userEmail,
          displayName: fullName,
          photoURL: activeUser.photoURL || null,
          provider: activeUser.providerData?.[0]?.providerId || 'firebase',
          isAnonymous: activeUser.isAnonymous
        });
      } else {
        const guestUser = getOrCreateGuestUser();
        guestUser.displayName = fullName;
        guestUser.email = userEmail;
        setUser(guestUser);
      }

      setSuccess(`Bem-vindo(a), ${firstName}! Dados salvos com sucesso.`);
      setIsAuthModalOpen(false);
      setEmail('');
      setPassword('');
      setFirstName('');
      setLastName('');
      setAge('');
      localStorage.removeItem('auth_skipped');
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(`Erro no cadastro: ${err?.message || 'Erro desconhecido'}`);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const updateAppointmentStatus = async (id: string, status: Appointment['status']) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, 'appointments', id), { status });
    } catch (err) {
      handleDatabaseError(err, OperationType.UPDATE, 'appointments');
    }
  };

  const deleteAppointment = async (id: string) => {
    if (!isAdmin) return;
    try {
      await deleteDoc(doc(db, 'appointments', id));
    } catch (err) {
      handleDatabaseError(err, OperationType.DELETE, 'appointments');
    }
  };

  const handleHaircutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editingHaircut) return;

    try {
      if (editingHaircut.id) {
        const { id, ...data } = editingHaircut;
        await updateDoc(doc(db, 'haircuts', id), data);
      } else {
        await addDoc(collection(db, 'haircuts'), editingHaircut);
      }
      setIsHaircutModalOpen(false);
      setEditingHaircut(null);
    } catch (err) {
      handleDatabaseError(err, editingHaircut.id ? OperationType.UPDATE : OperationType.CREATE, 'haircuts');
    }
  };

  const deleteHaircut = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'haircuts', id));
      setSuccess('Serviço excluído do catálogo com sucesso!');
    } catch (err) {
      handleDatabaseError(err, OperationType.DELETE, 'haircuts');
    }
  };

  const handleWalkInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkInName.trim() || !walkInHaircutId || !walkInTime) {
      setError('Por favor, preencha todos os campos do agendamento presencial.');
      return;
    }

    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const startTime = new Date(`${today}T${walkInTime}`).toISOString();
      await addDoc(collection(db, 'appointments'), {
        customerName: walkInName,
        customerEmail: 'presencial@barbearia.com',
        haircutId: walkInHaircutId,
        startTime,
        status: 'waiting',
        uid: 'walk-in',
        createdAt: serverTimestamp()
      });

      const hc = haircuts.find(h => h.id === walkInHaircutId);
      const hcName = hc ? hc.name : 'Corte Presencial';
      sendWhatsAppNotificationToAdmin(walkInName, hcName, walkInTime);

      setWalkInName('');
      setWalkInTime('');
      setSuccess('Cliente presencial adicionado com sucesso! Notificação do WhatsApp aberta.');
      setAdminSubTab('agenda');
    } catch (err) {
      handleDatabaseError(err, OperationType.CREATE, 'appointments');
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedulingApp || !rescheduleTime) return;

    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const startTime = new Date(`${today}T${rescheduleTime}`).toISOString();
      await updateDoc(doc(db, 'appointments', reschedulingApp.id), { startTime });
      setIsRescheduleModalOpen(false);
      setReschedulingApp(null);
      setRescheduleTime('');
      setSuccess('Horário remarcado com sucesso!');
    } catch (err) {
      handleDatabaseError(err, OperationType.UPDATE, 'appointments');
    }
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let activeUser = user;
    if (!activeUser) {
      try {
        const anonCred = await signInAnonymously(auth);
        activeUser = {
          uid: anonCred.user.uid,
          email: anonCred.user.email,
          displayName: anonCred.user.displayName,
          photoURL: anonCred.user.photoURL,
          provider: 'firebase',
          isAnonymous: anonCred.user.isAnonymous
        };
      } catch (anonErr: any) {
        console.error("Error signing in anonymously during booking:", anonErr);
        // Fallback to guest user instead of throwing error to support APK/WebView environments perfectly
        const guestUser = getOrCreateGuestUser();
        activeUser = guestUser;
        setUser(guestUser);
      }
    }

    if (!selectedHaircut || !customerName || !bookingTime || !activeUser) return;

    try {
      const startTime = new Date(`${format(new Date(), 'yyyy-MM-dd')}T${bookingTime}`).toISOString();
      const userEmail = activeUser.email || '';
      await addDoc(collection(db, 'appointments'), {
        customerName,
        customerEmail: userEmail,
        haircutId: selectedHaircut.id,
        startTime,
        status: 'waiting',
        uid: activeUser.uid,
        reminder20minSent: false,
        createdAt: serverTimestamp()
      });

      const bookedCustomerName = customerName;
      const bookedHaircutName = selectedHaircut.name;
      const bookedTime = bookingTime;

      setIsBookingModalOpen(false);
      setCustomerName('');
      setBookingTime('');
      setSelectedHaircut(null);
      setActiveTab('queue');

      // Trigger 1-Click WhatsApp notification to Gabriel (55 21 98988-4121)
      sendWhatsAppNotificationToAdmin(bookedCustomerName, bookedHaircutName, bookedTime);
      setWhatsappNotifyModal({
        customerName: bookedCustomerName,
        haircutName: bookedHaircutName,
        bookingTime: bookedTime
      });

      setSuccess(`Agendamento realizado! WhatsApp com 1-Clique aberto para notificar o barbeiro Gabriel (55 21 98988-4121).`);
    } catch (err) {
      handleDatabaseError(err, OperationType.CREATE, 'appointments');
    }
  };

  const seedData = async () => {
    if (!isAdmin) return;
    const initialHaircuts = [
      { name: "Degradê Navalhado", price: 45, duration: 40, image: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=800&auto=format&fit=crop", description: "Corte moderno com transição suave na navalha." },
      { name: "Social Clássico", price: 35, duration: 30, image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&auto=format&fit=crop", description: "O corte tradicional para o dia a dia." },
      { name: "Barba Completa", price: 30, duration: 25, image: "https://images.unsplash.com/photo-1590540179852-2110a54f813a?w=800&auto=format&fit=crop", description: "Desenho, hidratação e toalha quente." },
      { name: "Corte + Barba", price: 70, duration: 60, image: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800&auto=format&fit=crop", description: "Combo completo para renovar o visual." },
    ];

    try {
      const batch = writeBatch(db);
      initialHaircuts.forEach(haircut => {
        const newDoc = doc(collection(db, 'haircuts'));
        batch.set(newDoc, haircut);
      });
      await batch.commit();
      setSuccess('Dados iniciais criados com sucesso!');
    } catch (err) {
      handleDatabaseError(err, OperationType.WRITE, 'haircuts');
    }
  };

  const sortedAppointments = useMemo(() => {
    return [...appointments]
      .filter(app => app.status !== 'completed' && app.status !== 'cancelled')
      .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime());
  }, [appointments]);

  const currentService = sortedAppointments.find(app => app.status === 'in-service');
  const nextInQueue = sortedAppointments.filter(app => app.status === 'waiting');

  const stats = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const todayAppointments = appointments.filter(app => format(parseISO(app.startTime), 'yyyy-MM-dd') === today);
    const completedToday = todayAppointments.filter(app => app.status === 'completed');
    const revenue = completedToday.reduce((acc, app) => {
      const haircut = haircuts.find(h => h.id === app.haircutId);
      return acc + (haircut?.price || 0);
    }, 0);

    return {
      totalToday: todayAppointments.length,
      completedToday: completedToday.length,
      revenueToday: revenue,
      waiting: nextInQueue.length
    };
  }, [appointments, haircuts, nextInQueue]);

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-white font-sans selection:bg-amber-500 selection:text-black">
      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-red-500 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3"
          >
            <XCircle className="w-5 h-5" />
            <span className="text-sm font-bold">{error}</span>
            <button onClick={() => setError(null)} className="ml-2 opacity-50 hover:opacity-100">×</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Toast */}
      <AnimatePresence>
        {success && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-green-500 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-bold">{success}</span>
            <button onClick={() => setSuccess(null)} className="ml-2 opacity-50 hover:opacity-100">×</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0F0F0F]/85 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-amber-500 rounded-lg flex items-center justify-center">
              <Scissors className="text-black w-4.5 h-4.5 md:w-6 md:h-6" />
            </div>
            <h1 className="text-base sm:text-lg md:text-2xl font-black tracking-tighter uppercase italic text-white flex items-center gap-1 md:gap-1.5">
              <span className="text-amber-500 font-extrabold">GB</span>
              <span>BARBEARIA</span>
            </h1>
          </div>
          
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium uppercase tracking-widest opacity-60">
            <button 
              onClick={() => setActiveTab('catalog')}
              className={cn("hover:opacity-100 transition-opacity cursor-pointer", activeTab === 'catalog' && "opacity-100 text-amber-500 font-bold")}
            >
              Catálogo
            </button>
            <button 
              onClick={() => setActiveTab('queue')}
              className={cn("hover:opacity-100 transition-opacity cursor-pointer", activeTab === 'queue' && "opacity-100 text-amber-500 font-bold")}
            >
              Fila ao Vivo
            </button>

            <button 
              onClick={() => setActiveTab('admin')}
              className={cn("hover:opacity-100 transition-opacity flex items-center gap-2 cursor-pointer", activeTab === 'admin' && "opacity-100 text-amber-500 font-bold")}
            >
              <LayoutDashboard className="w-4 h-4" /> Painel
            </button>
            {isAdmin && (
              <button onClick={seedData} className="text-amber-500/50 hover:text-amber-500 flex items-center gap-1 cursor-pointer">
                <Database className="w-4 h-4" /> Seed
              </button>
            )}
          </nav>

          <div className="flex items-center gap-2 md:gap-4">
            {user && !user.isAnonymous ? (
              <div className="hidden md:flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full tech-border-beam">
                <UserIcon className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-white max-w-[100px] sm:max-w-[140px] truncate">{user.displayName || user.email}</span>
                <button 
                  onClick={handleLogout} 
                  className="text-white/40 hover:text-white transition-colors cursor-pointer ml-1" 
                  title="Sair da Conta"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsAuthModalOpen(true)}
                className="hidden md:flex bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors items-center gap-1.5 cursor-pointer border border-white/10 tech-border-beam"
              >
                <LogIn className="w-4 h-4 text-amber-500" />
                <span>Entrar / Cadastrar</span>
              </button>
            )}

            {isAdmin && (
              <div className="flex items-center gap-2 border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 rounded-full">
                <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest hidden sm:inline">Admin</span>
                <button 
                  onClick={handleLogout}
                  className="text-white/40 hover:text-white transition-colors cursor-pointer"
                  title="Sair do Painel"
                >
                  <LogOut className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              </div>
            )}
            <button 
              onClick={() => {
                if (haircuts.length > 0) setSelectedHaircut(haircuts[0]);
                setIsBookingModalOpen(true);
              }}
              className="bg-amber-500 text-black px-4 sm:px-6 py-2 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wider hover:bg-amber-400 transition-colors flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/15"
            >
              <Plus className="w-4 h-4" />
              <span>Agendar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 md:py-12 pb-24 md:pb-12">
        {/* Hero Section */}
        <section className="mb-10 md:mb-20 text-center lg:text-left flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          <div className="flex-1">
            <span className="text-amber-500 text-xs font-bold uppercase tracking-[0.3em] mb-2 md:mb-4 block">Estilo & Tradição</span>
            <h2 className="text-4xl sm:text-6xl md:text-8xl font-black tracking-tighter leading-[0.9] uppercase mb-4 md:mb-6 text-white">
              Onde a arte <br /> encontra o <span className="italic text-amber-500">corte</span>.
            </h2>
            <p className="text-white/40 max-w-md mx-auto lg:mx-0 text-sm md:text-lg leading-relaxed mb-6 md:mb-8">
              Mais que uma barbearia, um refúgio para o homem moderno que não abre mão da excelência.
            </p>
          </div>
          
          <div className="flex flex-col gap-4 p-5 md:p-6 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm max-w-md mx-auto lg:mx-0 w-full lg:w-auto tech-border-beam">
            {/* Botão Entrar/Cadastrar Exclusivo para Celular (Acima do Status da Fila) */}
            <div className="block md:hidden w-full pb-3 border-b border-white/10">
              {user && !user.isAnonymous ? (
                <div className="flex items-center justify-between bg-white/5 border border-white/10 px-3.5 py-2.5 rounded-xl text-xs font-bold text-white tech-border-beam">
                  <div className="flex items-center gap-2 truncate">
                    <UserIcon className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="truncate">{user.displayName || user.email}</span>
                  </div>
                  <button 
                    onClick={handleLogout} 
                    className="text-white/50 hover:text-white text-[10px] font-bold uppercase tracking-wider bg-white/10 px-2.5 py-1 rounded-lg ml-2 cursor-pointer shrink-0"
                  >
                    Sair
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setIsAuthModalOpen(true)}
                  className="w-full bg-amber-500 text-black font-black uppercase tracking-wider text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition-all cursor-pointer active:scale-98 tech-border-beam"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Entrar / Cadastrar</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 text-amber-500 justify-center lg:justify-start">
              <Clock className="w-5 h-5" />
              <span className="font-bold uppercase tracking-widest text-xs md:text-sm">Status da Fila</span>
            </div>
            <div className="flex items-center gap-4 justify-center lg:justify-start">
              <div className="text-3xl md:text-4xl font-black tracking-tighter text-white">{nextInQueue.length}</div>
              <div className="text-[10px] md:text-xs uppercase tracking-widest opacity-40 leading-tight text-left">
                Pessoas <br /> aguardando
              </div>
            </div>
          </div>
        </section>

        {/* Tabs Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'catalog' ? (
            <motion.section 
              key="catalog"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6"
            >
              {isLoadingHaircuts ? (
                <div className="col-span-full py-20 text-center">
                  <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-white/20 uppercase tracking-widest font-bold text-xs md:text-sm">Carregando catálogo...</p>
                </div>
              ) : haircuts.length > 0 ? (
                haircuts.map((haircut) => (
                  <div 
                    key={haircut.id} 
                    className="group relative bg-white/5 border border-white/10 rounded-2xl md:rounded-3xl overflow-hidden hover:border-amber-500/50 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="aspect-[3/4] overflow-hidden relative">
                        <img 
                          src={haircut.image} 
                          alt={haircut.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-110 transition-all duration-700"
                        />
                      </div>
                      <div className="p-3.5 md:p-6">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-1.5 md:mb-2 gap-1">
                          <h3 className="text-sm md:text-xl font-bold uppercase tracking-tight text-white leading-tight">{haircut.name}</h3>
                          <span className="text-amber-500 font-bold text-xs md:text-base shrink-0">R$ {haircut.price}</span>
                        </div>
                        <p className="text-white/40 text-[11px] md:text-sm mb-4 line-clamp-2 leading-snug">{haircut.description}</p>
                      </div>
                    </div>
                    <div className="p-3.5 md:p-6 pt-0">
                      <button 
                        onClick={() => {
                          setSelectedHaircut(haircut);
                          setIsBookingModalOpen(true);
                        }}
                        className="w-full py-2.5 md:py-3 border border-white/20 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-wider hover:bg-white hover:text-black transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 whitespace-nowrap"
                      >
                        <span>Selecionar</span> <ChevronRight className="w-3 h-3 md:w-4 md:h-4 shrink-0 animate-pulse" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-20 text-center border-2 border-dashed border-white/10 rounded-3xl">
                  <p className="text-white/20 uppercase tracking-widest font-bold mb-4">Catálogo Vazio</p>
                  {!isAdmin ? (
                    <div className="space-y-4">
                      <p className="text-sm text-white/40 max-w-xs mx-auto">
                        Se você é o administrador, acesse o painel de controle para configurar os serviços iniciais.
                      </p>
                      <button 
                        onClick={() => {
                          setActiveTab('admin');
                        }}
                        className="bg-amber-500 text-black px-8 py-3 rounded-full font-bold uppercase text-xs tracking-widest hover:bg-amber-400 transition-colors flex items-center gap-2 mx-auto cursor-pointer"
                      >
                        <LayoutDashboard className="w-4 h-4" /> Acessar Painel
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      <p className="text-sm text-white/40">Você está logado como administrador. Clique abaixo para popular o catálogo:</p>
                      <button 
                        onClick={seedData} 
                        className="bg-amber-500 text-black px-8 py-3 rounded-full font-bold uppercase text-xs tracking-widest hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
                      >
                        Criar dados iniciais
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Banner informativo no final do catálogo */}
              <div className="col-span-full mt-6 p-6 md:p-8 bg-gradient-to-r from-amber-500/10 via-white/5 to-amber-500/10 border border-amber-500/20 rounded-2xl md:rounded-3xl backdrop-blur-sm text-center relative overflow-hidden tech-border-beam">
                <div className="flex items-center justify-center gap-2 text-amber-500 mb-2">
                  <Clock className="w-5 h-5 text-amber-500" />
                  <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-amber-400">Produtividade no Atendimento</span>
                </div>
                <p className="text-xs md:text-sm text-white/90 font-medium tracking-wide max-w-2xl mx-auto leading-relaxed">
                  O barbeiro perde, em média, de <span className="text-amber-400 font-bold">25% a 40%</span> do seu tempo de trabalho se resolver toda a agenda pelo celular de forma manual. Essa perda varia conforme o modelo de atendimento e a agilidade nas respostas.
                </p>
              </div>
            </motion.section>
          ) : activeTab === 'queue' ? (
            <motion.section 
              key="queue"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8 md:space-y-12"
            >
              {/* Current Service */}
              {currentService && (
                <div className="bg-amber-500 text-black p-5 md:p-8 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6 text-center sm:text-left">
                    <div className="w-16 h-16 md:w-20 md:h-20 bg-black/10 rounded-full flex items-center justify-center animate-pulse shrink-0">
                      <Scissors className="w-8 h-8 md:w-10 md:h-10 text-black" />
                    </div>
                    <div>
                      <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-65">Em Atendimento</span>
                      <h3 className="text-2xl md:text-4xl font-black uppercase tracking-tighter leading-none mt-1">{currentService.customerName}</h3>
                      <p className="text-xs md:text-base font-medium opacity-80 mt-1">{haircuts.find(h => h.id === currentService.haircutId)?.name}</p>
                    </div>
                  </div>
                  <div className="text-center sm:text-right shrink-0">
                    <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-65">Início</span>
                    <div className="text-2xl md:text-4xl font-black tracking-tighter">
                      {format(parseISO(currentService.startTime), 'HH:mm')}
                    </div>
                  </div>
                </div>
              )}

              {/* Queue List */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-12">
                <div className="lg:col-span-2 space-y-4">
                  <h3 className="text-xl md:text-2xl font-bold uppercase tracking-tighter flex items-center gap-3">
                    <Users className="text-amber-500" /> Próximos da Fila
                  </h3>
                  <div className="space-y-3">
                    {nextInQueue.length > 0 ? nextInQueue.map((app, index) => (
                      <div 
                        key={app.id}
                        className="flex items-center justify-between p-4 md:p-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors gap-4"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 md:w-12 md:h-12 bg-white/10 rounded-full flex items-center justify-center text-sm md:text-lg font-bold shrink-0">
                            {index + 1}
                          </div>
                          <div>
                            <h4 className="font-bold uppercase tracking-tight text-sm md:text-base flex flex-wrap items-center gap-2">
                              <span>{app.customerName}</span>
                              {app.reminder20minSent ? (
                                <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 font-bold normal-case">
                                  <Bell className="w-2.5 h-2.5" /> Lembrete no App Notificado
                                </span>
                              ) : (
                                <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 font-bold normal-case">
                                  <Bell className="w-2.5 h-2.5 text-amber-400" /> Lembrete no App (20m antes)
                                </span>
                              )}
                            </h4>
                            <p className="text-[10px] md:text-xs text-white/40 uppercase tracking-widest leading-none mt-1">
                              {haircuts.find(h => h.id === app.haircutId)?.name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <button 
                            onClick={() => {
                              const haircutName = haircuts.find(h => h.id === app.haircutId)?.name || 'Corte';
                              const formattedTime = format(parseISO(app.startTime), 'HH:mm');
                              sendWhatsAppNotificationToAdmin(app.customerName, haircutName, formattedTime);
                            }}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] md:text-xs font-bold uppercase tracking-wider px-2.5 md:px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shadow-md shadow-emerald-900/30 active:scale-95 cursor-pointer"
                            title="Notificar Gabriel no WhatsApp com 1 Clique"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">1-Clique WhatsApp</span>
                          </button>
                          <div className="text-right">
                            <div className="text-lg md:text-xl font-bold tracking-tighter text-amber-500">
                              {format(parseISO(app.startTime), 'HH:mm')}
                            </div>
                            <div className="text-[9px] md:text-[10px] uppercase tracking-widest opacity-40 leading-none mt-0.5">Previsão</div>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div className="py-16 text-center border-2 border-dashed border-white/10 rounded-2xl">
                        <p className="text-white/20 uppercase tracking-widest font-bold text-xs md:text-sm">Fila Vazia</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Card Notificação WhatsApp 1-Clique com Luz Neon Verde */}
                  <div className="p-5 md:p-8 bg-emerald-950/30 border-2 border-emerald-400/80 rounded-3xl tech-border-beam space-y-3 shadow-[0_0_30px_rgba(16,185,129,0.45)] ring-1 ring-emerald-400/50">
                    <h4 className="text-sm md:text-lg font-bold uppercase tracking-tighter flex items-center gap-2 text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]">
                      <MessageSquare className="w-4.5 h-4.5 text-emerald-400 animate-pulse" /> NOTIFICAÇÃO 1-CLIQUE WHATSAPP
                    </h4>
                    <p className="text-xs md:text-sm text-white/90 leading-relaxed font-medium">
                      Notificação direta com 1 clique enviada para o administrador e barbeiro <strong>Gabriel</strong> (<strong>55 21 98988-4121</strong>) com as informações do seu agendamento!
                    </p>
                    <button
                      onClick={() => {
                        const nextApp = nextInQueue[0];
                        if (nextApp) {
                          const hcName = haircuts.find(h => h.id === nextApp.haircutId)?.name || 'Corte';
                          sendWhatsAppNotificationToAdmin(nextApp.customerName, hcName, format(parseISO(nextApp.startTime), 'HH:mm'));
                        } else {
                          sendWhatsAppNotificationToAdmin('Cliente GB', 'Consulta de Agendamento', format(new Date(), 'HH:mm'));
                        }
                      }}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black py-3.5 px-4 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.6)] active:scale-95"
                    >
                      <MessageSquare className="w-4 h-4 fill-black" />
                      <span>Notificar Gabriel no WhatsApp (1 Clique)</span>
                    </button>
                  </div>

                  {/* Card Instagram Oficial */}
                  <div className="p-5 md:p-8 bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-amber-500/10 border border-pink-500/30 rounded-3xl tech-border-beam space-y-3">
                    <h4 className="text-sm md:text-lg font-bold uppercase tracking-tighter flex items-center gap-2 text-pink-400">
                      <Instagram className="w-5 h-5 text-pink-400" /> INSTAGRAM OFICIAL
                    </h4>
                    <p className="text-xs md:text-sm text-white/90 leading-relaxed font-medium">
                      Acompanhe o nosso trabalho pelo instagram oficial.
                    </p>
                    <a
                      href="https://www.instagram.com/gabriel_barber_16/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-gradient-to-r from-pink-600 via-purple-600 to-amber-500 hover:from-pink-500 hover:to-amber-400 text-white font-black py-3.5 px-4 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-pink-600/25 active:scale-95"
                    >
                      <Instagram className="w-4 h-4" />
                      <span>Ver Instagram Oficial (@gabriel_barber_16)</span>
                    </a>
                  </div>

                  <div className="p-5 bg-white/5 border border-white/10 rounded-3xl flex gap-3.5 items-start tech-border-beam">
                    <div className="bg-amber-500/10 text-amber-500 font-extrabold text-xs md:text-sm px-2 py-1 rounded shrink-0">
                      1º
                    </div>
                    <p className="text-xs md:text-sm text-white/80 leading-relaxed">
                      Obrigatório o nome e sobrenome na fila de agendamento.
                    </p>
                  </div>

                  <div className="p-5 bg-white/5 border border-white/10 rounded-3xl flex gap-3.5 items-start tech-border-beam">
                    <div className="bg-amber-500/10 text-amber-500 font-extrabold text-xs md:text-sm px-2 py-1 rounded shrink-0">
                      2º
                    </div>
                    <p className="text-xs md:text-sm text-white/80 leading-relaxed">
                      Pedimos que mantenham a fila de espera em armonia, organização é a alma do negócio. Conto com vocês!
                    </p>
                  </div>

                  <div className="p-5 bg-red-500/5 border border-red-500/10 rounded-3xl flex gap-3.5 items-start tech-border-beam">
                    <div className="bg-red-500/10 text-red-400 font-extrabold text-xs md:text-sm px-2 py-1 rounded shrink-0">
                      3º
                    </div>
                    <p className="text-xs md:text-sm text-white/80 leading-relaxed">
                      Comportamento inadequado ou ofença dentro do APP podem resultar banimento no email cadastrado.
                    </p>
                  </div>
                  
                  <div className="p-5 md:p-8 bg-white/5 border border-white/10 rounded-3xl space-y-4 tech-border-beam">
                    <h4 className="text-sm md:text-lg font-bold uppercase tracking-tighter text-white">Informações</h4>
                    <div className="space-y-3 text-xs md:text-sm text-white/40">
                      <div className="flex items-center gap-3">
                        <MapPin className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>Rua Arapogi Nº 21 Bairro São Bento, Duque de Caxias. - CEP: 25.045-460</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Phone className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>21 98988-4121</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>

          ) : (
            <motion.section 
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {!isAdmin ? (
                <div className="max-w-md mx-auto my-12 bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-sm text-center animate-fadeIn tech-border-beam">
                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const enteredUser = adminUsername.trim().toUpperCase();
                      const enteredPass = adminPassword.trim().toUpperCase();

                      const validCredentials = [
                        { user: 'CHAVEGABRIEL', pass: 'CHAVEGABRIEL' },
                        { user: 'CHAVERUDNEY', pass: 'CHAVERUDNEY' },
                      ];

                      const isValid = validCredentials.some(
                        cred => cred.user === enteredUser && cred.pass === enteredPass
                      );

                      if (isValid) {
                        setIsAdminUnlocked(true);
                        localStorage.setItem('isAdminUnlocked', 'true');
                        setSuccess('Painel Administrativo Desbloqueado!');
                        setAdminLoginError(null);
                      } else {
                        setAdminLoginError('Chave de Acesso ou senha incorretos.');
                      }
                    }}
                    className="space-y-6 text-left"
                  >
                    <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto text-amber-500">
                      <Lock className="w-8 h-8 animate-pulse" />
                    </div>
                    <div className="text-center">
                      <h3 className="text-xl font-bold uppercase tracking-tight text-white mb-2">Acesso ao Painel</h3>
                      <p className="text-xs text-white/60 leading-relaxed">
                        Olá, proprietário! Confirme suas credenciais de segurança para desbloquear o painel administrativo.
                      </p>
                    </div>

                    {adminLoginError && (
                      <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs font-semibold text-center">
                        {adminLoginError}
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold block mb-1.5">Chave de Acesso (Login)</label>
                        <input 
                          type="text"
                          required
                          value={adminUsername}
                          onChange={(e) => setAdminUsername(e.target.value)}
                          placeholder="Digite o login administrativo"
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-amber-500 focus:outline-none transition-colors text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-white/40 font-bold block mb-1.5">Senha</label>
                        <input 
                          type="password"
                          required
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          placeholder="Digite a senha"
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-amber-500 focus:outline-none transition-colors text-white"
                        />
                      </div>
                    </div>

                    <button 
                      type="submit"
                      disabled={isAuthenticating}
                      className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-black uppercase text-xs tracking-widest rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"
                    >
                      {isAuthenticating ? (
                        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      ) : (
                        "Acessar Painel"
                      )}
                    </button>
                  </form>
                </div>
              ) : (
                <>
                  {/* Admin Navigation Subtabs */}
              <div className="flex overflow-x-auto gap-2 border-b border-white/10 pb-4 scrollbar-none scroll-smooth -mx-4 px-4 md:mx-0 md:px-0">
                <button 
                  onClick={() => setAdminSubTab('agenda')}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 cursor-pointer",
                    adminSubTab === 'agenda' ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20" : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
                  )}
                >
                  <Calendar className="w-3.5 h-3.5" /> Agenda de Hoje
                </button>
                <button 
                  onClick={() => {
                    setAdminSubTab('walk-in');
                    if (haircuts.length > 0 && !walkInHaircutId) {
                      setWalkInHaircutId(haircuts[0].id);
                    }
                    const now = new Date();
                    const formattedTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    setWalkInTime(formattedTime);
                  }}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 cursor-pointer",
                    adminSubTab === 'walk-in' ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20" : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
                  )}
                >
                  <Plus className="w-3.5 h-3.5" /> Presencial (Walk-in)
                </button>
                <button 
                  onClick={() => setAdminSubTab('services')}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 cursor-pointer",
                    adminSubTab === 'services' ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20" : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
                  )}
                >
                  <Scissors className="w-3.5 h-3.5" /> Serviços do Catálogo
                </button>
              </div>

              {/* Tab: Agenda de Hoje */}
              {adminSubTab === 'agenda' && (
                <div className="space-y-8">
                  {/* Dashboard Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                    <div className="bg-white/5 border border-white/10 p-4 md:p-6 rounded-2xl md:rounded-3xl backdrop-blur-sm tech-border-beam">
                      <div className="flex items-center gap-2 text-amber-500 mb-2">
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest">Total Hoje</span>
                      </div>
                      <div className="text-2xl md:text-4xl font-black tracking-tighter text-white">{stats.totalToday}</div>
                      <p className="text-white/30 mt-1 uppercase tracking-wider font-medium text-[8px] md:text-[10px]">Agendamentos</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 p-4 md:p-6 rounded-2xl md:rounded-3xl backdrop-blur-sm tech-border-beam">
                      <div className="flex items-center gap-2 text-emerald-500 mb-2">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest">Concluídos</span>
                      </div>
                      <div className="text-2xl md:text-4xl font-black tracking-tighter text-emerald-400">{stats.completedToday}</div>
                      <p className="text-white/30 mt-1 uppercase tracking-wider font-medium text-[8px] md:text-[10px]">Finalizados</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 p-4 md:p-6 rounded-2xl md:rounded-3xl backdrop-blur-sm tech-border-beam">
                      <div className="flex items-center gap-2 text-amber-500 mb-2">
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest">Aguardando</span>
                      </div>
                      <div className="text-2xl md:text-4xl font-black tracking-tighter text-amber-400">{stats.waiting}</div>
                      <p className="text-white/30 mt-1 uppercase tracking-wider font-medium text-[8px] md:text-[10px]">Na fila</p>
                    </div>
                    <div className="bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/30 p-4 md:p-6 rounded-2xl md:rounded-3xl backdrop-blur-sm relative overflow-hidden col-span-2 md:col-span-1 tech-border-beam">
                      <div className="absolute top-2 right-2 opacity-5">
                        <DollarSign className="w-16 md:w-24 h-16 md:h-24 text-amber-500" />
                      </div>
                      <div className="flex items-center gap-2 text-amber-500 mb-2">
                        <DollarSign className="w-3.5 h-3.5" />
                        <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-amber-500">Caixa Hoje</span>
                      </div>
                      <div className="text-2xl md:text-4xl font-black tracking-tighter text-amber-500">R$ {stats.revenueToday}</div>
                      <p className="text-amber-500/50 mt-1 uppercase tracking-wider font-semibold text-[8px] md:text-[10px]">Faturamento</p>
                    </div>
                  </div>

                  {/* Active Queue Timeline */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="text-2xl font-bold uppercase tracking-tighter flex items-center gap-3">
                        <Clock className="text-amber-500 w-6 h-6" /> Cronograma de Atendimento
                      </h3>
                      <button 
                        onClick={() => {
                          setAdminSubTab('walk-in');
                          if (haircuts.length > 0 && !walkInHaircutId) {
                            setWalkInHaircutId(haircuts[0].id);
                          }
                          const now = new Date();
                          const formattedTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                          setWalkInTime(formattedTime);
                        }} 
                        className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-amber-500" /> Walk-in Rápido
                      </button>
                    </div>

                    <div className="space-y-3">
                      {appointments.length > 0 ? (
                        [...appointments]
                          .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime())
                          .map((app) => {
                            const haircut = haircuts.find(h => h.id === app.haircutId);
                            const appTime = format(parseISO(app.startTime), 'HH:mm');
                            return (
                              <div 
                                key={app.id}
                                className={cn(
                                  "p-6 border rounded-[1.5rem] transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 backdrop-blur-sm",
                                  app.status === 'completed' ? "bg-emerald-500/5 border-emerald-500/10 opacity-60" :
                                  app.status === 'cancelled' ? "bg-red-500/5 border-red-500/10 opacity-50" :
                                  app.status === 'in-service' ? "bg-amber-500/10 border-amber-500/40 shadow-lg shadow-amber-500/5 relative overflow-hidden" :
                                  "bg-white/5 border-white/10 hover:bg-white/10"
                                )}
                              >
                                {app.status === 'in-service' && (
                                  <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
                                )}

                                <div className="flex items-center gap-4">
                                  {/* Visual hour block */}
                                  <div className={cn(
                                    "w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-bold tracking-tight border",
                                    app.status === 'completed' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                                    app.status === 'cancelled' ? "bg-red-500/10 border-red-500/20 text-red-400" :
                                    app.status === 'in-service' ? "bg-amber-500 text-black border-amber-500" :
                                    "bg-white/5 border-white/10 text-white"
                                  )}>
                                    <span className="text-xs opacity-60 leading-none">HORA</span>
                                    <span className="text-lg leading-none mt-1 font-mono">{appTime}</span>
                                  </div>

                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-bold text-lg uppercase tracking-tight">{app.customerName}</h4>
                                      {app.uid === 'walk-in' && (
                                        <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded">
                                          Presencial
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm text-white/60">
                                      {haircut ? `${haircut.name} • R$ ${haircut.price} • ${haircut.duration} min` : 'Serviço excluído'}
                                    </p>
                                    <div className="mt-2 flex items-center gap-2">
                                      <span className={cn(
                                        "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                                        app.status === 'waiting' ? "bg-amber-500/20 text-amber-400 border border-amber-500/20" :
                                        app.status === 'in-service' ? "bg-sky-500/20 text-sky-400 border border-sky-500/20 animate-pulse" :
                                        app.status === 'completed' ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20" :
                                        "bg-red-500/20 text-red-400 border border-red-500/20"
                                      )}>
                                        {app.status === 'waiting' ? 'Aguardando' :
                                         app.status === 'in-service' ? 'Cadeira' :
                                         app.status === 'completed' ? 'Concluído' : 'Cancelado'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Actions controls */}
                                <div className="flex flex-wrap items-center gap-2">

                                  {app.status === 'waiting' && (
                                    <button 
                                      onClick={() => updateAppointmentStatus(app.id, 'in-service')}
                                      className="p-3 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                                      title="Chamar para Cadeira"
                                    >
                                      <Scissors className="w-4 h-4" />
                                      <span>Chamar</span>
                                    </button>
                                  )}

                                  {app.status === 'in-service' && (
                                    <button 
                                      onClick={() => updateAppointmentStatus(app.id, 'completed')}
                                      className="p-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                                      title="Concluir Atendimento"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                      <span>Finalizar</span>
                                    </button>
                                  )}

                                  {(app.status === 'waiting' || app.status === 'in-service') && (
                                    <>
                                      <button 
                                        onClick={() => {
                                          setReschedulingApp(app);
                                          setRescheduleTime(appTime);
                                          setIsRescheduleModalOpen(true);
                                        }}
                                        className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl transition-colors cursor-pointer"
                                        title="Remarcar Horário"
                                      >
                                        <Clock className="w-4 h-4" />
                                      </button>
                                      <button 
                                        onClick={() => updateAppointmentStatus(app.id, 'cancelled')}
                                        className="p-3 bg-red-500/10 hover:bg-red-500 hover:text-white border border-red-500/20 text-red-400 rounded-xl transition-colors cursor-pointer"
                                        title="Cancelar"
                                      >
                                        <XCircle className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}

                                  <button 
                                    onClick={() => deleteAppointment(app.id)}
                                    className="p-3 text-white/30 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
                                    title="Remover do Histórico"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                      ) : (
                        <div className="py-16 text-center border-2 border-dashed border-white/10 rounded-3xl">
                          <p className="text-white/20 uppercase tracking-widest font-bold">Nenhum agendamento registrado hoje</p>
                          <p className="text-xs text-white/40 mt-1">Clique em "Agendar Presencial" ou use a aba de cliente para marcar cortes.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Agendar Presencial (Walk-in) */}
              {adminSubTab === 'walk-in' && (
                <div className="max-w-xl mx-auto bg-white/5 border border-white/10 rounded-[2.5rem] p-8 md:p-12 backdrop-blur-sm tech-border-beam">
                  <div className="flex items-center gap-3 text-amber-500 mb-6">
                    <Scissors className="w-6 h-6" />
                    <h3 className="text-2xl font-bold uppercase tracking-tighter">Agendar Walk-in Presencial</h3>
                  </div>
                  <p className="text-white/40 text-sm mb-8">Registre rapidamente um cliente que chegou diretamente na barbearia para o atendimento do dia.</p>

                  <form onSubmit={handleWalkInSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Nome do Cliente</label>
                      <input 
                        required
                        type="text"
                        value={walkInName}
                        onChange={(e) => setWalkInName(e.target.value)}
                        placeholder="Ex: Carlos Silva"
                        className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Horário Previsto</label>
                        <input 
                          required
                          type="time"
                          value={walkInTime}
                          onChange={(e) => setWalkInTime(e.target.value)}
                          className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors [color-scheme:dark]"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Serviço Pretendido</label>
                        <select 
                          value={walkInHaircutId}
                          onChange={(e) => setWalkInHaircutId(e.target.value)}
                          className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors appearance-none"
                        >
                          {haircuts.map(h => (
                            <option key={h.id} value={h.id} className="bg-[#1A1A1A]">{h.name} (R$ {h.price})</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="pt-4 flex gap-4">
                      <button 
                        type="button"
                        onClick={() => setAdminSubTab('agenda')}
                        className="flex-1 border border-white/10 text-white py-4 rounded-2xl font-bold uppercase text-xs tracking-widest hover:bg-white/5 transition-colors cursor-pointer"
                      >
                        Voltar
                      </button>
                      <button 
                        type="submit"
                        className="flex-1 bg-amber-500 text-black py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
                      >
                        Adicionar à Fila
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Tab: Serviços do Catálogo */}
              {adminSubTab === 'services' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <div>
                      <h3 className="text-2xl font-bold uppercase tracking-tighter flex items-center gap-3">
                        <Scissors className="text-amber-500 w-6 h-6" /> Serviços do Catálogo
                        <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1 rounded-full font-mono font-bold">
                          {haircuts.length} {haircuts.length === 1 ? 'Serviço' : 'Serviços'}
                        </span>
                      </h3>
                      <p className="text-xs text-white/40 mt-1">Catálogo sem limites. Adicione quantos cortes e serviços desejar.</p>
                    </div>
                    <button 
                      onClick={() => {
                        setEditingHaircut({ name: '', price: 0, duration: 30, description: '', image: '' });
                        setIsHaircutModalOpen(true);
                      }}
                      className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/10 bg-amber-500 text-black hover:bg-amber-400"
                    >
                      <Plus className="w-4 h-4" /> Adicionar Serviço
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {haircuts.map((haircut) => (
                      <div 
                        key={haircut.id}
                        className="flex items-center justify-between p-6 bg-white/5 border border-white/10 rounded-[1.5rem] hover:border-amber-500/30 transition-all backdrop-blur-sm"
                      >
                        <div className="flex items-center gap-4">
                          <img 
                            src={haircut.image} 
                            className="w-16 h-16 rounded-xl object-cover grayscale border border-white/15" 
                            alt={haircut.name} 
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <h4 className="font-bold uppercase tracking-tight text-md text-white">{haircut.name}</h4>
                            <p className="text-sm text-amber-500 font-bold">R$ {haircut.price} • <span className="text-white/40 font-medium">{haircut.duration} min</span></p>
                            <p className="text-xs text-white/40 mt-1 line-clamp-1 max-w-xs">{haircut.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button 
                            onClick={() => {
                              setEditingHaircut(haircut);
                              setIsHaircutModalOpen(true);
                            }}
                            className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors cursor-pointer"
                            title="Editar Serviço"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => deleteHaircut(haircut.id)}
                            className="p-3 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                            title="Excluir do Catálogo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
                </>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-8">
          <div translate="no" className="notranslate flex items-center gap-3">
            <Scissors className="text-amber-500 w-6 h-6" />
            <span className="text-xl font-bold tracking-tighter uppercase italic"><span className="text-amber-500">GB</span> BARBEARIA</span>
          </div>
          <div className="flex items-center gap-6 opacity-40">
            <a href="https://www.instagram.com/1kmmcoficial/" target="_blank" rel="noopener noreferrer" className="hover:text-amber-500 transition-colors">
              <Instagram className="w-5 h-5 cursor-pointer" />
            </a>
          </div>
          <p className="text-xs uppercase tracking-widest opacity-40">© 2026 GB BARBEARIA. Todos os direitos reservados.</p>
        </div>
      </footer>



      {/* Haircut Edit Modal */}
      <AnimatePresence>
        {isHaircutModalOpen && editingHaircut && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHaircutModalOpen(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-[#1A1A1A] border border-white/10 rounded-2xl md:rounded-[2.5rem] overflow-hidden shadow-2xl max-h-[92vh] flex flex-col tech-border-beam"
            >
              <div className="p-5 md:p-10 overflow-y-auto scrollbar-none">
                <h3 className="text-2xl md:text-3xl font-bold uppercase tracking-tighter mb-1">
                  {editingHaircut.id ? 'Editar Serviço' : 'Novo Serviço'}
                </h3>
                <p className="text-white/40 text-sm mb-8">Configure os detalhes do serviço oferecido.</p>

                <form onSubmit={handleHaircutSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Nome do Serviço</label>
                    <input 
                      required
                      type="text"
                      value={editingHaircut.name}
                      onChange={(e) => setEditingHaircut({ ...editingHaircut, name: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Preço (R$)</label>
                      <input 
                        required
                        type="number"
                        value={editingHaircut.price}
                        onChange={(e) => setEditingHaircut({ ...editingHaircut, price: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Duração (min)</label>
                      <input 
                        required
                        type="number"
                        value={editingHaircut.duration}
                        onChange={(e) => setEditingHaircut({ ...editingHaircut, duration: Number(e.target.value) })}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">URL da Imagem</label>
                    <input 
                      required
                      type="url"
                      value={editingHaircut.image}
                      onChange={(e) => setEditingHaircut({ ...editingHaircut, image: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Descrição</label>
                    <textarea 
                      required
                      value={editingHaircut.description}
                      onChange={(e) => setEditingHaircut({ ...editingHaircut, description: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors h-24 resize-none"
                    />
                  </div>

                  <div className="pt-4">
                    <button 
                      type="submit"
                      className="w-full bg-amber-500 text-black py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                    >
                      <Save className="w-5 h-5" /> Salvar Serviço
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isBookingModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBookingModalOpen(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-[#1A1A1A] border border-white/10 rounded-2xl md:rounded-[2.5rem] overflow-hidden shadow-2xl max-h-[92vh] flex flex-col tech-border-beam"
            >
              <div className="p-5 md:p-10 overflow-y-auto scrollbar-none">
                <h3 className="text-2xl md:text-3xl font-bold uppercase tracking-tighter mb-1">Agendar Corte</h3>
                <p className="text-white/40 text-sm mb-8">Preencha os dados abaixo para reservar seu horário.</p>

                <form onSubmit={handleBooking} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Seu Nome</label>
                    <input 
                      required
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ex: Arthur Diniz"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Horário</label>
                      <input 
                        required
                        type="time"
                        value={bookingTime}
                        onChange={(e) => setBookingTime(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors [color-scheme:dark]"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Corte</label>
                      <select 
                        value={selectedHaircut?.id}
                        onChange={(e) => setSelectedHaircut(haircuts.find(h => h.id === e.target.value) || null)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors appearance-none"
                      >
                        {haircuts.map(h => (
                          <option key={h.id} value={h.id} className="bg-[#1A1A1A]">{h.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button 
                      type="submit"
                      className="w-full bg-amber-500 text-black py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20"
                    >
                      Confirmar Agendamento
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reschedule Modal */}
      <AnimatePresence>
        {isRescheduleModalOpen && reschedulingApp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsRescheduleModalOpen(false);
                setReschedulingApp(null);
              }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[#1A1A1A] border border-white/10 rounded-2xl md:rounded-[2.5rem] overflow-hidden shadow-2xl max-h-[92vh] flex flex-col tech-border-beam"
            >
              <div className="p-5 md:p-10 overflow-y-auto scrollbar-none">
                <h3 className="text-2xl md:text-3xl font-bold uppercase tracking-tighter mb-1">Remarcar Horário</h3>
                <p className="text-white/40 text-sm mb-8">
                  Alterar o horário do atendimento de <strong>{reschedulingApp.customerName}</strong>.
                </p>

                <form onSubmit={handleRescheduleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">Novo Horário</label>
                    <input 
                      required
                      type="time"
                      value={rescheduleTime}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 focus:border-amber-500 focus:outline-none transition-colors [color-scheme:dark]"
                    />
                  </div>

                  <div className="pt-4 flex gap-4">
                    <button 
                      type="button"
                      onClick={() => {
                        setIsRescheduleModalOpen(false);
                        setReschedulingApp(null);
                      }}
                      className="flex-1 border border-white/10 text-white py-4 rounded-2xl font-bold uppercase text-xs tracking-widest hover:bg-white/5 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 bg-amber-500 text-black py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20"
                    >
                      Confirmar
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Auth Modal */}
      <AnimatePresence>
        {isAuthModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                localStorage.setItem('auth_skipped', 'true');
                setIsAuthModalOpen(false);
              }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[#1A1A1A] border border-white/10 rounded-2xl md:rounded-[2.5rem] overflow-hidden shadow-2xl max-h-[92vh] flex flex-col z-10 tech-border-beam"
            >
              <div className="p-6 md:p-8 overflow-y-auto scrollbar-none">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                      <Scissors className="text-black w-4 h-4" />
                    </div>
                    <span className="font-bold text-xs uppercase tracking-wider text-white"><span className="text-amber-500">GB</span><span className="hidden sm:inline"> BARBEARIA</span></span>
                  </div>
                  <button 
                    onClick={() => {
                      localStorage.setItem('auth_skipped', 'true');
                      setIsAuthModalOpen(false);
                    }}
                    className="text-white/40 hover:text-white text-xs uppercase tracking-widest font-bold cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>

                <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tighter mb-2 text-white">
                  Acessar o App
                </h3>
                <p className="text-white/50 text-xs md:text-sm mb-6 leading-relaxed">
                  Escolha uma das opções abaixo para se conectar e agendar seus serviços:
                </p>

                {/* Opção 1: Login com Google */}
                <div className="space-y-3 mb-6">
                  <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500 block">
                    Opção 1: Entrar com Google
                  </label>

                  {isGoogleDirectMode ? (
                    <form onSubmit={handleGoogleDirectSubmit} className="bg-gradient-to-b from-amber-500/15 to-black/80 border border-amber-500/40 rounded-2xl p-4 space-y-3 shadow-xl">
                      <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                          </svg>
                          <span className="text-xs font-bold text-amber-400 uppercase tracking-tight">Conectar com Conta Google</span>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => setIsGoogleDirectMode(false)}
                          className="text-[10px] text-white/50 hover:text-white underline cursor-pointer"
                        >
                          Tentar Pop-up
                        </button>
                      </div>

                      <p className="text-[11px] text-white/80 leading-relaxed">
                        Informe seu e-mail do Google (Gmail) para se conectar e acompanhar seus agendamentos no aplicativo:
                      </p>

                      <div className="space-y-1">
                        <label className="text-[9px] uppercase tracking-wider font-bold text-white/70">Seu Nome</label>
                        <input
                          type="text"
                          value={googleDirectName}
                          onChange={(e) => setGoogleDirectName(e.target.value)}
                          placeholder="Ex: Gabriel Silva"
                          className="w-full bg-black/60 border border-white/20 rounded-xl px-3.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] uppercase tracking-wider font-bold text-white/70">E-mail do Google (Gmail)</label>
                        <input
                          required
                          type="email"
                          value={googleDirectEmail}
                          onChange={(e) => setGoogleDirectEmail(e.target.value)}
                          placeholder="Ex: seu.email@gmail.com"
                          className="w-full bg-black/60 border border-white/20 rounded-xl px-3.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-amber-500 hover:bg-amber-400 text-black font-extrabold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg active:scale-98 cursor-pointer mt-1"
                      >
                        Entrar com Conta Google
                      </button>
                    </form>
                  ) : (
                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={isAuthenticating}
                        onClick={handleGoogleLogin}
                        className="w-full bg-white text-black py-3.5 px-4 rounded-2xl font-bold text-sm hover:bg-gray-100 transition-all shadow-md flex items-center justify-center gap-3 cursor-pointer active:scale-98 disabled:opacity-50"
                      >
                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                        <span>{isAuthenticating ? 'Conectando...' : 'Fazer Login com Google'}</span>
                      </button>
                      <div className="text-center pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            setIsGoogleDirectMode(true);
                          }}
                          className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold underline cursor-pointer"
                        >
                          🔑 Conectar digitando seu e-mail do Google (Gmail)
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative flex py-2 items-center mb-6">
                  <div className="flex-grow border-t border-white/10"></div>
                  <span className="flex-shrink mx-4 text-white/30 text-[10px] uppercase font-bold tracking-widest">ou</span>
                  <div className="flex-grow border-t border-white/10"></div>
                </div>

                {/* Opção 2: Identificação do Cliente */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-500">
                      Opção 2: Conta do Aplicativo
                    </label>
                  </div>

                  <form onSubmit={handleEmailAuth} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] uppercase tracking-wider font-bold text-white/60">Nome</label>
                        <input 
                          required
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="Ex: João"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none transition-colors"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] uppercase tracking-wider font-bold text-white/60">Sobrenome</label>
                        <input 
                          required
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Ex: Silva"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider font-bold text-white/60 flex items-center justify-between">
                        <span>E-mail</span>
                        <span className="text-white/40 text-[9px] font-medium">(opcional)</span>
                      </label>
                      <input 
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Ex: seu.email@gmail.com"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none transition-colors"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] uppercase tracking-wider font-bold text-white/60">Idade</label>
                      <input 
                        required
                        type="number"
                        min="1"
                        max="120"
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        placeholder="Ex: 25"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none transition-colors"
                      />
                    </div>

                    <button 
                      type="submit"
                      disabled={isAuthenticating}
                      className="w-full bg-amber-500 text-black py-3.5 rounded-xl font-extrabold uppercase text-xs tracking-wider hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 mt-2 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isAuthenticating ? (
                        <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span>Criar Conta e Acessar</span>
                      )}
                    </button>
                  </form>
                </div>

                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.setItem('auth_skipped', 'true');
                      setIsAuthModalOpen(false);
                    }}
                    className="text-white/40 hover:text-amber-500 text-[11px] font-medium transition-colors underline underline-offset-4 cursor-pointer"
                  >
                    Continuar como convidado
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal 1-Clique WhatsApp Notificação Administrador Gabriel */}
      <AnimatePresence>
        {whatsappNotifyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#121212] border-2 border-emerald-500 rounded-3xl p-6 max-w-md w-full relative shadow-2xl shadow-emerald-500/20 text-center tech-border-beam"
            >
              <button 
                onClick={() => setWhatsappNotifyModal(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white/70 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/10">
                <MessageSquare className="w-8 h-8 text-emerald-400" />
              </div>

              <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">
                Notificação WhatsApp (1 Clique)
              </h3>

              <p className="text-xs text-white/80 leading-relaxed mb-4">
                Agendamento concluído! O aplicativo já abriu a notificação no WhatsApp para o barbeiro <strong>Gabriel</strong> (<strong>55 21 98988-4121</strong>). Se desejar reenviar, clique abaixo:
              </p>

              <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl text-left space-y-1.5 mb-5 text-xs text-white/90">
                <p>👤 <strong className="text-white/60">Cliente:</strong> {whatsappNotifyModal.customerName}</p>
                <p>✂️ <strong className="text-white/60">Serviço:</strong> {whatsappNotifyModal.haircutName}</p>
                <p>⏰ <strong className="text-white/60">Horário:</strong> {whatsappNotifyModal.bookingTime}</p>
                <p>📲 <strong className="text-white/60">Destino:</strong> Gabriel (55 21 98988-4121)</p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => {
                    sendWhatsAppNotificationToAdmin(
                      whatsappNotifyModal.customerName,
                      whatsappNotifyModal.haircutName,
                      whatsappNotifyModal.bookingTime
                    );
                    setWhatsappNotifyModal(null);
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3.5 px-5 rounded-2xl shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer transition-all active:scale-95"
                >
                  <MessageSquare className="w-5 h-5" />
                  <span>Reenviar no WhatsApp de Gabriel</span>
                </button>

                <button
                  onClick={() => setWhatsappNotifyModal(null)}
                  className="w-full bg-white/10 hover:bg-white/15 text-white/70 font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-colors"
                >
                  Concluir e Voltar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Card de Boas-Vindas / Informativo (Abre toda vez que o app inicia com a Logo GB Barbearia) */}
      <AnimatePresence>
        {isWelcomeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[#101010] border border-amber-500/40 rounded-3xl p-5 md:p-8 max-w-lg w-full text-center relative shadow-2xl shadow-amber-500/20 tech-border-beam overflow-hidden my-auto"
            >
              {/* Botão Fechar no Topo */}
              <button 
                onClick={() => setIsWelcomeModalOpen(false)}
                className="absolute top-4 right-4 z-30 p-2.5 rounded-full bg-black/60 border border-amber-500/40 text-amber-400 hover:bg-amber-500 hover:text-black transition-all cursor-pointer shadow-lg"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Imagem Oficial GB Barbearia */}
              <div className="relative mb-5 rounded-2xl overflow-hidden border-2 border-amber-500/40 shadow-xl shadow-amber-500/10 group">
                <img 
                  src={gbWelcomeLogo} 
                  alt="GB Barbearia Logo - Estilo, Confiança e Atitude" 
                  className="w-full aspect-square object-cover rounded-2xl transition-transform duration-700 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
              </div>

              <h3 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight mb-3 text-gold">
                Agendamento em Tempo Real
              </h3>

              <p className="text-xs md:text-sm text-white/90 font-medium leading-relaxed mb-6 bg-white/5 border border-white/10 p-4 md:p-5 rounded-2xl text-balance">
                COM A GB BARBEARIA É POSSÍVEL MARCAR SEU CORTE NO CONFORTO DE CASA EM TEMPO REAL COM APENAS UM CLIQUE.
              </p>

              {/* Botão de Acesso / Fechar */}
              <button
                onClick={() => setIsWelcomeModalOpen(false)}
                className="w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-black font-black py-4 px-6 rounded-2xl transition-all shadow-xl shadow-amber-500/30 hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 text-xs md:text-sm uppercase tracking-widest"
              >
                <span>Entrar e Acessar o App</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0F0F0F]/95 backdrop-blur-md border-t border-white/10 md:hidden flex justify-around items-center h-16 px-6 shadow-2xl">
        <button 
          onClick={() => setActiveTab('catalog')}
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-full transition-all cursor-pointer active:scale-95",
            activeTab === 'catalog' ? "text-amber-500 font-extrabold" : "text-white/40"
          )}
        >
          <Scissors className="w-5 h-5 mb-1" />
          <span className="text-[9px] uppercase tracking-widest font-black">Catálogo</span>
        </button>
        <button 
          onClick={() => setActiveTab('queue')}
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-full transition-all cursor-pointer active:scale-95",
            activeTab === 'queue' ? "text-amber-500 font-extrabold" : "text-white/40"
          )}
        >
          <Clock className="w-5 h-5 mb-1" />
          <span className="text-[9px] uppercase tracking-widest font-black">Fila</span>
        </button>

        <button 
          onClick={() => setActiveTab('admin')}
          className={cn(
            "flex flex-col items-center justify-center flex-1 h-full transition-all cursor-pointer active:scale-95",
            activeTab === 'admin' ? "text-amber-500 font-extrabold" : "text-white/40"
          )}
        >
          <LayoutDashboard className="w-5 h-5 mb-1" />
          <span className="text-[9px] uppercase tracking-widest font-black">Painel</span>
        </button>
      </div>
    </div>
  );
}
