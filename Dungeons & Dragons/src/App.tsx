/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import LobbySetup from './components/LobbySetup';
import GameArena from './components/GameArena';
import { GameSession } from './types';
import { Flame, Info, Github } from 'lucide-react';

export default function App() {
  const [activeSession, setActiveSession] = useState<GameSession | null>(null);
  const [myCharacterId, setMyCharacterId] = useState<string | null>(null);
  const [isLocalMode, setIsLocalMode] = useState<boolean>(true);

  const handleGameStarted = (session: GameSession, activeCharId: string | null, isLocal: boolean) => {
    setActiveSession(session);
    setMyCharacterId(activeCharId);
    setIsLocalMode(isLocal);
  };

  const handleExitGame = () => {
    setActiveSession(null);
    setMyCharacterId(null);
    setIsLocalMode(true);
  };

  return (
    <div className="min-h-screen bg-bg-base text-[#d1d1d1] flex flex-col font-sans" id="app-root">
      
      {/* GLOBAL THEMATIC TOP BAR */}
      <header className="h-16 flex items-center justify-between px-6 sm:px-8 bg-panel-card border-b border-panel-border shadow-2xl z-20 sticky top-0 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-arcane-primary to-arcane-secondary flex items-center justify-center shadow-[0_0_15px_rgba(126,97,255,0.4)]">
            <Flame className="w-4 h-4 text-white fill-white" />
          </div>
          <h1 className="text-lg font-bold tracking-widest uppercase text-white font-serif">
            Arcane<span className="text-arcane-primary font-serif">DM</span>
          </h1>
        </div>

        <div className="flex items-center gap-6 text-[11px] uppercase tracking-wider font-sans font-semibold">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-emerald-400">Gemini AI Active</span>
          </div>
          {activeSession ? (
            <span className="text-zinc-500 hidden sm:inline">Lobby Code: <strong className="text-arcane-primary font-mono">{activeSession.roomCode}</strong></span>
          ) : (
            <span className="text-zinc-500 hidden sm:inline">Pre-Adventure Lobby</span>
          )}
        </div>
      </header>

      {/* CORE HERO WRAPPER MAIN VIEW */}
      <main className="flex-1 w-full py-6">
        {activeSession ? (
          <GameArena
            initialSession={activeSession}
            myCharacterId={myCharacterId}
            isLocalMode={isLocalMode}
            onExitGame={handleExitGame}
          />
        ) : (
          <LobbySetup onGameStarted={handleGameStarted} />
        )}
      </main>

      {/* FOOTER SECTION */}
      <footer className="border-t border-zinc-900/80 py-4 bg-zinc-950/40 text-center text-[11px] text-zinc-500 font-mono">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>Powered by <strong>Gemini 3.5 AI</strong>. Coordinated roll balancing & narrative resolution.</span>
          <span>© 2026 AI Dungeon Master Studio</span>
        </div>
      </footer>
    </div>
  );
}
