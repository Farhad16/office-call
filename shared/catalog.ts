import type { Catalog } from './types.js';

// Default drinks, snacks and options.
// To add an item: add an entry here and restart the server. No UI code changes needed.
// `bn` is the Bengali text used in the spoken announcement.
export const DEFAULT_CATALOG: Catalog = {
  options: {
    sugar: {
      id: 'sugar',
      kind: 'choice',
      label: 'Sugar',
      default: 'normal',
      choices: [
        { id: 'none', label: 'No sugar', bn: 'চিনি ছাড়া' },
        { id: 'less', label: 'Less sugar', bn: 'চিনি কম' },
        { id: 'normal', label: 'Normal sugar', bn: '' },
        { id: 'extra', label: 'Extra sugar', bn: 'চিনি বেশি' },
      ],
    },
    milk: { id: 'milk', kind: 'toggle', label: 'Milk', bn: 'দুধ', default: false },
    ginger: { id: 'ginger', kind: 'toggle', label: 'Ginger', bn: 'আদা', default: false },
    // Lemon is only offered for tea without milk.
    lemon: { id: 'lemon', kind: 'toggle', label: 'Lemon', bn: 'লেবু', default: false, showIf: { milk: false } },
  },
  drinks: [
    { id: 'tea', label: 'Tea', bn: 'চা', emoji: '🍵', maxQty: 5, options: ['sugar', 'milk', 'ginger', 'lemon'] },
    { id: 'black-coffee', label: 'Black Coffee', bn: 'ব্ল্যাক কফি', emoji: '☕', maxQty: 5, options: ['sugar'] },
    { id: 'white-coffee', label: 'White Coffee', bn: 'হোয়াইট কফি', emoji: '🥛', maxQty: 5, options: ['sugar'] },
  ],
  snacks: [
    { id: 'chanachur-makha', label: 'Chanachur Makha', bn: 'চানাচুর মাখা', emoji: '🥜', maxQty: 5 },
    { id: 'muri-makha', label: 'Muri Makha', bn: 'মুড়ি মাখা', emoji: '🍚', maxQty: 5 },
    { id: 'biscuit', label: 'Biscuits', bn: 'বিস্কুট', emoji: '🍪', maxQty: 10 },
    { id: 'dry-cake', label: 'Dry Cake', bn: 'ড্রাই কেক', emoji: '🍰', maxQty: 10 },
  ],
};
