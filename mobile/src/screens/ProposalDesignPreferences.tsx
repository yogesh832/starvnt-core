import React, { useState } from 'react';
import { View } from 'react-native';
import { PROPOSAL_THEMES, proposalPalette } from '../../../shared/proposalContent.js';
import type { Data } from '../api/client';
import { external } from '../api/runtime';
import { Button, Card, Choice, ErrorNotice, Field, Txt, useAction } from '../ui';
export function ProposalDesignPreferences({ path, revision, preference, refresh }: { path: string; revision: number; preference: Data | null; refresh: () => unknown }) {
  const a = useAction();
  const [theme, setTheme] = useState('Royal Reception'), [paletteNotes, setPalette] = useState(''), [notes, setNotes] = useState('');
  const palette = proposalPalette(theme);
  return <Card><Txt bold size={24}>Explore your event direction</Txt><ErrorNotice message={a.error} /><Choice label="Visual theme" value={theme} values={PROPOSAL_THEMES} onChange={setTheme} /><View style={{ flexDirection: 'row', height: 34 }}>{[palette.primary, palette.accent, palette.paper, palette.dark].map(c => <View key={c} style={{ flex: 1, backgroundColor: c }} />)}</View><Field label="Colour preferences" value={paletteNotes} onChangeText={setPalette} maxLength={700} /><Field label="What would you like the event to feel like?" multiline value={notes} onChangeText={setNotes} maxLength={1000} /><Button title="Share my visual direction" busy={a.busy} onPress={() => { void a.run(async () => { await external.call(`${path}/preferences`, 'POST', { revision, theme, paletteNotes, notes }); await refresh(); }); }} />{preference && <Txt>Latest request: {preference.theme} · {preference.status}</Txt>}</Card>;
}
