import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Data } from './api/client';
import { AuraPanel } from './AuraUI';
import { AuraText as Text, useAuraPalette } from './AuraTheme';
import { money } from './ui';

const availability: Record<string, string> = { no_event_date: 'Date needed to check availability', unconfirmed: 'Not confirmed by vendor', blocked: 'Blocked on this date', booked: 'Booked on this date', requires_vendor_confirmation: 'Extended coverage · vendor confirmation needed' };
export function AuraVendors({ rows, search, eventId, navigation }: { rows: Data[]; search: Data | null; eventId?: string; navigation: any }) {
  const [all, setAll] = useState(false);
  const c = useAuraPalette();
  if (!rows.length) return null;
  return <View style={{ gap: 10 }}>
    <Text bold size={13}>{rows.length} matching services</Text>
    {!!eventId && search?.scopeMatchesEvent === false && <Text size={10} color={c.muted}>These results use your search details. Update your event before requesting a quote.</Text>}
    <Text size={10} color={c.muted}>From the current vendor catalogue{search?.city ? ` · ${search.city}` : ' · choose a city to check coverage'}</Text>
    {(all ? rows : rows.slice(0, 3)).map(row => <AuraPanel key={row.id}>
      <Text bold size={13}>{row.vendor}</Text><Text size={11} color={c.muted}>{row.package} · {row.service}</Text>
      <Text bold size={12} color={c.chip}>{row.requiresVendorConfirmation ? 'Final price needs vendor confirmation' : row.price != null ? `${money(row.price)} listed total` : row.basePrice != null ? `${money(row.basePrice)} / ${row.unit || 'unit'} · total not confirmed` : 'No price listed'}</Text>
      <Text size={10} color={['booked', 'blocked'].includes(row.availability) ? c.danger : c.muted}>{availability[row.availability] || 'Availability not confirmed'}</Text>
      {!!row.location && <Text size={10} color={c.muted}>{row.location}</Text>}
      {row.rating != null && <Text size={10} color={c.muted}>{row.rating} rating · {row.reviewCount} reviews</Text>}
      {(row.conditionalCharges || []).map((charge: Data, index: number) => <Text key={index} size={10} color={c.muted}>{charge.name}: {money(charge.amount)}{charge.condition ? ` · ${charge.condition}` : ''}</Text>)}
      {!!eventId && search?.scopeMatchesEvent !== false && <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Service', { eventId, optionId: row.id })} style={{ minHeight: 44, justifyContent: 'center' }}><Text bold size={11} color={c.chip}>View service details →</Text></Pressable>}
    </AuraPanel>)}
    {rows.length > 3 && <Pressable accessibilityRole="button" accessibilityState={{ expanded: all }} onPress={() => setAll(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}><Text bold size={12} color={c.chip}>{all ? 'Show fewer services' : `Show all ${rows.length} services`}</Text></Pressable>}
  </View>;
}
