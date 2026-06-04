/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CharacterStats {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface Character {
  id: string; // socket/tab id or custom ID
  ownerName: string; // name of the player controlling it
  name: string;
  race: string;
  class: string;
  level: number;
  hp: number;
  maxHp: number;
  stats: CharacterStats;
  backstory: string;
  equipment: string[];
  isPrepared: boolean; // Has written action for the current round
  currentAction: string; // The action written for the current round
}

export interface DmOutcome {
  characterName: string;
  actionOutcome: string;
  rollName: string; // e.g. "Dexterity (Sleight of Hand)"
  rollValue: number; // 1-20 d20 roll
  rollBonus: number;
  totalRoll: number;
  dc: number; // Difficulty Class
  success: boolean;
}

export interface MainStorySegment {
  roundNumber: number;
  dmPlot: string; // main story continuation
  sceneDescription: string; // description suited for visualizer
  sceneImageUrl?: string; // Generated image
  outcomes: DmOutcome[]; // outcomes for each player's action
  currentLocation: string; // location name
  combatActive: boolean;
  partyStatusSummary: string; // health / mood updates
}

export interface GameSettings {
  campaignType: 'dungeon' | 'forest' | 'intrigue' | 'cosmic' | 'custom';
  customCampaignDetail?: string;
  difficulty: 'casual' | 'standard' | 'hard' | 'unforgiving';
}

export interface GameSession {
  roomCode: string;
  characters: Character[];
  storyHistory: MainStorySegment[];
  currentRound: number;
  status: 'setup' | 'playing' | 'gameover';
  campaignTitle: string;
  currentLocation: string;
  settings: GameSettings;
  createdAt: number;
  lastActiveAt: number;
}
