/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CharacterStats } from "../types";

export interface PresetCharacterInfo {
  name: string;
  race: string;
  class: string;
  hp: number;
  stats: CharacterStats;
  backstory: string;
  equipment: string[];
}

export const PRESET_CHARACTERS: PresetCharacterInfo[] = [
  {
    name: "Aethelgard the Valiant",
    race: "Human",
    class: "Paladin of Devotion",
    hp: 14,
    stats: { str: 15, dex: 10, con: 14, int: 8, wis: 12, cha: 14 },
    backstory: "Anointed knight of the solar order. Possesses unshakeable honor and wields a pristine longsword to defend the innocent against dark shadows.",
    equipment: ["Steel Longsword", "Kite Shield", "Chainmail", "Woly Symbol", "Rations (5)"]
  },
  {
    name: "Lydia Whisperwind",
    race: "Elf",
    class: "Arcane Trickster Rogue",
    hp: 10,
    stats: { str: 9, dex: 16, con: 12, int: 14, wis: 10, cha: 12 },
    backstory: "A mischievous wanderer of the silver pines. Specializes in illusion magics, silent lockpicking, and strikes from unseen cover.",
    equipment: ["Dual Steel Daggers", "Shortbow", "Thieves' Tools", "Cloak of Shadows", "Rope (50ft)"]
  },
  {
    name: "Kaelen Frost",
    race: "Dragonborn",
    class: "Evocation Wizard",
    hp: 9,
    stats: { str: 10, dex: 13, con: 12, int: 16, wis: 12, cha: 10 },
    backstory: "A scholarly elementalist expelled from the High Spire. Unleashes biting ice and brilliant flame with volatile precision.",
    equipment: ["Spellcasting Focus Staff", "Spellbook", "Scholar's Robes", "Ink & Quill", "Health Potion"]
  },
  {
    name: "Thrum Heavyhand",
    race: "Dwarf",
    class: "Life Domain Cleric",
    hp: 13,
    stats: { str: 14, dex: 8, con: 15, int: 10, wis: 15, cha: 10 },
    backstory: "A warm, sturdy smith of the iron peaks. Devoted to the god of the hearth, healing the broken with glowing holy light.",
    equipment: ["Heavy Iron Mace", "Chain Mail", "Holy Water", "Healer's Kit", "Stone Carving Tools"]
  }
];

export interface CampaignPreset {
  type: 'dungeon' | 'forest' | 'intrigue' | 'cosmic' | 'custom';
  title: string;
  description: string;
  icon: string;
}

export const CAMPAIGN_PRESETS: CampaignPreset[] = [
  {
    type: 'dungeon',
    title: "The Whispering Crypt",
    description: "Delve into ancient dark crypts filled with undead terrors, complex traps, and lost treasures of a fallen crown.",
    icon: "Skull"
  },
  {
    type: 'forest',
    title: "Shadows of Eldervale",
    description: "An enchanted, shifting woodland corrupted by rogue druid magic, fierce beasts, and ancient tree spirits.",
    icon: "Trees"
  },
  {
    type: 'intrigue',
    title: "Gilded Treason",
    description: "A high-stakes campaign of aristocratic espionage, concealed poisoners, and court whispers in a grand palace.",
    icon: "ShieldAlert"
  },
  {
    type: 'cosmic',
    title: "The Astral Breach",
    description: "Void-born aberrations and gravity-defying rifts threaten the material world in a Lovecraftian sci-fantasy struggle.",
    icon: "Orbit"
  },
  {
    type: 'custom',
    title: "Design Custom Campaign",
    description: "Instruct the AI DM to craft a custom setting, quest, or scenario tailored directly to your imagination.",
    icon: "Compass"
  }
];
