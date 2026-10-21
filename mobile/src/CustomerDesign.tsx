import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AuthGradient } from './AuthUI';
import { AuraMark } from './AuraMark';
import { usePlanningIntent } from './PlanningIntent';
import { date, human, Icon, id, money, Txt, usePalette, useResource } from './ui';
import { external } from './api/runtime';
import type { Data } from './api/client';

export function CustomerHero({ firstName, navigation }: { firstName: string; navigation: any }) {
  const c = usePalette(), [text, setText] = useState('');
  const { setPrompt } = usePlanningIntent();
  function plan(value = text) { setPrompt(value.trim()); navigation.navigate('Chat', { initialPrompt: value.trim() }); }
  const ink = c.dark ? '#fff' : '#100b4e';
  return <View style={{ borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: c.dark ? '#7460c966' : '#dcd4f6' }}>
    <Image source={require('../assets/brand/customer-wedding-hero.jpg')} style={StyleSheet.absoluteFill} resizeMode="cover" />
    <AuthGradient colors={c.dark ? ['#4924e8f5', '#4d28aab8', '#110d2355'] : ['#f5f2fffa', '#efe5f9c9', '#fff0f04d']} />
    <View pointerEvents="none" style={{ position: 'absolute', width: 210, height: 210, borderRadius: 105, backgroundColor: c.dark ? '#a87eff22' : '#d19fff22', right: -70, top: -60 }} />
    <View style={{ padding: 18, gap: 13 }}>
      <Txt size={12} style={{ color: ink }}>Welcome{firstName ? `, ${firstName}` : ''} 👋</Txt>
      <Txt size={29} bold style={{ color: ink, lineHeight: 34, maxWidth: 270 }}>What shall we{'\n'}plan today?</Txt>
      <Txt size={12} style={{ color: ink, maxWidth: 280 }}>Tell us what you’re planning — we’ll handle the rest.</Txt>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', borderWidth: 1, borderColor: c.dark ? '#a391e84d' : '#ffffffcc', backgroundColor: c.dark ? '#101a31ed' : '#ffffffed', borderRadius: 18, padding: 8, marginTop: 8 }}>
        <AuraMark size={24} /><TextInput accessibilityLabel="Describe your event" value={text} onChangeText={setText} placeholder="Describe your event…" placeholderTextColor={c.dark ? '#a2afd0' : '#62639a'} onSubmitEditing={() => plan()} style={{ flex: 1, minWidth: 0, minHeight: 44, color: c.dark ? '#fff' : '#100b4e', fontSize: 12, fontFamily: 'Inter_400Regular' }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Plan with Aura+" onPress={() => plan()} style={{ width: 44, height: 44, borderRadius: 13, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}><AuthGradient colors={['#6855ff', '#994dff']} /><Icon name="arrow-forward" color="#fff" size={22}/></Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[
        ['heart-outline', 'My daughter’s wedding', "My daughter's wedding"], ['gift-outline', 'Plan my birthday', 'Plan my birthday'],
        ['business-outline', 'Corporate event', 'Corporate event for 300 people'], ['sparkles-outline', 'Arrange a Puja', 'Arrange a Puja'],
      ].map(([icon, label, prompt]) => <Pressable key={label} accessibilityRole="button" onPress={() => plan(prompt)} style={({ pressed }) => ({ width: '48%', flexGrow: 1, minHeight: 44, padding: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: c.dark ? '#0c142aeb' : '#ffffffdd', borderRadius: 22, borderWidth: 1, borderColor: c.dark ? '#7563ab80' : '#ddd5fa', opacity: pressed ? 0.7 : 1 })}><Icon name={icon} size={15} color={c.dark ? '#e2d9ff' : '#6641ef'} /><Txt size={10} bold style={{ color: c.dark ? '#fff' : '#21105e', flexShrink: 1 }}>{label}</Txt></Pressable>)}</View>
    </View>
  </View>;
}

export function AuraShortcut({ navigation, eventId }: { navigation: any; eventId?: string }) {
  const c = usePalette();
  return <Pressable accessibilityRole="button" accessibilityLabel="Aura+ your event assistant" onPress={() => navigation.navigate('Chat', eventId ? { eventId } : undefined)} style={({ pressed }) => ({ backgroundColor: c.dark ? '#101a2dee' : '#ffffffed', borderWidth: 1, borderColor: c.dark ? '#343b5b' : '#e3dcf7', borderRadius: 21, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.75 : 1, boxShadow: c.dark ? '0px 4px 20px #00000022' : '0px 4px 20px #7055cc12' })}>
    <AuraMark variant="orb" size={48}/><View style={{ flex: 1 }}><Txt size={14} bold>Aura+</Txt><Txt size={11} muted>Your event assistant</Txt></View><Icon name="chevron-forward" size={20}/>
  </Pressable>;
}

export function CustomerEventSummary({ event, data, navigation }: { event: Data; data?: Data; navigation: any }) {
  const c = usePalette(), summary = data?.summary;
  const steps = data?.steps || event.steps || [];
  const percent = Math.max(0, Math.min(100, Number(summary?.progressPercent ?? event.progressPercent ?? 0)));
  const paid = data?.payments?.filter((p: Data) => p.status === 'verified').reduce((sum: number, p: Data) => sum + Number(p.amount || 0), 0);
  const venue = summary?.items?.find((item: Data) => item.category === 'venue');
  const line = c.dark ? '#344165' : '#ddd7f7', panel = c.dark ? '#142037dd' : '#f8f6ffdd';
  const section = (name: string, title: string, category?: string) => navigation.navigate('EventSection', { eventId: id(event), section: name, title, category });
  return <View style={{ borderWidth: 1, borderColor: c.dark ? '#6257ab88' : '#ded7fb', backgroundColor: c.dark ? '#0f192b' : '#fff', borderRadius: 24, overflow: 'hidden', padding: 16, gap: 17, boxShadow: c.dark ? '0px 8px 24px #00000022' : '0px 8px 24px #7055cc10' }}>
    <AuthGradient colors={c.dark ? ['#101d3000', '#5422b21f'] : ['#ffffff00', '#e4d2ff20']}/>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ width: 42, height: 46, backgroundColor: c.dark ? '#27205a' : '#eee8ff', borderWidth: 1, borderColor: line, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }}><Icon name="balloon-outline" size={25} color="#9766ff"/></View>
      <View style={{ flex: 1, gap: 5 }}><Txt bold size={17}>{event.title || human(event.eventType)}</Txt><View style={{ alignSelf: 'flex-start', backgroundColor: c.dark ? '#4b350d' : '#fff0bf', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 }}><Txt size={8} bold style={{ color: c.dark ? '#ffca32' : '#a24c00' }}>{event.status === 'draft' ? 'DRAFT – CONFIRM DETAILS' : human(event.status).toUpperCase()}</Txt></View></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit event details" onPress={() => navigation.navigate('EditEvent', { eventId: id(event) })} style={{ minHeight: 44, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: line, justifyContent: 'center' }}><View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Icon name="create-outline" size={14}/><Txt size={11} bold>Edit</Txt></View></Pressable>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{[
      ['calendar-outline', event.eventDate ? date(event.eventDate) : 'Date not set'], ['location-outline', event.city || 'Location not set'],
      ['people-outline', event.guestCount != null ? `${event.guestCount} guests` : 'Guests not set'], ['wallet-outline', event.budget != null ? money(event.budget) : event.budgetMax != null ? money(event.budgetMax) : 'Budget not set'],
    ].map(([icon, label]) => <View key={icon} style={{ width: '47%', flexGrow: 1, flexDirection: 'row', gap: 7, alignItems: 'center' }}><Icon name={icon} size={16} color={c.dark ? '#b4a0ff' : '#7b4dff'} /><Txt size={11} style={{ flexShrink: 1 }}>{label}</Txt></View>)}</View>
    {!!steps.length && <View style={{ flexDirection: 'row' }}>{steps.map((step: Data, index: number) => <View key={step.key} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      {index < steps.length - 1 && <View style={{ position: 'absolute', height: 2, backgroundColor: line, top: 14, left: '50%', width: '100%' }}/>}<View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: step.state === 'current' ? '#713fff' : panel, borderWidth: step.state === 'current' ? 2 : 1, borderColor: step.state === 'current' ? '#c3abff' : line, boxShadow: step.state === 'current' ? '0px 0px 10px #8754ff77' : undefined }}><Txt size={11} style={{ color: step.state === 'current' ? '#fff' : c.muted }}>{index + 1}</Txt></View><Txt size={8} bold={step.state === 'current'} style={{ textAlign: 'center' }}>{step.label}</Txt>
    </View>)}</View>}
    <Pressable accessibilityRole="button" onPress={() => section('services', 'Venue', 'venue')} style={{ borderRadius: 16, borderWidth: 1, borderColor: line, backgroundColor: panel, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Icon name="business-outline" size={25}/><View style={{ flex: 1 }}><Txt size={12}>Venue</Txt><Txt size={12} bold style={{ color: c.dark ? '#ffca32' : '#a55b00' }}>{venue?.providedValue || venue?.vendorName || (venue ? `${venue.optionCount || 0} options` : event.status === 'draft' ? 'Confirm details to see options' : 'Open venue options')}</Txt></View><Icon name="chevron-forward" size={18}/></Pressable>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Pressable accessibilityRole="button" onPress={() => section('bookings', 'Bookings & payments')} style={{ flex: 1, borderRadius: 16, borderWidth: 1, borderColor: line, padding: 10, backgroundColor: panel, gap: 6 }}><Icon name="card-outline" size={23}/><Txt size={10} muted>Payment</Txt><Txt size={12} bold>{paid == null ? 'View payment details' : paid > 0 ? `${money(paid)} paid` : 'Nothing paid yet'}</Txt></Pressable>
      <View style={{ flex: 1, borderRadius: 16, borderWidth: 1, borderColor: line, padding: 10, backgroundColor: panel, alignItems: 'center', justifyContent: 'center', gap: 4 }}><View style={{ width: 48, height: 48, justifyContent: 'center', alignItems: 'center' }}><Svg width={48} height={48} style={StyleSheet.absoluteFill}><Circle cx={24} cy={24} r={20} fill="none" stroke={line} strokeWidth={5}/><Circle cx={24} cy={24} r={20} fill="none" stroke="#9060ff" strokeWidth={5} strokeDasharray={`${percent / 100 * 125.66} 125.66`} rotation={-90} origin="24,24"/></Svg><Txt size={13} bold>{percent}%</Txt></View><Txt size={10} muted>Event readiness</Txt></View>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Your event assistant Aura+" onPress={() => navigation.navigate('Chat', { eventId: id(event) })} style={{ borderRadius: 16, borderWidth: 1, borderColor: c.dark ? '#8751fb' : '#e6d7ff', padding: 12, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 10 }}><AuthGradient colors={c.dark ? ['#5628bc', '#241b5c'] : ['#e9d7ff', '#f5efff']}/><AuraMark size={37}/><View style={{ flex: 1 }}><Txt bold size={12} style={{ color: c.dark ? '#fff' : '#5422dd' }}>Your Event Assistant</Txt><Txt size={10}>Aura+ is with you throughout</Txt></View><Icon name="chevron-forward" size={18}/></Pressable>
  </View>;
}

export function HomeEventSummary({ event, navigation }: { event: Data; navigation: any }) {
  const r = useResource(external, `/customer/events/${encodeURIComponent(id(event))}/dashboard`);
  return <CustomerEventSummary event={r.data.event || event} data={r.data} navigation={navigation}/>;
}
