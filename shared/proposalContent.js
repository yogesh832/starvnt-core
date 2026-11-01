// Shared presentation vocabulary. Core validates all incoming business content.
export const PROPOSAL_THEMES = ['Royal Reception', 'Soft Ivory Editorial', 'Bengali Traditional', 'Corporate Premium', 'Contemporary Minimal'];
export const SECTION_KINDS = ['menu', 'inventory', 'equipment', 'team', 'deliverables', 'design', 'layout', 'timeline'];
export const ITEM_STATES = ['INCLUDED', 'OPTION', 'SELECTED', 'EXCLUDED', 'PENDING'];
export const CHECK_STATES = ['PENDING', 'CONFIRMED', 'NOT_APPLICABLE'];
export const CHECK_OWNERS = ['CUSTOMER', 'VENDOR', 'STARVNT', 'VENUE'];
export function proposalPalette(theme = '') {
  if (/corporate/i.test(theme)) return { primary: '#182D43', accent: '#9A8052', paper: '#F7F8F8', dark: '#142334', ornate: false };
  if (/minimal/i.test(theme)) return { primary: '#292929', accent: '#8B8173', paper: '#FCFAF6', dark: '#202020', ornate: false };
  if (/bengali/i.test(theme)) return { primary: '#731B29', accent: '#B18A46', paper: '#FFF4DF', dark: '#37221C', ornate: true };
  if (/royal|reception/i.test(theme)) return { primary: '#590C19', accent: '#C4A05C', paper: '#FCF1D8', dark: '#101E29', ornate: true };
  return { primary: '#632A3B', accent: '#AC8B56', paper: '#FBF8F1', dark: '#2C2328', ornate: false };
}
export const newProposalSection = (kind = 'menu', category = '') => ({ kind, title: '', category, description: '', coverageNote: '', items: [] });
export const newProposalItem = () => ({ name: '', details: '', quantity: 1, unit: '', status: 'INCLUDED', choiceGroup: '', assetIndex: null, capacity: null, x: 0, y: 0, width: 20, height: 15 });
export const newProposalCheck = () => ({ title: '', category: '', details: '', owner: 'STARVNT', status: 'PENDING', mandatory: true, evidence: '' });
export function removeProposalAsset(draft, index) {
  return { ...draft, assets: draft.assets.filter((_, i) => i !== index), sections: (draft.sections || []).map(s => ({ ...s, items: s.items.map(i => ({ ...i, assetIndex: i.assetIndex === index ? null : i.assetIndex > index ? i.assetIndex - 1 : i.assetIndex })) })) };
}
