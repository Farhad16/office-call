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
    // Part of the name: spoken as "দুধ চা" / "রং চা" (change রং to লাল if your office says লাল চা).
    teaType: {
      id: 'teaType',
      kind: 'choice',
      label: 'Type',
      default: 'black',
      nameModifier: true,
      choices: [
        { id: 'black', label: 'Black', bn: 'রং', emoji: '🍵' },
        { id: 'milk', label: 'Milk', bn: 'দুধ', emoji: '🧋' },
      ],
    },
    // Ginger and lemon are only offered for black tea (milk tea has neither).
    ginger: { id: 'ginger', kind: 'toggle', label: 'Ginger', bn: 'আদা', default: false, showIf: { teaType: 'black' } },
    lemon: { id: 'lemon', kind: 'toggle', label: 'Lemon', bn: 'লেবু', default: false, showIf: { teaType: 'black' } },
  },
  drinks: [
    { id: 'tea', label: 'Tea', bn: 'চা', emoji: '🍵', maxQty: 5, options: ['teaType', 'sugar', 'ginger', 'lemon'] },
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
