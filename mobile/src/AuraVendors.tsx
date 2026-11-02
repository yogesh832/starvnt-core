import React, { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import type { Data } from './api/client';
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
    {(all ? rows : rows.slice(0, 8)).map(row => {
      const samples = (row.portfolioSamples || []).filter((sample: Data) => sample.imageUrl || sample.url);
      const cover = samples[0]?.imageUrl || samples[0]?.url || row.portfolioImages?.[0];
      return <View key={row.id} style={{ width: 300, borderWidth: 1, borderColor: c.line, borderRadius: 22, overflow: 'hidden', backgroundColor: c.panel }}>
      <View style={{ height: 140, backgroundColor: c.soft }}>
        {!!cover && <Image source={{ uri: cover }} accessibilityLabel={`${row.vendor} project sample`} style={{ width: '100%', height: '100%' }} resizeMode="cover" />}
        <View style={{ position: 'absolute', left: 14, bottom: -22, width: 56, height: 56, borderRadius: 18, borderWidth: 3, borderColor: c.panel, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {row.profilePicUrl ? <Image source={{ uri: row.profilePicUrl }} accessibilityLabel={`${row.vendor} profile`} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Text bold size={14} color="#fff">{String(row.vendor || 'V').split(/\s+/).slice(0,2).map((part: string) => part[0]).join('').toUpperCase()}</Text>}
        </View>
      </View>
      <View style={{ padding: 14, paddingTop: 30, gap: 6 }}>
      <Text bold size={13}>{row.vendor}</Text><Text size={11} color={c.muted}>{row.package} · {row.service}</Text>
      {!!row.recommendation?.auraScore && <View style={{ padding: 10, borderRadius: 13, backgroundColor: c.soft, gap: 3 }}><Text bold size={11} color={c.chip}>Aura match · {row.recommendation.auraScore}/100 · {row.recommendation.matchLevel}</Text>{!!row.recommendation.whyBest?.[0] && <Text size={10} color={c.muted}>{row.recommendation.whyBest[0]}</Text>}</View>}
      <Text bold size={12} color={c.chip}>{row.requiresVendorConfirmation ? 'Final price needs vendor confirmation' : row.price != null ? `${money(row.price)} listed total` : row.basePrice != null ? `${money(row.basePrice)} / ${row.unit || 'unit'} · total not confirmed` : 'No price listed'}</Text>
      <Text size={10} color={['booked', 'blocked'].includes(row.availability) ? c.danger : c.muted}>{availability[row.availability] || 'Availability not confirmed'}</Text>
      {!!row.location && <Text size={10} color={c.muted}>{row.location}</Text>}
      {row.rating != null && <Text size={10} color={c.muted}>★ {row.rating} rating · {row.reviewCount} reviews</Text>}
      {samples.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 3 }}>{samples.slice(1).map((sample: Data, index: number) => <View key={`${sample.imageUrl || sample.url}-${index}`} style={{ width: 96, gap: 3 }}><Image source={{ uri: sample.imageUrl || sample.url }} accessibilityLabel={sample.title || 'Project sample'} style={{ width: 96, height: 58, borderRadius: 9 }} resizeMode="cover"/><Text size={9} color={c.muted}>{sample.title || 'Project sample'}</Text></View>)}</ScrollView>}
      {(row.conditionalCharges || []).map((charge: Data, index: number) => <Text key={index} size={10} color={c.muted}>{charge.name}: {money(charge.amount)}{charge.condition ? ` · ${charge.condition}` : ''}</Text>)}
      {!!eventId && search?.scopeMatchesEvent !== false && <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Service', { eventId, optionId: row.id })} style={{ minHeight: 44, justifyContent: 'center' }}><Text bold size={11} color={c.chip}>View service details →</Text></Pressable>}
      </View></View>;
    })}
    </ScrollView>
    {rows.length > 3 && <Pressable accessibilityRole="button" accessibilityState={{ expanded: all }} onPress={() => setAll(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}><Text bold size={12} color={c.chip}>{all ? 'Show fewer services' : `Show all ${rows.length} services`}</Text></Pressable>}
  </View>;
}
