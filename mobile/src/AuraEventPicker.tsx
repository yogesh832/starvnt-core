import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { external } from './api/runtime';
import type { Data } from './api/client';
import { AuraField, AuraText as Text, useAuraPalette } from './AuraTheme';
import { date, id } from './ui';

export function AuraEventPicker({ activeId, busy, onSelect, onBack }: { activeId?: string; busy: boolean; onSelect: (event: Data) => void; onBack: () => void }) {
  const c = useAuraPalette();
  const [events, setEvents] = useState<Data[]>([]), [query, setQuery] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    void external.call('/customer/events').then(data => { if (active) setEvents(data.events || []); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const filtered = events.filter(event => `${event.title} ${event.city || ''} ${event.eventType}`.toLowerCase().includes(query.toLowerCase()));
  return <View style={{ gap: 12 }}>
    <Text bold size={18}>Switch event</Text>
    <Text size={11} color={c.muted}>Say “switch to my wedding” or choose an event below. Your event details stay saved.</Text>
    <AuraField label="Find an event" value={query} onChangeText={setQuery} placeholder="Search by name or city" />
    {loading && <ActivityIndicator accessibilityLabel="Loading your events" color={c.primary} />}
    {!!error && <View accessibilityRole="alert"><Text size={12} color={c.danger}>{error}</Text><Pressable onPress={() => setAttempt(value => value + 1)} style={{ minHeight: 44, justifyContent: 'center' }}><Text color={c.chip}>Try again</Text></Pressable></View>}
    <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }}>
      {!loading && !error && !filtered.length && <Text size={12} color={c.muted}>{events.length ? 'No matching events.' : 'No saved events yet. Start planning with Aura.'}</Text>}
      {filtered.map(event => {
        const selected = id(event) === activeId;
        return <Pressable key={id(event)} accessibilityRole="button" accessibilityLabel={`${event.title}${selected ? ', current event' : ''}`} accessibilityState={{ selected, disabled: busy || selected }} disabled={busy || selected} onPress={() => onSelect(event)} style={{ padding: 12, minHeight: 64, borderWidth: 1, borderColor: selected ? c.primary : c.line, backgroundColor: selected ? c.soft : c.panel, borderRadius: 16, gap: 3, opacity: busy ? .5 : 1 }}>
          <Text size={13} bold>{event.title}</Text><Text size={10} color={c.muted}>{[event.city, event.eventDate ? date(event.eventDate) : 'Date to be decided', selected ? 'Current event' : event.status].filter(Boolean).join(' · ')}</Text>
        </Pressable>;
      })}
    </ScrollView>
    <Pressable accessibilityRole="button" onPress={onBack} style={{ minHeight: 44, justifyContent: 'center' }}><Text size={12} color={c.chip}>← Back to Aura menu</Text></Pressable>
  </View>;
}
