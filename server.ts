/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Express
const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// In-Memory Storage for Game Rooms
import { GameSession, Character, MainStorySegment, GameSettings, DmOutcome } from "./src/types";

const rooms = new Map<string, GameSession>();

// Cleanup old rooms periodically (older than 6 hours)
setInterval(() => {
  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
  for (const [code, session] of rooms.entries()) {
    if (session.lastActiveAt < sixHoursAgo) {
      rooms.delete(code);
    }
  }
}, 30 * 60 * 1000);

// Helper to lazy-get Gemini client to avoid crashes on startup if key is missing
let aiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not defined. Please add it in the Secrets panel.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Generate an alphabetical room code (4 characters)
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // readable
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Guarantee uniqueness
  if (rooms.has(code)) {
    return generateRoomCode();
  }
  return code;
}

// ==================== API ROUTES ====================

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", roomsActive: rooms.size });
});

// Create Room
app.post("/api/room/create", (req, res) => {
  try {
    const settings: GameSettings = req.body.settings || {
      campaignType: 'dungeon',
      difficulty: 'standard'
    };

    const roomCode = generateRoomCode();
    const session: GameSession = {
      roomCode,
      characters: [],
      storyHistory: [],
      currentRound: 0,
      status: 'setup',
      campaignTitle: "Preparing Adventure...",
      currentLocation: "The Fading Horizon",
      settings,
      createdAt: Date.now(),
      lastActiveAt: Date.now()
    };

    rooms.set(roomCode, session);
    res.json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Join Room
app.post("/api/room/join", (req, res) => {
  try {
    const { roomCode, characterData, ownerName } = req.body;
    if (!roomCode) {
      return res.status(400).json({ error: "Room code is required." });
    }

    const code = roomCode.toUpperCase().trim();
    const session = rooms.get(code);
    if (!session) {
      return res.status(404).json({ error: `Room ${code} not found.` });
    }

    if (session.status !== 'setup') {
      return res.status(400).json({ error: "Game is already in progress or completed." });
    }

    // Standard stats starter if missing
    const stats = characterData.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

    const newChar: Character = {
      id: Math.random().toString(36).substring(2, 9),
      ownerName: ownerName || "Adventurer",
      name: characterData.name || "Nameless Hero",
      race: characterData.race || "Human",
      class: characterData.class || "Fighter",
      level: 1,
      hp: characterData.hp || 12,
      maxHp: characterData.hp || 12,
      stats,
      backstory: characterData.backstory || "An eager wanderer seeking destiny.",
      equipment: characterData.equipment || ["Iron Shortsword", "Leather Armor", "Rations"],
      isPrepared: false,
      currentAction: ""
    };

    session.characters.push(newChar);
    session.lastActiveAt = Date.now();

    res.json({ session, character: newChar });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Leave Room
app.post("/api/room/leave", (req, res) => {
  try {
    const { roomCode, characterId } = req.body;
    const code = roomCode?.toUpperCase().trim();
    const session = rooms.get(code);
    if (!session) return res.status(404).json({ error: "Room not found." });

    session.characters = session.characters.filter(c => c.id !== characterId);
    session.lastActiveAt = Date.now();
    res.json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch Room State
app.get("/api/room/state/:roomCode", (req, res) => {
  try {
    const code = req.params.roomCode.toUpperCase().trim();
    const session = rooms.get(code);
    if (!session) {
      return res.status(404).json({ error: `Room ${code} not found.` });
    }
    session.lastActiveAt = Date.now();
    res.json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update Campaign Settings
app.post("/api/room/settings", (req, res) => {
  try {
    const { roomCode, settings } = req.body;
    const code = roomCode?.toUpperCase().trim();
    const session = rooms.get(code);
    if (!session) return res.status(404).json({ error: "Room not found" });

    session.settings = { ...session.settings, ...settings };
    session.lastActiveAt = Date.now();
    res.json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start Campaign with Gemini DM introduction (Round 0)
app.post("/api/room/start", async (req, res) => {
  try {
    const { roomCode } = req.body;
    const code = roomCode?.toUpperCase().trim();
    const session = rooms.get(code);
    if (!session) return res.status(404).json({ error: "Room not found" });

    if (session.characters.length === 0) {
      return res.status(400).json({ error: "You cannot start an adventure with zero characters! Please join or add a character." });
    }

    const ai = getGemini();

    const campaignTypeLabel = session.settings.campaignType;
    const difficultyLabel = session.settings.difficulty;
    const customDetail = session.settings.customCampaignDetail || "";

    // Build characters introduction
    const partyIntroductions = session.characters.map(c => 
      `- ${c.name}, the Level 1 ${c.race} ${c.class}. (STR:${c.stats.str} DEX:${c.stats.dex} CON:${c.stats.con} INT:${c.stats.int} WIS:${c.stats.wis} CHA:${c.stats.cha}) Backstory: ${c.backstory}`
    ).join("\n");

    const systemInstruction = 
      `You are an expert, highly immersive, collaborative Dungeon Master (DM) for a narrative-driven Dungeons & Dragons tabletop roleplaying game.
Your task is to craft high-quality, atmospheric, and balanced story arcs where characters face immediate stakes, combat encounters, and environmental riddles.
You will write captivating scenes, simulate d20 rolls, evaluate character abilities, and react dynamically to player choices.

You MUST respond strictly in JSON matching the specified schema.
Format rules:
- currentLocation: Name of the current sub-setting or room.
- campaignTitle: Epic quest name.
- dmPlot: Atmospheric narrative setting the scene, explaining events, and ending with a prompt for what the party will do. Keep it evocative, filled with gothic, mysterious, or heroic descriptions suitable for tabletop gaming. Use markdown (bold, italic) inside the text string for emphasis. Do not make choices for players; present the situation and ask for actions!
- sceneDescription: Elegant, concise, purely visual description of the visual backdrop (e.g. "a dank underground stone crypt with mossy sarcophagi illuminated by flickering purple torches"). Used to describe scenes cleanly.
- outcomes: For campaign start (Round 0), leave this as an empty array [] since players have not submitted custom round actions yet.
- combatActive: Boolean representing whether a life-or-death battle is active.
- partyStatusSummary: Brief narrative status of the party's general positioning, stance, and survival level.`;

    const prompt = 
      `ACT I: THE JOURNEY BEGINS
Create a compelling, dangerous campaign introduction of type: "${campaignTypeLabel}" ${customDetail ? `(Custom Plot Details: ${customDetail})` : ""}.
The gameplay difficulty is currently set to: "${difficultyLabel}". In harder modes, environmental hazards and enemy ambushes are deadlier.

The fearless adventurers in this party are:
${partyIntroductions}

Task:
Write the starting location, campaign name, and the introductory cinematic DM narrative. Give the players an immediate hook or threat (e.g., an ambush, a riddle, a heavy door, a dying messenger) that demands their individual actions.
Output MUST strictly conform to the JSON schema.`;

    // Define JSON schema
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        campaignTitle: {
          type: Type.STRING,
          description: "An epic, flavorful name for this campaign."
        },
        currentLocation: {
          type: Type.STRING,
          description: "The name of the beginning location, room, or setting."
        },
        dmPlot: {
          type: Type.STRING,
          description: "Immersive narrative introduction details, concluding with a direct call to action."
        },
        sceneDescription: {
          type: Type.STRING,
          description: "Concise physical description of the surrounding scenery."
        },
        combatActive: {
          type: Type.BOOLEAN,
          description: "Whether the campaign starts with immediate active combat."
        },
        partyStatusSummary: {
          type: Type.STRING,
          description: "Greeting summary, e.g. 'Healthy and alert at the cave entrance'"
        },
        outcomes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              characterName: { type: Type.STRING },
              actionOutcome: { type: Type.STRING },
              rollName: { type: Type.STRING },
              rollValue: { type: Type.INTEGER },
              rollBonus: { type: Type.INTEGER },
              totalRoll: { type: Type.INTEGER },
              dc: { type: Type.INTEGER },
              success: { type: Type.BOOLEAN }
            }
          },
          description: "Must be empty on Round 0."
        }
      },
      required: ["campaignTitle", "currentLocation", "dmPlot", "sceneDescription", "combatActive", "partyStatusSummary", "outcomes"]
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema
      }
    });

    const parsedJson = JSON.parse(response.text || "{}");

    const startSegment: MainStorySegment = {
      roundNumber: 0,
      dmPlot: parsedJson.dmPlot || "You stand before the gates of adventure. Draw your weapons and step forward.",
      sceneDescription: parsedJson.sceneDescription || "A moody medieval landscape under storm clouds.",
      outcomes: [],
      currentLocation: parsedJson.currentLocation || "The Adventure Gates",
      combatActive: parsedJson.combatActive || false,
      partyStatusSummary: parsedJson.partyStatusSummary || "Fresh and eager."
    };

    session.campaignTitle = parsedJson.campaignTitle || "The Unrevealed Legend";
    session.currentLocation = startSegment.currentLocation;
    session.storyHistory = [startSegment];
    session.currentRound = 1;
    session.status = 'playing';
    session.lastActiveAt = Date.now();

    res.json(session);
  } catch (error: any) {
    console.error("Error starting game with Gemini AI DM:", error);
    res.status(500).json({ error: error.message });
  }
});

// Submit Action for a specific character
app.post("/api/room/submit-action", (req, res) => {
  try {
    const { roomCode, characterId, action } = req.body;
    const code = roomCode?.toUpperCase().trim();
    const session = rooms.get(code);
    if (!session) return res.status(404).json({ error: "Room not found." });

    const char = session.characters.find(c => c.id === characterId);
    if (!char) return res.status(404).json({ error: "Character not found inside this room." });

    char.currentAction = action || "";
    char.isPrepared = !!action?.trim();
    session.lastActiveAt = Date.now();

    res.json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Process Turn: AI DM evaluates everyone's action simultaneously
app.post("/api/room/submit-dm-query", async (req, res) => {
  try {
    const { roomCode } = req.body;
    const code = roomCode?.toUpperCase().trim();
    const session = rooms.get(code);
    if (!session) return res.status(404).json({ error: "Room not found." });

    if (session.characters.length === 0) {
      return res.status(400).json({ error: "No characters inside the room." });
    }

    const ai = getGemini();

    const lastSegment = session.storyHistory[session.storyHistory.length - 1];
    const difficultyLabel = session.settings.difficulty;

    // Compile actions
    const partyActionsInput = session.characters.map(c => {
      const actionText = c.currentAction?.trim() || "Stands alert, scanning the surroundings defensively.";
      return `- **${c.name}** (${c.race} ${c.class} with HP ${c.hp}/${c.maxHp}): "${actionText}"`;
    }).join("\n");

    const partyProfiles = session.characters.map(c => 
      `- ${c.name} (Class: ${c.class}, Race: ${c.race}, Level: 1. Stats -> STR:${c.stats.str} DEX:${c.stats.dex} CON:${c.stats.con} INT:${c.stats.int} WIS:${c.stats.wis} CHA:${c.stats.cha})`
    ).join("\n");

    // Retain story segments. We provide the starting intro + immediate last 2 steps to provide flawless flow
    const compressedHistory = session.storyHistory.slice(-3).map(h => 
      `Round ${h.roundNumber} Location: "${h.currentLocation}"
DM Story Context: "${h.dmPlot}"
Outcomes: ${h.outcomes.map(o => `${o.characterName}: ${o.actionOutcome} (Roll: d20=${o.rollValue} + mod=${o.rollBonus} = total=${o.totalRoll} vs DC=${o.dc} -> ${o.success ? 'Success' : 'Failure'})`).join(", ")}`
    ).join("\n\n");

    const systemInstruction = 
      `You are an interactive AI Dungeon Master (DM) for a cooperative narrative D&D game.
Your core goal is to evaluate the simultaneous actions submitted by ALL party members at the exact same moment.

For each player's action, simulate a d20 roll, calculate modifiers based on their character's stats, assign a DC, and determine if they succeed or fail.
- HP system: If an action exposes a character to severe physical danger or they fail a crucial defense/athletics roll, they can take damage (negative integer value under hpChange, e.g. -4). Limit damage to small reasonable steps (e.g. -2 to -6) so characters can survive multiple rounds.
- Healing system: Rogue medicine or Cleric spells can heal characters (positive hpChange, up to maximum HP).
- Balanced action logic: Player choices are free writes. Balance and rule them realistic or magical! If a player writes an overpowered or silly action, give them a humorously challenging roll or a realistic complication.

Return strictly JSON matching this structure:
- dmPlot: The gorgeous storytelling narrative of what happens next. Describe how everyone's actions unfold in unison, clash with enemies or obstacles, and progress the campaign. End with a gripping situation or obstacle for the next round. Make sure to weave the characters' actions and their roll successes/failures elegantly.
- sceneDescription: Updated visual background summary.
- currentLocation: Updated location or area if the party moved (otherwise, keep it similar).
- combatActive: Is there a battle in progress right now?
- partyStatusSummary: Quick vital summary (e.g. 'Gimli took light lacerations. The goblin chieftain is wounded.').
- outcomes: Array containing exactly 1 outcome object per character who made an action:
  * characterName: EXACT name of the character.
  * actionOutcome: Brief description of how their action resolved.
  * rollName: The name of the check performed (e.g., "Strength (Athletics)", "Intelligence (Arcana)", "Dexterity (Acrobatics)", "Attack Roll").
  * rollValue: The pure 1d20 value (integer 1-20).
  * rollBonus: Stat modifier determined by stats (e.g., strength modifier for sports, intelligence for books).
  * totalRoll: rollValue + rollBonus
  * dc: Difficulty Class (integer 8 to 22 depending on difficulty and action complexity).
  * success: Boolean (totalRoll >= dc)
  * hpChange: An integer representing health changes (-10 to +10, or 0 if no change). This will be applied directly to their actual character stats. Ensure the narrative matches this value!`;

    const prompt = 
      `We are on Round ${session.currentRound} of the campaign. The difficulty is "${difficultyLabel}".
Here is the previous campaign context:
${compressedHistory}

The current active party details:
${partyProfiles}

The players did these actions SIMULTANEOUSLY this round:
${partyActionsInput}

Please resolve all actions, write the glorious campaign response describing what happens next, and output in the required JSON structure. Ensure every character has an outcome resolved with a d20 check, and specify and record 'hpChange' properties precisely based on the results you write about!`;

    // Response schema
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        currentLocation: { type: Type.STRING },
        dmPlot: { type: Type.STRING },
        sceneDescription: { type: Type.STRING },
        combatActive: { type: Type.BOOLEAN },
        partyStatusSummary: { type: Type.STRING },
        outcomes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              characterName: { type: Type.STRING },
              actionOutcome: { type: Type.STRING },
              rollName: { type: Type.STRING },
              rollValue: { type: Type.INTEGER },
              rollBonus: { type: Type.INTEGER },
              totalRoll: { type: Type.INTEGER },
              dc: { type: Type.INTEGER },
              success: { type: Type.BOOLEAN },
              hpChange: { type: Type.INTEGER, description: "HP deduction or healing. Negative means damage. Plus means heal." }
            },
            required: ["characterName", "actionOutcome", "rollName", "rollValue", "rollBonus", "totalRoll", "dc", "success", "hpChange"]
          }
        }
      },
      required: ["currentLocation", "dmPlot", "sceneDescription", "combatActive", "partyStatusSummary", "outcomes"]
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema
      }
    });

    const parsedJson = JSON.parse(response.text || "{}");

    // Compile into new MainStorySegment
    const nextSegment: MainStorySegment = {
      roundNumber: session.currentRound,
      dmPlot: parsedJson.dmPlot || "The Dungeon Master's words are lost to the wind. Prepare yourself.",
      sceneDescription: parsedJson.sceneDescription || "A chaotic melee in dark dungeons.",
      outcomes: parsedJson.outcomes || [],
      currentLocation: parsedJson.currentLocation || session.currentLocation,
      combatActive: parsedJson.combatActive ?? false,
      partyStatusSummary: parsedJson.partyStatusSummary || "Standing tall."
    };

    // Apply HP changes directly to the memory characters
    const serverOutcomes: DmOutcome[] = [];
    if (parsedJson.outcomes && Array.isArray(parsedJson.outcomes)) {
      parsedJson.outcomes.forEach((out: any) => {
        const char = session.characters.find(c => c.name.toLowerCase() === out.characterName.toLowerCase());
        if (char) {
          const hpDiff = out.hpChange || 0;
          char.hp += hpDiff;
          if (char.hp < 0) char.hp = 0;
          if (char.hp > char.maxHp) char.hp = char.maxHp;
        }

        serverOutcomes.push({
          characterName: out.characterName,
          actionOutcome: out.actionOutcome,
          rollName: out.rollName || "Ability Check",
          rollValue: out.rollValue || 10,
          rollBonus: out.rollBonus || 0,
          totalRoll: out.totalRoll || 10,
          dc: out.dc || 10,
          success: out.success ?? true
        });
      });
    }

    // Assign final polished outcomes
    nextSegment.outcomes = serverOutcomes;

    // Reset prepared traits in room
    session.characters.forEach(c => {
      c.currentAction = "";
      c.isPrepared = false;
    });

    session.currentLocation = nextSegment.currentLocation;
    session.storyHistory.push(nextSegment);
    session.currentRound += 1;
    session.lastActiveAt = Date.now();

    res.json(session);
  } catch (error: any) {
    console.error("AI DM turn compilation failed:", error);
    res.status(500).json({ error: error.message });
  }
});

// Generate Scenery Illustration (Optional Scenic Feature)
app.post("/api/room/generate-scenery", async (req, res) => {
  try {
    const { roomCode, sceneDescription } = req.body;
    if (!sceneDescription) {
      return res.status(400).json({ error: "Scene description is required to generate scenery." });
    }

    const ai = getGemini();

    const promptMessage = 
      `Create a breathtaking fantasy concept art illustration representing this D&D scenery: ${sceneDescription}. 
Art style: Immersive, painterly digital desktop gaming illustration, dramatic atmospheric lighting, extremely moody dark tabletop vibe, high detail. Clean, no text, no captions.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { text: promptMessage }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9"
        }
      }
    });

    let base64Image = "";
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          base64Image = part.inlineData.data;
          break;
        }
      }
    }

    if (!base64Image) {
      throw new Error("No image was returned by Gemini.");
    }

    // Check if room exists; if so, update the last segment scenery
    const code = roomCode?.toUpperCase().trim();
    const session = rooms.get(code);
    if (session && session.storyHistory.length > 0) {
      const lastHist = session.storyHistory[session.storyHistory.length - 1];
      lastHist.sceneImageUrl = `data:image/png;base64,${base64Image}`;
    }

    res.json({ imageUrl: `data:image/png;base64,${base64Image}` });
  } catch (error: any) {
    console.error("Error generating scenery:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== VITE ENGINE DEVELOPMENT & STANDALONE MIDDLEWARE ====================

async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server boots cleanly on http://localhost:${PORT}`);
  });
}

bootstrap();
