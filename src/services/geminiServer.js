/**
 * SpellStock Intelligence Layer: parse scenario text into params via Gemini.
 * Same behavior as before; plain JavaScript. Uses @google/genai.
 */

import { GoogleGenAI } from '@google/genai';

const SYSTEM_INSTRUCTION = `You are the high-fidelity Intelligence Layer for SpellStock.
Your job is to transform human intent into structured simulation parameters.

Rules:
1. horizon_hours MUST be exactly 24, 48, or 72.
2. demand_multiplier MUST be between 0.5 (low) and 2.5 (extreme spike).
3. notes MUST be a short, high-fidelity description (max 6 words). 
4. Use material-inspired language for notes if possible (e.g., "Volatile weekend surge", "Calm reservoir state", "Synchronized peak load").

Output MUST be valid JSON.
`;

const VALID_HOURS = [24, 48, 72];

function getApiKey() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) {
    return import.meta.env.VITE_API_KEY;
  }
  if (typeof process !== 'undefined' && process.env?.API_KEY) {
    return process.env.API_KEY;
  }
  return '';
}

export async function parseScenario(userInput) {
  const apiKey = getApiKey();
  try {
    if (apiKey) {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: userInput,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
        },
      });
      const text = response?.text ?? '';
      const result = JSON.parse(text || '{}');
      const hours = VALID_HOURS.includes(result.horizon_hours) ? result.horizon_hours : 72;
      const multiplier = Math.max(0.5, Math.min(2.5, result.demand_multiplier ?? 1.0));
      return {
        horizon_hours: hours,
        demand_multiplier: multiplier,
        notes: result.notes || 'System Nominal',
      };
    }
  } catch (error) {
    console.error('Gemini Intel Layer Error:', error);
  }
  return {
    horizon_hours: 72,
    demand_multiplier: 1.0,
    notes: 'Auto-calibrated baseline',
  };
}
