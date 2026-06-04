/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GameSession, Character, MainStorySegment, DmOutcome } from '../types';
import { 
  Dices, 
  Sparkles, 
  MapPin, 
  Heart, 
  ShieldAlert, 
  Compass, 
  Send, 
  CheckCircle, 
  RotateCcw, 
  Image as ImageIcon, 
  Loader2, 
  Info,
  Calendar,
  Users
} from 'lucide-react';

interface GameArenaProps {
  initialSession: GameSession;
  myCharacterId: string | null; // Null if playing Local Controller Mode
  isLocalMode: boolean;
  onExitGame: () => void;
}

export default function GameArena({ initialSession, myCharacterId, isLocalMode, onExitGame }: GameArenaProps) {
  const [session, setSession] = useState<GameSession>(initialSession);
  const [loading, setLoading] = useState(false);
  const [errorString, setErrorString] = useState<string | null>(null);

  // Active inputs map for character actions (key: characterId -> value: action text)
  const [characterActions, setCharacterActions] = useState<Record<string, string>>({});
  
  // Scenery generation indicators
  const [imageGenerating, setImageGenerating] = useState<Record<number, boolean>>({});

  // Story scroll anchor reference
  const logEndRef = useRef<HTMLDivElement | null>(null);

  // Poll intervals for online multiplayer
  useEffect(() => {
    if (isLocalMode) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/room/state/${session.roomCode}`);
        if (res.ok) {
          const updatedSession: GameSession = await res.json();
          setSession(updatedSession);
        }
      } catch (err) {
        console.warn("Error polling active game state:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isLocalMode, session.roomCode]);

  // Scroll to bottom on story updates
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.storyHistory.length]);

  // Check if current user is ready (for Online mode)
  const myCharacter = myCharacterId 
    ? session.characters.find(c => c.id === myCharacterId) 
    : null;

  // Handle Action Text change
  const handleActionChange = (charId: string, text: string) => {
    setCharacterActions(prev => ({ ...prev, [charId]: text }));
  };

  // Submit Action for a specific character (Works in both Local and Online)
  const submitSingleAction = async (charId: string) => {
    const actionText = characterActions[charId]?.trim() || "";
    if (!actionText) return;

    try {
      const res = await fetch("/api/room/submit-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode: session.roomCode,
          characterId: charId,
          action: actionText
        })
      });

      if (!res.ok) throw new Error("Could not submit action input.");
      const updatedSession = await res.json();
      setSession(updatedSession);
    } catch (err: any) {
      setErrorString(err.message);
    }
  };

  // Submit combined actions for AI DM to roll (or triggers next round evaluation)
  const submitRoundTurnResolution = async () => {
    // If in local mode, submit any remaining written actions first
    if (isLocalMode) {
      setLoading(true);
      setErrorString(null);
      try {
        // Run sequential submissions for local party
        for (const char of session.characters) {
          const act = characterActions[char.id]?.trim();
          if (act) {
            await fetch("/api/room/submit-action", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                roomCode: session.roomCode,
                characterId: char.id,
                action: act
              })
            });
          }
        }

        // Call DM query
        const res = await fetch("/api/room/submit-dm-query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode: session.roomCode })
        });

        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || "The AI Dungeon Master was unable to resolve this round's events.");
        }

        const resolvedSession = await res.json();
        setSession(resolvedSession);
        // Clear inputs
        setCharacterActions({});
      } catch (err: any) {
        setErrorString(err.message);
      } finally {
        setLoading(false);
      }
    } else {
      // Online mode logic
      setLoading(true);
      setErrorString(null);
      try {
        const res = await fetch("/api/room/submit-dm-query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode: session.roomCode })
        });

        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || "Failed to trigger DM resolution. Check if everyone is ready.");
        }

        const resolvedSession = await res.json();
        setSession(resolvedSession);
        setCharacterActions({});
      } catch (err: any) {
        setErrorString(err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  // Generate scenic vector/art for the current round
  const handleGenerateScenery = async (roundNum: number, currentPlot: string) => {
    setImageGenerating(prev => ({ ...prev, [roundNum]: true }));
    try {
      const res = await fetch("/api/room/generate-scenery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode: session.roomCode,
          sceneDescription: currentPlot.substring(0, 450) // pass contextual description summary
        })
      });

      if (!res.ok) throw new Error("Scenery engine failed to output artwork.");
      const data = await res.json();
      
      setSession(prev => {
        const nextHist = [...prev.storyHistory];
        const match = nextHist.find(h => h.roundNumber === roundNum);
        if (match) {
          match.sceneImageUrl = data.imageUrl;
        }
        return { ...prev, storyHistory: nextHist };
      });
    } catch (err: any) {
      console.error("Scenic Art Error:", err);
    } finally {
      setImageGenerating(prev => ({ ...prev, [roundNum]: false }));
    }
  };

  // Calculation for dice coloring
  const getOutcomeStyle = (success: boolean, roll: number) => {
    if (roll === 20) return "text-emerald-400 border-emerald-500/50 bg-emerald-950/20";
    if (roll === 1) return "text-rose-400 border-rose-500/50 bg-rose-950/20";
    return success
      ? "text-arcane-primary border-panel-border bg-arcane-primary/5"
      : "text-zinc-500 border-panel-border bg-[#16161a]";
  };

  return (
    <div className="w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 pb-20 px-4" id="game-arena-root">
      
      {/* LEFT & CENTER COUMNS: CAMPAIGN STORY LOG */}
      <div className="lg:col-span-2 space-y-6 flex flex-col h-[82vh]" id="story-log-container">
        
        {/* Campaign Arena header */}
        <div className="bg-panel-card/85 backdrop-blur-md border border-panel-border rounded-2xl p-4 flex justify-between items-center shadow-lg">
          <div className="space-y-1">
            <span className="text-[10px] text-arcane-primary tracking-widest font-bold uppercase font-sans">CAMPAIGN STORY BOARD</span>
            <h2 className="text-xl font-bold text-gray-100 truncate max-w-sm font-serif">{session.campaignTitle}</h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end text-right font-sans">
              <span className="text-[9px] text-[#71717a] font-bold uppercase tracking-wider block">CURRENT LANDSCAPE</span>
              <span className="text-xs text-[#d1d1d1] flex items-center gap-1 font-serif">
                <MapPin className="w-3.5 h-3.5 text-arcane-secondary" />
                {session.currentLocation}
              </span>
            </div>
            
            <div className="h-8 w-px bg-panel-border" />

            <div className="bg-arcane-primary/15 border border-arcane-primary/35 px-3 py-1 rounded-lg text-arcane-primary text-xs font-bold font-sans tracking-wide">
              ROUND {session.currentRound - 1}
            </div>
          </div>
        </div>

        {errorString && (
          <div className="p-3 bg-red-950/40 border border-red-500/30 text-red-300 text-xs rounded-xl flex items-center justify-between shadow-lg">
            <span>{errorString}</span>
            <button onClick={() => setErrorString(null)} className="font-semibold text-[11px] hover:underline px-2">Clear</button>
          </div>
        )}

        {/* Chronological Campaign Scroll Log */}
        <div className="flex-1 overflow-y-auto pr-2 space-y-8 min-h-0 bg-[#131317]/40 p-4 rounded-xl border border-panel-border/40" id="story-scroll-pane">
          {session.storyHistory.map((seg, idx) => (
            <div key={idx} className="space-y-5 border-l-2 border-panel-border pl-5 relative last:border-arcane-secondary/40">
              
              {/* Vertical connector bullet */}
              <div className="absolute -left-1.5 top-1.5 w-2.5 h-2.5 rounded-full bg-arcane-primary border border-bg-base shadow-[0_0_8px_rgba(126,97,255,0.8)]" />

              {/* Header Segment Label */}
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest font-sans">
                  {seg.roundNumber === 0 ? "Prologue Introduction" : `Round ${seg.roundNumber} Turn Outcome`}
                </span>

                {seg.combatActive && (
                  <span className="text-[10px] bg-rose-955/20 text-rose-400 border border-red-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 font-sans font-bold uppercase tracking-wider">
                    <ShieldAlert className="w-3 h-3 text-rose-450" />
                    COMBAT ENCOUNTER LIVE
                  </span>
                )}
              </div>

              {/* Scenic Image Display */}
              {seg.sceneImageUrl ? (
                <div className="w-full h-48 sm:h-64 rounded-xl overflow-hidden border border-panel-border shadow-md transform hover:scale-[1.01] transition-transform duration-300 relative group">
                  <img 
                    src={seg.sceneImageUrl} 
                    alt="Current D&D visual setting context" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-bg-base via-transparent to-transparent opacity-95" />
                  <p className="absolute bottom-2 left-3 right-3 text-[10px] text-zinc-350 italic truncate font-sans">
                    Scenic visual: "{seg.sceneDescription || 'Atmospheric campaign room'}"
                  </p>
                </div>
              ) : (
                <div className="bg-panel-card border border-panel-border rounded-xl p-3.5 flex justify-between items-center text-xs text-[#a1a1aa] font-sans">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-zinc-400" />
                    <span>Scenery painting is unrendered. Let Gemini illustrate this setting?</span>
                  </div>
                  <button
                    onClick={() => handleGenerateScenery(seg.roundNumber, seg.dmPlot)}
                    disabled={imageGenerating[seg.roundNumber]}
                    className="py-1 px-3.5 bg-bg-base hover:bg-[#202026] disabled:opacity-50 text-[10px] uppercase tracking-wider font-bold text-white rounded-lg border border-panel-border hover:border-arcane-primary transition flex items-center gap-1.5 cursor-pointer"
                  >
                    {imageGenerating[seg.roundNumber] ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-arcane-primary" />
                        Coloring Canvas...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-arcane-primary" />
                        Paint Scenery Painting
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* DM Main storytelling Markdown string */}
              <div 
                className="text-gray-300 text-sm leading-relaxed tracking-wide font-sans prose prose-invert max-w-none prose-sm"
                id={`dm-plot-round-${seg.roundNumber}`}
              >
                {/* Simulated lightweight markdown parser for D&D styles */}
                {seg.dmPlot.split('\n').map((paragraph, pIdx) => {
                  if (!paragraph.trim()) return null;
                  
                  // Format custom **bold** and *italics*
                  let parsed = paragraph
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>');

                  return (
                    <p 
                      key={pIdx} 
                      className="mb-4 text-gray-200 font-sans leading-relaxed text-sm md:text-[15px] font-normal" 
                      dangerouslySetInnerHTML={{ __html: parsed }} 
                    />
                  );
                })}
              </div>

              {/* SIMULTANEOUS INDIVIDUAL PLAYER ROLL OUTCOMES SHOWCASE */}
              {seg.outcomes && seg.outcomes.length > 0 && (
                <div className="bg-[#16161c] p-4 border border-panel-border rounded-xl space-y-3">
                  <span className="text-[10px] text-gray-400 uppercase font-sans tracking-widest font-bold block border-b border-panel-border pb-2">
                    Cooperative Simultaneous Actions Compilation & Ruling Modifiers
                  </span>
                  
                  <div className="grid gap-3 sm:grid-cols-2">
                    {seg.outcomes.map((out, oIdx) => {
                      const diceStyle = getOutcomeStyle(out.success, out.rollValue);
                      const isCritSuccess = out.rollValue === 20;
                      const isCritFail = out.rollValue === 1;

                      return (
                        <div key={oIdx} className="bg-panel-card border border-panel-border p-3.5 rounded-xl flex gap-3 text-xs leading-normal">
                          {/* Dice Badge visual */}
                          <div className={`p-2.5 h-fit border rounded-lg flex flex-col items-center justify-center font-sans font-black ${diceStyle}`}>
                            <Dices className="w-4 h-4 mb-1 text-inherit" />
                            <span className="text-sm">{out.totalRoll}</span>
                            <span className="text-[8px] text-zinc-500">d20:{out.rollValue}</span>
                          </div>

                          <div className="flex-1 space-y-1">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="font-bold text-zinc-100 font-serif">{out.characterName}</span>
                                <div className="text-[9px] text-[#71717a] mt-0.5">{out.rollName || 'Ability Test'}</div>
                              </div>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-sans uppercase font-bold tracking-wider ${
                                out.success ? 'bg-arcane-primary/10 text-arcane-primary border border-arcane-primary/20' : 'bg-rose-950/30 text-rose-455 border border-rose-500/20'
                              }`}>
                                {isCritSuccess ? "✨ CRIT SUCCESS" : isCritFail ? "💀 CRIT FAIL" : out.success ? "Success" : "Failure"}
                              </span>
                            </div>

                            <p className="text-[11px] text-[#a1a1aa] leading-snug font-sans">
                              {out.actionOutcome}
                            </p>

                            <div className="text-[9px] text-zinc-500 font-mono flex gap-2">
                              <span>DC: {out.dc}</span>
                              <span>•</span>
                              <span>Stat Mod: {out.rollBonus >= 0 ? `+${out.rollBonus}` : out.rollBonus}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Status summary tracker */}
              {seg.partyStatusSummary && (
                <div className="p-3 bg-panel-card rounded-lg text-[10px] text-zinc-350 font-sans border-l-2 border-arcane-secondary/60 border border-panel-border/50 flex gap-1.5 items-center">
                  <Info className="w-3.5 h-3.5 text-arcane-secondary shrink-0" />
                  <span>{seg.partyStatusSummary}</span>
                </div>
              )}
            </div>
          ))}

          <div ref={logEndRef} />
        </div>
      </div>

      {/* RIGHT SIDE PANEL: USER CONTROLLERS & STATS INSIGHTS */}
      <div className="space-y-6" id="arena-control-sidebar">
        
        {/* Active room connection sheet */}
        {!isLocalMode && (
          <div className="bg-panel-card/85 border border-panel-border rounded-2xl p-4 space-y-3 shadow-md text-xs">
            <div className="flex justify-between items-center text-[10px] text-gray-450 font-sans font-bold tracking-widest uppercase border-b border-panel-border pb-2.5">
              <span>MULTIPLAYER ROOM SECTORS</span>
              <span className="text-arcane-primary font-black font-mono tracking-wider">{session.roomCode}</span>
            </div>
            
            <div className="space-y-1.5">
              {session.characters.map((c) => (
                <div key={c.id} className="flex justify-between items-center p-2.5 bg-bg-base/50 rounded-lg border border-panel-border/65 pl-3">
                  <span className="font-bold text-zinc-300 font-serif text-xs">{c.name}</span>
                  <div className="flex items-center gap-1.5">
                    {c.isPrepared ? (
                      <span className="px-2 py-0.5 bg-arcane-secondary/15 border border-arcane-secondary/30 text-[8px] text-arcane-secondary uppercase tracking-widest font-sans font-bold rounded">
                        Ready
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-bg-base border border-panel-border text-[8px] text-zinc-500 uppercase tracking-widest font-sans rounded">
                        Pondering
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* HERO FAMILY HP VITAL MONITOR */}
        <div className="bg-panel-card/85 backdrop-blur-md border border-panel-border p-5 rounded-2xl space-y-4 shadow-md">
          <h3 className="text-xs uppercase text-gray-400 tracking-widest font-bold border-b border-panel-border font-serif pb-2">
            PARTY VITALS TRACKER
          </h3>

          <div className="space-y-3.5">
            {session.characters.map((char) => {
              const hpPct = Math.max(0, Math.min(100, (char.hp / char.maxHp) * 100));
              const isIncapped = char.hp === 0;

              return (
                <div key={char.id} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-sans">
                    <div>
                      <span className="font-bold text-gray-100 font-serif">{char.name}</span>
                      <span className="text-[10px] text-[#71717a] ml-1.5">Level 1 {char.class}</span>
                    </div>

                    <span className={`font-semibold text-xs ${isIncapped ? "text-rose-500" : "text-arcane-secondary"}`}>
                      {isIncapped ? "Incapacitated / 0" : `${char.hp}/${char.maxHp}`} HP
                    </span>
                  </div>

                  {/* Health Bar */}
                  <div className="w-full h-2 bg-[#131317] rounded-full overflow-hidden border border-panel-border relative">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        isIncapped 
                          ? "bg-rose-950" 
                          : hpPct < 30 
                            ? "bg-rose-500" 
                            : hpPct < 65 
                              ? "bg-arcane-primary" 
                              : "bg-[#10b981]"
                      }`} 
                      style={{ width: `${hpPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CONTROLLERS CONSOLE: SUBMIT ACTION INPUT FLUID */}
        <div className="bg-panel-card/85 border border-panel-border p-5 rounded-2xl space-y-6 shadow-md transition-all">
          <div className="border-b border-panel-border pb-2.5">
            <h3 className="font-bold text-sm text-gray-100 font-serif">Simultaneous Actions Deck</h3>
            <p className="text-[10px] text-[#a1a1aa] leading-normal font-sans">
              Instead of selecting choices, describe exactly how your character handles the immediate crisis.
            </p>
          </div>

          <div className="space-y-5">
            {isLocalMode ? (
              // Local mode: Renders action text area for EVERY Slot in the party
              session.characters.map((char) => (
                <div key={char.id} className="space-y-2 p-3 bg-bg-base/40 border border-panel-border rounded-xl">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-arcane-primary font-serif">{char.name} ({char.class})</span>
                    {char.isPrepared ? (
                      <span className="text-[9px] text-arcane-secondary flex items-center gap-1 font-sans font-semibold">
                        <CheckCircle className="w-3 h-3 text-arcane-secondary" /> Action Stored
                      </span>
                    ) : (
                      <span className="text-[9px] text-[#71717a] font-sans">Unready</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <textarea
                      placeholder={`e.g. I try to decipher the cave wall runes using my Arcana background...`}
                      value={characterActions[char.id] || ""}
                      onChange={(e) => handleActionChange(char.id, e.target.value)}
                      disabled={loading}
                      className="flex-1 p-2 bg-bg-base border border-panel-border focus:border-arcane-primary text-xs text-white rounded-lg h-16 resize-none focus:outline-none placeholder-zinc-500 font-sans"
                    />
                    <button
                      onClick={() => submitSingleAction(char.id)}
                      disabled={loading || !characterActions[char.id]?.trim()}
                      className="px-3 bg-bg-base hover:bg-[#202026] border border-panel-border hover:border-arcane-primary/40 disabled:opacity-50 text-arcane-primary rounded-lg flex items-center justify-center transition shrink-0 cursor-pointer"
                    >
                      <Send className="w-4 h-4 text-arcane-primary" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              // Online mode: Renders action input area ONLY for users linked character
              myCharacter ? (
                <div className="space-y-3 p-4 bg-bg-base/60 border border-panel-border rounded-xl">
                  <div className="flex justify-between items-center border-b border-panel-border pb-2">
                    <span className="font-bold text-xs text-arcane-primary font-serif">{myCharacter.name} ({myCharacter.class})</span>
                    {myCharacter.isPrepared ? (
                      <span className="text-[9px] text-arcane-secondary flex items-center gap-1 font-sans font-semibold">
                        <CheckCircle className="w-3 h-3 text-arcane-secondary" /> Action Sent to DM
                      </span>
                    ) : (
                      <span className="text-[9px] text-[#71717a] font-sans">Pending Submission</span>
                    )}
                  </div>

                  <textarea
                    placeholder={`Describe your next heroic action in this scene...`}
                    value={characterActions[myCharacter.id] || ""}
                    onChange={(e) => handleActionChange(myCharacter.id, e.target.value)}
                    disabled={loading}
                    className="w-full p-2 bg-bg-base border border-panel-border focus:border-arcane-primary text-xs text-zinc-100 rounded-lg h-20 resize-none focus:outline-none placeholder-zinc-500 font-sans"
                  />

                  <button
                    onClick={() => submitSingleAction(myCharacter.id)}
                    disabled={loading || !characterActions[myCharacter.id]?.trim()}
                    className="w-full py-2 bg-bg-base hover:bg-[#202026] border border-panel-border text-arcane-primary hover:border-arcane-primary text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                  >
                    <Send className="w-4 h-4 text-arcane-primary" />
                    Lock Action & Prepare Character
                  </button>
                </div>
              ) : (
                <div className="text-xs text-center py-4 bg-bg-base rounded italic text-zinc-500 border border-panel-border font-sans">
                  Observe and await as players or hosts construct elements.
                </div>
              )
            )}

            {/* GRAND RESOLUTION CALL BUTTON */}
            <div className="pt-4 border-t border-panel-border space-y-3">
              <button
                onClick={submitRoundTurnResolution}
                disabled={loading}
                className="w-full py-4 px-6 bg-gradient-to-r from-arcane-primary to-arcane-secondary hover:opacity-95 text-white font-bold text-xs uppercase tracking-widest rounded-xl shadow-[0_0_15px_rgba(126,97,255,0.25)] hover:shadow-[0_0_25px_rgba(126,97,255,0.35)] transition-all flex items-center justify-center gap-2 cursor-pointer font-sans"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    DM rolling active dice...
                  </>
                ) : (
                  <>
                    <Dices className="w-5 h-5 text-white animate-pulse" />
                    {isLocalMode ? "Submit Simultaneous Round Actions" : "Recall AI Dungeon DM / Roll Turn"}
                  </>
                )}
              </button>

              <div className="text-[9px] text-[#71717a] leading-normal flex gap-1 items-start bg-bg-base/70 p-2.5 rounded-lg border border-panel-border font-sans">
                <Info className="w-3 h-3 text-zinc-500 shrink-0 mt-0.5" />
                <span>
                  {isLocalMode 
                    ? "In Local Mode, typing actions for slot characters is optional. Empty inputs defaults to holding defensives." 
                    : "Make sure all active players lock in their actions. Then, any player can query the AI Dungeon master to roll and resolve."}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Exit Room Card */}
        <button
          onClick={onExitGame}
          className="w-full py-2.5 px-4 border border-panel-border hover:border-arcane-primary bg-bg-base/70 hover:bg-[#202026] text-[#a1a1aa] hover:text-white text-xs font-bold uppercase tracking-wider rounded-xl text-center transition cursor-pointer font-sans"
        >
          Exit Campaign Lobby (Reset)
        </button>
      </div>
    </div>
  );
}
