/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { GameSession, GameSettings, Character, CharacterStats } from '../types';
import { PRESET_CHARACTERS, CAMPAIGN_PRESETS, CampaignPreset, PresetCharacterInfo } from '../data/presets';
import { Sparkles, Play, Plus, Trash2, ArrowLeft, Users, Shield, Wand2, Swords, Compass, Dices, ChevronRight } from 'lucide-react';

interface LobbySetupProps {
  onGameStarted: (session: GameSession, activeCharId: string | null, isLocalMode: boolean) => void;
}

export default function LobbySetup({ onGameStarted }: LobbySetupProps) {
  // Navigation
  const [setupMode, setSetupMode] = useState<'welcome' | 'create_room' | 'join_room' | 'local_setup'>('welcome');
  const [loading, setLoading] = useState(false);
  const [errorString, setErrorString] = useState<string | null>(null);

  // Room config
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [playerNameInput, setPlayerNameInput] = useState('');
  const [isLocalPlay, setIsLocalPlay] = useState(false);

  // Campaign Settings
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignPreset>(CAMPAIGN_PRESETS[0]);
  const [customCampaignDetail, setCustomCampaignDetail] = useState('');
  const [difficultySetting, setDifficultySetting] = useState<'casual' | 'standard' | 'hard' | 'unforgiving'>('standard');

  // Character Creation / Selection
  const [customCharacterActive, setCustomCharacterActive] = useState(false);
  const [charName, setCharName] = useState('');
  const [charRace, setCharRace] = useState('Human');
  const [charClass, setCharClass] = useState('Fighter');
  const [charHp, setCharHp] = useState(12);
  const [charBackstory, setCharBackstory] = useState('');
  const [charStats, setCharStats] = useState<CharacterStats>({ str: 12, dex: 12, con: 12, int: 10, wis: 10, cha: 10 });
  const [equipmentList, setEquipmentList] = useState<string[]>(["Iron Weapon", "Leather Vest", "Travel Pack"]);
  const [newEquipmentItem, setNewEquipmentItem] = useState("");

  // Parties built during Local Mode setup
  const [localParty, setLocalParty] = useState<Character[]>([]);

  // Room session state for online lounge
  const [onlineSession, setOnlineSession] = useState<GameSession | null>(null);
  const [myOnlineCharacter, setMyOnlineCharacter] = useState<Character | null>(null);

  // Reset errors
  const clearError = () => setErrorString(null);

  // Manage Stats Assignment (Point buy/Sliders)
  const modifyStat = (stat: keyof CharacterStats, amount: number) => {
    setCharStats(prev => {
      const val = Math.max(6, Math.min(18, prev[stat] + amount));
      return { ...prev, [stat]: val };
    });
  };

  const handleAddEquipment = () => {
    if (newEquipmentItem.trim()) {
      setEquipmentList(prev => [...prev, newEquipmentItem.trim()]);
      setNewEquipmentItem("");
    }
  };

  const handleRemoveEquipment = (index: number) => {
    setEquipmentList(prev => prev.filter((_, i) => i !== index));
  };

  // Preset Selection Helper
  const applyPresetCharacter = (preset: PresetCharacterInfo) => {
    setCharName(preset.name);
    setCharRace(preset.race);
    setCharClass(preset.class);
    setCharHp(preset.hp);
    setCharStats(preset.stats);
    setCharBackstory(preset.backstory);
    setEquipmentList(preset.equipment);
  };

  // LOCAL PLAY FLOWS
  const handleAddLocalCharacter = () => {
    if (!charName.trim()) {
      setErrorString("Character Name is required.");
      return;
    }
    const newChar: Character = {
      id: "local_" + Math.random().toString(36).substring(2, 9),
      ownerName: "Local DM",
      name: charName,
      race: charRace,
      class: charClass,
      level: 1,
      hp: charHp,
      maxHp: charHp,
      stats: { ...charStats },
      backstory: charBackstory || "An eager local adventurer.",
      equipment: [...equipmentList],
      isPrepared: false,
      currentAction: ""
    };

    setLocalParty(prev => [...prev, newChar]);
    // Reset Character Form
    setCharName('');
    setCharBackstory('');
    setEquipmentList(["Iron Swords", "Cloth Mantle", "Field Rations"]);
    setCustomCharacterActive(false);
    clearError();
  };

  const startLocalAdventure = async () => {
    if (localParty.length === 0) {
      setErrorString("Your party is empty. Please add at least one hero before starting!");
      return;
    }

    setLoading(true);
    clearError();

    try {
      // 1. Create a server session
      const createRes = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            campaignType: selectedCampaign.type,
            difficulty: difficultySetting,
            customCampaignDetail: selectedCampaign.type === 'custom' ? customCampaignDetail : ''
          }
        })
      });

      if (!createRes.ok) throw new Error("Failed to provision server room.");
      let session: GameSession = await createRes.json();

      // 2. Add all characters from localParty to the room
      for (const localChar of localParty) {
        const joinRes = await fetch("/api/room/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomCode: session.roomCode,
            characterData: localChar,
            ownerName: "Local Master"
          })
        });
        if (!joinRes.ok) throw new Error(`Could not join character ${localChar.name}`);
        const joinData = await joinRes.json();
        session = joinData.session;
      }

      // 3. Fire the game launch
      const startRes = await fetch("/api/room/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: session.roomCode })
      });

      if (!startRes.ok) {
        const errData = await startRes.json();
        throw new Error(errData.error || "AI Dungeon Master failed to create primary lobby.");
      }

      const startedSession: GameSession = await startRes.json();
      onGameStarted(startedSession, null, true); // No single active char since local controls all
    } catch (err: any) {
      setErrorString(err.message || "Something went wrong initiating the game.");
    } finally {
      setLoading(false);
    }
  };

  // MULTIPLAYER INTERACTIVE FLOWS
  const handleCreateOnlineRoom = async () => {
    setLoading(true);
    clearError();
    try {
      const res = await fetch("/api/room/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            campaignType: selectedCampaign.type,
            difficulty: difficultySetting,
            customCampaignDetail: selectedCampaign.type === 'custom' ? customCampaignDetail : ''
          }
        })
      });
      if (!res.ok) throw new Error("Could not create online terminal.");
      const session: GameSession = await res.json();
      setOnlineSession(session);
      setIsLocalPlay(false);
      setSetupMode('join_room'); // Transfer to character join phase next
    } catch (err: any) {
      setErrorString(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinByCode = async () => {
    if (!roomCodeInput.trim()) {
      setErrorString("Please enter a valid room code.");
      return;
    }
    setLoading(true);
    clearError();
    try {
      const roomCode = roomCodeInput.toUpperCase().trim();
      const res = await fetch(`/api/room/state/${roomCode}`);
      if (!res.ok) throw new Error(`Active room ${roomCode} does not exist.`);
      const session: GameSession = await res.json();
      setOnlineSession(session);
      setIsLocalPlay(false);
      setSetupMode('join_room');
    } catch (err: any) {
      setErrorString(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitOnlineJoin = async () => {
    if (!charName.trim()) {
      setErrorString("Character Name is required.");
      return;
    }
    if (!onlineSession) return;

    setLoading(true);
    clearError();
    try {
      const charPayload = {
        name: charName,
        race: charRace,
        class: charClass,
        hp: charHp,
        stats: charStats,
        backstory: charBackstory,
        equipment: equipmentList
      };

      const res = await fetch("/api/room/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode: onlineSession.roomCode,
          characterData: charPayload,
          ownerName: playerNameInput.trim() || "Adventurer"
        })
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Could not mount character into server.");
      }

      const data = await res.json();
      setOnlineSession(data.session);
      setMyOnlineCharacter(data.character);
    } catch (err: any) {
      setErrorString(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Poll online room lounge regularly
  React.useEffect(() => {
    if (!onlineSession || myOnlineCharacter === null || setupMode !== 'join_room') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/room/state/${onlineSession.roomCode}`);
        if (res.ok) {
          const session: GameSession = await res.json();
          setOnlineSession(session);

          // If the host starts the game, transition client there!
          if (session.status === 'playing') {
            clearInterval(interval);
            onGameStarted(session, myOnlineCharacter.id, false);
          }
        }
      } catch (e) {
        console.warn("Poll active room error", e);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [onlineSession, myOnlineCharacter, setupMode]);

  const launchOnlineAdventure = async () => {
    if (!onlineSession) return;
    setLoading(true);
    clearError();
    try {
      const res = await fetch("/api/room/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: onlineSession.roomCode })
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "AI DM initialization returned an error.");
      }
      const startedSession = await res.json();
      onGameStarted(startedSession, myOnlineCharacter?.id || null, false);
    } catch (err: any) {
      setErrorString(err.message);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 pb-12 pt-4 px-4" id="lobby-setup-root">
      {/* Title Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-arcane-primary/10 border border-arcane-primary/30 rounded-full text-arcane-primary text-xs uppercase tracking-widest font-sans font-bold">
          <Dices className="w-4 h-4 animate-spin-slow text-arcane-secondary" />
          Arcane Dungeon Narrative Engine
        </div>
        <h1 className="text-5xl font-black tracking-widest uppercase bg-gradient-to-r from-arcane-primary via-arcane-secondary to-arcane-primary text-transparent bg-clip-text font-serif">
          Arcane DM
        </h1>
        <p className="text-[#a1a1aa] max-w-xl mx-auto text-sm leading-relaxed font-sans">
          Embark on an immersive text-based RPG saga. Co-author stories with active simultaneous actions, watch the Dungeon Master roll, and experience custom scenery illustration.
        </p>
      </div>

      {errorString && (
        <div className="p-4 bg-red-950/40 border border-red-500/40 rounded-xl text-red-300 text-sm flex gap-3 items-center shadow-lg" id="lobby-error">
          <span className="font-semibold text-lg">⚠️</span>
          <div className="flex-1">{errorString}</div>
          <button onClick={clearError} className="p-1 hover:bg-white/10 rounded">X</button>
        </div>
      )}

      {/* STEP 1: WELCOME SELECTOR */}
      {setupMode === 'welcome' && (
        <div className="grid md:grid-cols-2 gap-6" id="welcome-options">
          {/* LOCAL GAME CARD */}
          <button
            onClick={() => {
              setIsLocalPlay(true);
              setSetupMode('local_setup');
            }}
            className="group relative flex flex-col p-8 bg-panel-card/75 backdrop-blur-md border border-panel-border hover:border-arcane-primary/55 rounded-2xl text-left transition-all duration-300 shadow-xl overflow-hidden cursor-pointer"
            id="btn-local-play"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-arcane-primary/5 rounded-full blur-2xl group-hover:bg-arcane-primary/10 transition-all duration-300" />
            <div className="p-3 bg-arcane-primary/10 rounded-xl text-arcane-primary w-fit mb-5 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_15px_rgba(126,97,255,0.2)]">
              <Compass className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-gray-100 font-serif group-hover:text-arcane-primary transition-colors">
              Solo / Local Party Mode
            </h3>
            <p className="mt-3 text-sm text-[#a1a1aa] leading-relaxed font-sans">
              Create and coordinate an entire party of up to 4 heroes yourself, or play pass-and-play with friends in the same room. Great for solo RPG sessions.
            </p>
            <div className="mt-auto pt-6 flex items-center justify-between text-arcane-primary font-medium text-sm font-sans tracking-wide group-hover:translate-x-2 transition-transform">
              <span>Configure Adventure</span> <ChevronRight className="w-4 h-4" />
            </div>
          </button>

          {/* ONLINE GAME CARD */}
          <button
            onClick={() => {
              setIsLocalPlay(false);
              setSetupMode('create_room');
            }}
            className="group relative flex flex-col p-8 bg-panel-card/75 backdrop-blur-md border border-panel-border hover:border-arcane-secondary/55 rounded-2xl text-left transition-all duration-300 shadow-xl overflow-hidden cursor-pointer"
            id="btn-online-play"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-arcane-secondary/5 rounded-full blur-2xl group-hover:bg-arcane-secondary/10 transition-all duration-300" />
            <div className="p-3 bg-arcane-secondary/10 rounded-xl text-arcane-secondary w-fit mb-5 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_15px_rgba(255,97,216,0.2)]">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-gray-100 font-serif group-hover:text-arcane-secondary transition-colors">
              Online Multiplayer Mode
            </h3>
            <p className="mt-3 text-sm text-[#a1a1aa] leading-relaxed font-sans">
              Create a unique Lobby Code. Send it to friends so they can join with their custom characters. Write actions simultaneously across different devices!
            </p>
            <div className="mt-auto pt-6 flex items-center justify-between text-arcane-secondary font-medium text-sm font-sans tracking-wide group-hover:translate-x-2 transition-transform">
              <span>Join or Host Rooms</span> <ChevronRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      )}

      {/* STEP 2: CREATE / JOIN MULTIPLAYER FORM */}
      {setupMode === 'create_room' && (
        <div className="bg-panel-card/85 backdrop-blur-md border border-panel-border rounded-2xl p-8 space-y-8 shadow-xl" id="create-room-panel">
          <div className="flex items-center gap-3 border-b border-panel-border pb-3">
            <button onClick={() => setSetupMode('welcome')} className="p-2 hover:bg-[#25252b] rounded-lg text-gray-450 hover:text-white cursor-pointer transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-bold text-gray-100 font-serif">Setup Multiplayer Setting</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Quick Join */}
            <div className="space-y-4 pr-0 md:pr-8 border-r-0 md:border-r border-panel-border">
              <h3 className="text-lg font-bold text-gray-200 font-serif">Join Existing Room</h3>
              <p className="text-xs text-[#a1a1aa] leading-relaxed">Have a 4-letter code? Put it here to unite your powers of roleplaying with your team!</p>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="e.g. ABCD"
                  maxLength={4}
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 bg-bg-base border border-panel-border focus:border-arcane-primary rounded-xl text-lg font-mono tracking-widest text-center text-arcane-primary focus:outline-none uppercase"
                  id="join-code-input"
                />
                <button
                  onClick={handleJoinByCode}
                  disabled={loading}
                  className="w-full py-3 px-5 bg-[#25252b] hover:bg-[#34343d] border border-panel-border disabled:opacity-50 text-gray-200 font-semibold rounded-xl text-sm transition shadow-md cursor-pointer"
                  id="btn-join-room-submit"
                >
                  {loading ? "Discovering Room..." : "Connect to Room"}
                </button>
              </div>
            </div>

            {/* Config & New Room */}
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-gray-200 font-serif">Host New Campaign</h3>
              
              {/* Campaign Presets */}
              <div className="space-y-3">
                <label className="text-[10px] uppercase font-bold text-[#71717a] font-sans tracking-wider block">Choose Campaign Setting</label>
                <div className="grid gap-2">
                  {CAMPAIGN_PRESETS.map((preset) => (
                    <button
                      key={preset.type}
                      onClick={() => setSelectedCampaign(preset)}
                      className={`flex flex-col p-3 rounded-xl border text-left transition cursor-pointer ${
                        selectedCampaign.type === preset.type
                          ? 'bg-arcane-primary/10 border-arcane-primary/50 text-gray-100'
                          : 'bg-bg-base border-panel-border text-[#a1a1aa] hover:bg-[#202026] hover:border-[#3e3e4a]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-100 font-serif">{preset.title}</span>
                      </div>
                      <span className="text-xs text-[#71717a] mt-1 leading-normal">{preset.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {selectedCampaign.type === 'custom' && (
                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-[#52525b] font-sans font-bold">Describe Your World</label>
                  <textarea
                    placeholder="e.g. Set in deep cosmic wasteland where neon elves fight steam cyber-goblins..."
                    value={customCampaignDetail}
                    onChange={(e) => setCustomCampaignDetail(e.target.value)}
                    className="w-full p-3 h-24 bg-bg-base border border-panel-border rounded-xl text-sm text-white focus:outline-none focus:border-arcane-primary"
                  />
                </div>
              )}

              {/* Difficulty */}
              <div className="space-y-2">
                <label className="text-[10px] uppercase text-[#52525b] font-sans font-bold block">Game Danger Level</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['casual', 'standard', 'hard', 'unforgiving'] as const).map(diff => (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => setDifficultySetting(diff)}
                      className={`py-2 px-1 text-xs font-semibold rounded-lg border capitalize transition cursor-pointer ${
                        difficultySetting === diff
                          ? 'bg-arcane-primary/20 border-arcane-primary/60 text-arcane-primary'
                          : 'bg-bg-base border-panel-border hover:bg-[#202026] text-[#71717a]'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleCreateOnlineRoom}
                disabled={loading}
                className="w-full py-4 px-6 bg-arcane-primary hover:bg-[#6c4fff] text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm transition-all shadow-[0_0_20px_rgba(126,97,255,0.2)] cursor-pointer uppercase tracking-widest font-sans"
                id="btn-create-room-submit"
              >
                <Sparkles className="w-5 h-5 text-white" />
                {loading ? "Generating Dungeon..." : "Host Campaign & Generate Lobby"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3A: LOCAL PARTY CREATOR CHASSIS */}
      {setupMode === 'local_setup' && (
        <div className="space-y-8" id="local-setup-panel">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setSetupMode('welcome')} className="p-2 hover:bg-[#25252b] border border-panel-border rounded-lg text-gray-400 hover:text-white cursor-pointer transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-2xl font-bold text-gray-100 font-serif">Local Campaign Builder</h2>
                <p className="text-xs text-[#a1a1aa] font-sans">Assemble your local hero party and set the scene</p>
              </div>
            </div>

            <button
              onClick={startLocalAdventure}
              disabled={loading || localParty.length === 0}
              className="py-3 px-6 bg-gradient-to-r from-arcane-primary to-arcane-secondary hover:opacity-95 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(126,97,255,0.3)] transition cursor-pointer font-sans text-sm uppercase tracking-wide"
            >
              <Play className="w-4 h-4 fill-white text-white" />
              {loading ? "DM Loading..." : "Embark on Adventure!"}
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Setting Config Columns */}
            <div className="bg-panel-card/85 backdrop-blur-md border border-panel-border rounded-2xl p-5 space-y-6">
              <h3 className="font-bold text-gray-200 border-b border-panel-border pb-2 font-serif text-md">1. Campaign Specs</h3>
              
              <div className="space-y-3">
                <label className="text-[10px] uppercase tracking-wider text-gray-400 font-bold block font-sans">Setting Preset</label>
                <div className="space-y-2">
                  {CAMPAIGN_PRESETS.map((p) => (
                    <button
                      key={p.type}
                      onClick={() => setSelectedCampaign(p)}
                      className={`w-full p-2.5 text-left rounded-lg text-xs border transition cursor-pointer ${
                        selectedCampaign.type === p.type
                          ? 'bg-arcane-primary/15 border-arcane-primary/40 text-white'
                          : 'bg-bg-base border-panel-border text-[#a1a1aa] hover:bg-[#202026]'
                      }`}
                    >
                      <div className="font-bold text-gray-100 font-serif text-xs">{p.title}</div>
                      <div className="text-[10px] text-[#71717a] mt-0.5 line-clamp-1">{p.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedCampaign.type === 'custom' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase text-gray-400 font-bold block font-sans">Custom Theme Description</label>
                  <textarea
                    placeholder="e.g. Victorian era clockwork airship heist..."
                    value={customCampaignDetail}
                    onChange={(e) => setCustomCampaignDetail(e.target.value)}
                    className="w-full p-2 h-16 bg-bg-base border border-panel-border text-xs text-white rounded focus:outline-none focus:border-arcane-primary font-sans"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase text-gray-400 font-bold block font-sans">Risk Difficulty</label>
                <select
                  value={difficultySetting}
                  onChange={(e: any) => setDifficultySetting(e.target.value)}
                  className="w-full p-2 bg-bg-base border border-panel-border hover:border-[#3e3e4a] text-xs text-white rounded focus:outline-none font-sans cursor-pointer"
                >
                  <option value="casual" className="bg-[#16161a]">Casual (Friendly Story)</option>
                  <option value="standard" className="bg-[#16161a]">Standard (Balancing Rules)</option>
                  <option value="hard" className="bg-[#16161a]">Hard (Brutal Traps & Monsters)</option>
                  <option value="unforgiving" className="bg-[#16161a]">Unforgiving (Insane Death Hazards)</option>
                </select>
              </div>
            </div>

            {/* Character Design Box */}
            <div className="bg-panel-card/85 backdrop-blur-md border border-panel-border rounded-2xl p-5 space-y-6 md:col-span-2">
              <div className="flex justify-between items-center border-b border-panel-border pb-2">
                <h3 className="font-bold text-gray-200 font-serif text-md">2. Recruits roster / Custom builder</h3>
                <span className="text-[10px] bg-[#25252b] border border-panel-border text-arcane-secondary px-2.5 py-0.5 rounded-full font-mono font-bold">
                  {localParty.length} Slots Filled
                </span>
              </div>

              {/* Presets loader */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#71717a] block font-sans">Apply Hot Preset Recruits</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PRESET_CHARACTERS.map((pre) => (
                    <button
                      key={pre.name}
                      onClick={() => applyPresetCharacter(pre)}
                      className="p-2 bg-bg-base hover:bg-[#202026] border border-panel-border hover:border-arcane-primary/40 rounded-lg text-left text-xs text-gray-300 cursor-pointer transition-colors"
                    >
                      <div className="font-bold text-arcane-primary truncate font-serif">{pre.name.split(' ')[0]}</div>
                      <div className="text-[10px] text-[#71717a] truncate font-sans">{pre.class}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Input */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-400 uppercase font-bold block font-sans">Hero's Name</label>
                  <input
                    type="text"
                    placeholder="Legolas Skygazer"
                    value={charName}
                    onChange={(e) => setCharName(e.target.value)}
                    className="w-full p-2 bg-bg-base border border-panel-border focus:border-arcane-primary rounded text-sm text-white focus:outline-none font-sans"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-400 uppercase font-bold block font-sans">Race</label>
                    <input
                      type="text"
                      placeholder="Elf"
                      value={charRace}
                      onChange={(e) => setCharRace(e.target.value)}
                      className="w-full p-2 bg-bg-base border border-panel-border rounded text-sm text-white focus:outline-none font-sans"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-400 uppercase font-bold block font-sans">Class</label>
                    <input
                      type="text"
                      placeholder="Arcane Wizard"
                      value={charClass}
                      onChange={(e) => setCharClass(e.target.value)}
                      className="w-full p-2 bg-bg-base border border-panel-border rounded text-sm text-white focus:outline-none font-sans"
                    />
                  </div>
                </div>
              </div>

              {/* Backstory & HP */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-[10px] text-gray-400 uppercase font-bold block font-sans">Compact Biography / Motivation</label>
                  <textarea
                    placeholder="A rugged rogue seeking magical treasure to pay off astronomical castle debts..."
                    value={charBackstory}
                    onChange={(e) => setCharBackstory(e.target.value)}
                    className="w-full p-2 h-14 bg-bg-base border border-panel-border rounded text-xs text-white focus:outline-none font-sans"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-400 uppercase font-bold block font-sans">Base Vitality (HP)</label>
                  <input
                    type="number"
                    min={4}
                    max={40}
                    value={charHp}
                    onChange={(e) => setCharHp(parseInt(e.target.value) || 10)}
                    className="w-full p-2 bg-bg-base border border-panel-border rounded text-sm text-white focus:outline-none font-sans"
                  />
                </div>
              </div>

              {/* Stats & Equipment */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-panel-border">
                {/* Attributes */}
                <div className="space-y-3">
                  <label className="text-[10px] text-gray-400 uppercase font-bold block font-sans">Attributes (Mod Base)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.keys(charStats).map((statKey) => {
                      const k = statKey as keyof CharacterStats;
                      return (
                        <div key={k} className="bg-bg-base p-2 border border-panel-border rounded flex flex-col items-center">
                          <span className="text-[9px] uppercase text-[#71717a] font-mono tracking-wider">{k}</span>
                          <span className="text-sm font-bold text-arcane-primary my-0.5 font-sans">{charStats[k]}</span>
                          <div className="flex gap-1.5 mt-1">
                            <button onClick={() => modifyStat(k, -1)} className="px-1 text-[10px] bg-[#25252b] border border-panel-border text-white rounded hover:bg-[#34343d] transition-colors cursor-pointer">-</button>
                            <button onClick={() => modifyStat(k, 1)} className="px-1 text-[10px] bg-[#25252b] border border-panel-border text-white rounded hover:bg-[#34343d] transition-colors cursor-pointer">+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Equipment list */}
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-400 uppercase font-bold block font-sans">Starting Gear Pack</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add armor or items"
                      value={newEquipmentItem}
                      onChange={(e) => setNewEquipmentItem(e.target.value)}
                      className="flex-1 p-2 bg-bg-base border border-panel-border rounded text-xs text-white focus:outline-none font-sans"
                    />
                    <button onClick={handleAddEquipment} className="px-3 bg-[#25252b] hover:bg-[#34343d] border border-panel-border text-gray-150 rounded text-xs cursor-pointer transition-colors">+</button>
                  </div>
                  <div className="max-h-24 overflow-y-auto space-y-1 bg-bg-base p-2 rounded border border-panel-border">
                    {equipmentList.map((item, id) => (
                      <div key={id} className="flex justify-between items-center text-[11px] text-[#a1a1aa] pl-1 font-sans">
                        <span>• {item}</span>
                        <button onClick={() => handleRemoveEquipment(id)} className="text-[9px] text-[#ff4b72] hover:text-[#ff3863] px-1 transition-colors cursor-pointer font-bold">Remove</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={handleAddLocalCharacter}
                  className="py-2.5 px-6 bg-arcane-primary/10 hover:bg-arcane-primary/18 border border-arcane-primary/35 text-arcane-primary font-bold rounded-lg text-xs tracking-wider uppercase shadow flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Plus className="w-4 h-4 text-arcane-primary" />
                  Add recruit to party roster
                </button>
              </div>

              {/* Current Active Local Party List */}
              {localParty.length > 0 && (
                <div className="bg-bg-base p-4 border border-panel-border rounded-xl space-y-2">
                  <h4 className="text-[10px] text-gray-400 tracking-wider uppercase font-bold block font-sans">The Active Hero Party roster ({localParty.length})</h4>
                  <div className="grid sm:grid-cols-2 gap-3 max-h-40 overflow-y-auto">
                    {localParty.map((char, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-panel-card border border-panel-border rounded-lg">
                        <div>
                          <div className="font-bold text-sm text-gray-100 font-serif">{char.name}</div>
                          <div className="text-xs text-[#a1a1aa] font-sans">{char.race} {char.class} (HP: {char.hp})</div>
                        </div>
                        <button
                          onClick={() => setLocalParty(prev => prev.filter((_, i) => i !== index))}
                          className="p-1.5 hover:bg-red-950/20 rounded text-[#ff4b72] cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STEP 3B: ONLINE LOBBY ROOM PREPARATION SHEET */}
      {setupMode === 'join_room' && onlineSession && (
        <div className="bg-panel-card/85 backdrop-blur-md border border-panel-border rounded-2xl p-8 space-y-8 shadow-xl" id="online-lobby-panel">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-panel-border pb-5">
            <div>
              <div className="inline-flex items-center gap-1 bg-arcane-secondary/10 border border-arcane-secondary/35 px-2.5 py-0.5 rounded text-[10px] text-arcane-secondary font-sans tracking-widest font-bold mb-1.5 uppercase">
                ONLINE MULTIPLAYER ROOM ACTIVE
              </div>
              <h2 className="text-2xl font-bold text-gray-100 font-serif">Lobby Waiting Lounge</h2>
            </div>
            
            {/* LARGE ROOM CODE BADGE */}
            <div className="flex flex-col items-center bg-bg-base px-6 py-2 border border-panel-border rounded-xl">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold font-sans">ROOM CODE</span>
              <span className="text-3xl font-black tracking-widest text-arcane-primary font-sans">{onlineSession.roomCode}</span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Joining Character Selection Side Column */}
            {!myOnlineCharacter ? (
              <div className="md:col-span-2 space-y-6">
                <h3 className="font-bold text-lg text-gray-200 font-serif">Prepare Your Character</h3>
                <p className="text-xs text-[#a1a1aa] leading-relaxed font-sans">Choose a pre-defined hero or type your custom details to enter the lounge pool.</p>

                {/* Player details */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-gray-400 uppercase font-bold font-sans tracking-wide block">Your Player Nickname</label>
                    <input
                      type="text"
                      placeholder="My Player Name"
                      value={playerNameInput}
                      onChange={(e) => setPlayerNameInput(e.target.value)}
                      className="w-full p-2 bg-bg-base border border-panel-border focus:border-arcane-primary rounded text-sm text-white focus:outline-none font-sans"
                    />
                  </div>

                  {/* Preset Selector inside Lounge */}
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold text-gray-400 font-sans tracking-wide block">Lounge Hero Presets</span>
                    <div className="grid grid-cols-2 gap-2">
                      {PRESET_CHARACTERS.map((pre) => (
                        <button
                          key={pre.name}
                          onClick={() => applyPresetCharacter(pre)}
                          className="p-2.5 bg-bg-base hover:bg-[#202026] border border-panel-border hover:border-arcane-primary/40 text-left rounded-lg transition text-xs cursor-pointer"
                        >
                          <div className="font-bold text-arcane-primary font-serif truncate">{pre.name}</div>
                          <div className="text-[10px] text-[#71717a] font-sans truncate">{pre.race} {pre.class} (HP: {pre.hp})</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Character Custom Columns */}
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-panel-border">
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold text-gray-400 font-sans block">Character Name</label>
                      <input
                        type="text"
                        placeholder="John the Mage"
                        value={charName}
                        onChange={(e) => setCharName(e.target.value)}
                        className="w-full p-2 bg-bg-base border border-panel-border rounded text-sm text-white focus:outline-none font-sans"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-gray-400 font-sans block">Race</label>
                        <input
                          type="text"
                          value={charRace}
                          onChange={(e) => setCharRace(e.target.value)}
                          className="w-full p-2 bg-bg-base border border-panel-border rounded text-sm text-white focus:outline-none font-sans"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] uppercase font-bold text-gray-400 font-sans block">Class</label>
                        <input
                          type="text"
                          value={charClass}
                          onChange={(e) => setCharClass(e.target.value)}
                          className="w-full p-2 bg-bg-base border border-panel-border rounded text-sm text-white focus:outline-none font-sans"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-bold text-gray-400 font-sans block">Bio & Motivations</label>
                    <textarea
                      placeholder="Brief details of your origins..."
                      value={charBackstory}
                      onChange={(e) => setCharBackstory(e.target.value)}
                      className="w-full p-2 h-14 bg-bg-base border border-panel-border rounded text-xs text-white focus:outline-none font-sans"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={submitOnlineJoin}
                      disabled={loading}
                      className="w-full py-3 bg-arcane-primary hover:bg-[#6c4fff] text-white font-bold rounded-xl text-xs uppercase tracking-widest font-sans transition-all shadow-[0_0_15px_rgba(126,97,255,0.2)] cursor-pointer"
                    >
                      {loading ? "Registering Character..." : "Secure Slot in Active Room"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="md:col-span-2 space-y-6 bg-bg-base p-6 border border-panel-border rounded-xl">
                <div className="flex items-center gap-2 text-[#4ade80] text-[10px] uppercase tracking-wider font-bold font-sans">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                  Your character is linked dynamically!
                </div>
                <div>
                  <h3 className="text-xl font-bold text-arcane-primary font-serif">{myOnlineCharacter.name}</h3>
                  <span className="text-xs text-[#a1a1aa] font-sans">Level 1 {myOnlineCharacter.race} {myOnlineCharacter.class} controlled by <span className="text-white font-semibold">{playerNameInput || "you"}</span></span>
                </div>
                <div className="text-xs text-[#a1a1aa] leading-relaxed italic bg-panel-card p-3 rounded border border-panel-border font-sans">
                  "{myOnlineCharacter.backstory || "No backstory entered."}"
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] text-gray-400 uppercase font-mono tracking-wider font-bold block">Allocated Equipment Backpack</span>
                  <div className="flex flex-wrap gap-1.5">
                    {myOnlineCharacter.equipment?.map((eq, ii) => (
                      <span key={ii} className="px-2 py-0.5 bg-panel-card border border-panel-border text-[#d1d1d1] text-[10px] rounded font-sans">
                        {eq}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-panel-border flex justify-between items-center">
                  <p className="text-xs text-[#71717a] font-sans">Waiting for other players or for room host to initiate narrative launch.</p>
                </div>
              </div>
            )}

            {/* Current Lobby Pool Column */}
            <div className="bg-bg-base/60 p-5 rounded-2xl border border-panel-border flex flex-col h-full justify-between">
              <div className="space-y-4">
                <div className="border-b border-panel-border pb-2.5">
                  <h4 className="font-bold text-gray-200 text-sm font-serif">Joined Adventurers</h4>
                  <p className="text-[10px] text-zinc-500 font-sans">Lobby synchronize feed</p>
                </div>

                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {onlineSession.characters.length === 0 ? (
                    <div className="text-center py-8 text-xs text-zinc-500 italic font-sans animate-pulse">No companions have entered the lobby yet.</div>
                  ) : (
                    onlineSession.characters.map((char) => (
                      <div key={char.id} className="p-3 bg-panel-card border border-panel-border rounded-xl flex justify-between items-center">
                        <div>
                          <div className="font-bold text-xs text-gray-200 font-serif">{char.name}</div>
                          <div className="text-[10px] text-[#a1a1aa] font-sans">{char.race} • {char.class}</div>
                        </div>
                        <span className="text-[9px] bg-bg-base border border-panel-border px-2 py-0.5 rounded text-arcane-secondary font-sans font-semibold">
                          {char.ownerName}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Host Control Actions */}
              {myOnlineCharacter && (
                <div className="pt-6 border-t border-panel-border mt-4 space-y-3">
                  <div className="text-[10px] text-[#71717a] text-center font-sans">Settings: {onlineSession.settings.campaignType} ({onlineSession.settings.difficulty})</div>
                  <button
                    onClick={launchOnlineAdventure}
                    disabled={loading || onlineSession.characters.length === 0}
                    className="w-full py-4 text-white bg-gradient-to-r from-arcane-primary to-arcane-secondary hover:opacity-95 disabled:opacity-50 font-extrabold text-xs uppercase rounded-xl shadow-lg transition-all tracking-widest flex items-center justify-center gap-2 cursor-pointer font-sans"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    {loading ? "Starting Story..." : "Host: Initiate Act I!"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
