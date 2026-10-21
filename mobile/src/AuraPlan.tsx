import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Data } from './api/client';
import { date, id, money, Icon } from './ui';
import { AuraButton, AuraText as Text, useAuraPalette } from './AuraTheme';
import { AuraPanel, AuraRow } from './AuraUI';

export function AuraPlan({ event, understanding, navigation, busy, onConfirm, onAsk }: {
  event: Data | null; understanding: Data | null; navigation: any; busy: boolean;
  onConfirm: () => void; onAsk?: (message: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const c = useAuraPalette();
  if (!event || !understanding) return null;
  if (collapsed) return <AuraRow title="Show what I understood" onPress={() => setCollapsed(false)} />;
  if (understanding.confirmed) return <AuraPanel>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Icon name="checkmark-circle" color={c.success} size={24} /><View style={{ flex: 1 }}><Text bold size={14}>Your event plan is ready</Text><Text size={11} color={c.muted}>{event.title}</Text></View></View>
    <Text size={11} color={c.muted}>{[event.eventDate ? date(event.eventDate) : 'Date not specified', event.city, event.guestCount != null ? `${event.guestCount} guests` : null].filter(Boolean).join(' · ')}</Text>
    {(event.budget != null || event.budgetRangeLabel) && <Text size={11} color={c.muted}>Budget: {event.budget != null ? money(event.budget) : event.budgetRangeLabel}</Text>}
    <AuraButton title="Open event →" onPress={() => navigation.navigate('Event', { eventId: id(event) })} />
  </AuraPanel>;
  const facts = understanding.facts || {}, services = understanding.services || {};
  const rows: [string, string, Data | undefined, any][] = [
    ['Event', 'calendar-outline', facts.eventType, facts.eventType?.label],
    ['Date', 'today-outline', facts.date, facts.date?.value ? date(facts.date.value) : null],
    ['Guests', 'people-outline', facts.guestCount, facts.guestCount?.value],
    ['Location', 'location-outline', facts.location || facts.city, facts.location?.value || facts.city?.value],
    ['Budget', 'wallet-outline', facts.budget, facts.budget?.value != null ? money(facts.budget.value) : facts.budget?.rangeLabel],
  ];
  return <AuraPanel>
    <View style={{ gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderColor: c.subtle }}><View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Icon name="checkmark" color={c.success} size={15} /><Text bold size={12}>Here's what I understood</Text></View><View style={{ alignSelf: 'flex-start', backgroundColor: c.amberBg, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 }}><Text size={9} bold color={c.amber}>NOT CONFIRMED YET</Text></View></View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {rows.map(([label, icon, fact, display]) => <View key={label} style={{ flexBasis: label === 'Location' ? '100%' : '46%', flexGrow: 1, borderRadius: 16, backgroundColor: c.soft, borderWidth: 1, borderColor: c.subtle, padding: 10, gap: 5 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name={icon} color={c.muted} size={12} /><Text size={10} color={c.muted}>{label}</Text></View><Text bold size={12} color={fact?.state === 'MISSING' || display == null ? c.muted : c.ink}>{fact?.state === 'MISSING' || display == null || display === '' ? 'Not specified' : String(display)}</Text>{fact?.state === 'INFERRED' && <Text size={9} color={c.amber}>{fact.note || 'Assumed'} — please check</Text>}</View>)}
    </View>
    <View style={{ gap: 5, borderRadius: 16, padding: 11, backgroundColor: c.soft }}><Text size={10} color={c.muted}>Services</Text>
      {(services.needed || []).map((s: Data) => <Text size={11} key={s.category}>{s.label} — need help{s.location ? ` · ${s.location}` : ''}</Text>)}
      {(services.provided || []).map((s: Data) => (
        <View key={s.category} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="checkmark-circle" color={c.success} size={14} />
          <Text size={11} color={c.success} style={{ flex: 1 }}>
            {s.label} — arranged by you{s.value ? `: ${s.value}` : ''}{s.location ? ` · ${s.location}` : ''}
          </Text>
        </View>
      ))}
      {!services.needed?.length && !services.provided?.length && <Text size={11} color={c.muted}>Not specified</Text>}
      {!!services.suggested?.length && <Text size={10} color={c.muted}>May be useful — you decide:</Text>}
      {onAsk && (services.suggested || []).map((s: Data) => <AuraRow key={s.category} title={`+ ${s.label}`} disabled={busy} onPress={() => onAsk(`I need ${String(s.label).toLowerCase()}`)} />)}
    </View>
    {!!understanding.missingInfo?.length && <View style={{ gap: 4 }}><Text bold size={10} color={c.muted}>MISSING</Text>{understanding.missingInfo.map((f: Data) => <Text size={11} key={f.field}>• {f.label}</Text>)}</View>}
    {!!understanding.inferred?.length && <View style={{ backgroundColor: c.amberBg, padding: 10, borderRadius: 16, gap: 4 }}><Text bold size={10} color={c.amber}>ASSUMED — PLEASE CHECK</Text>{understanding.inferred.map((f: Data) => <Text size={11} color={c.amber} key={f.field}>• {f.label}: {f.note}</Text>)}</View>}
    <View style={{ gap: 8, borderTopWidth: 1, borderColor: c.subtle, paddingTop: 12 }}>
      {!understanding.canConfirm && <Text size={10} color={c.muted}>To build your plan I still need: {(understanding.missingForConfirm || []).map((f: Data) => f.label).join(', ') || 'the missing details'}.</Text>}
      <AuraButton title="Build My Event Plan ✨" busy={busy} disabled={!understanding.canConfirm} onPress={onConfirm} />
      <AuraButton title="Edit details" secondary disabled={busy} onPress={() => navigation.navigate('EditEvent', { eventId: id(event) })} />
      <Pressable accessibilityRole="button" onPress={() => setCollapsed(true)} style={{ padding: 10, alignItems: 'center' }}><Text size={12} color={c.muted}>Ask me later</Text></Pressable>
    </View>
  </AuraPanel>;
}
