import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { Data } from './api/client';
import { AuraRow, AuraReveal } from './AuraUI';
import { AuraButton, AuraField, AuraText as Text, useAuraPalette } from './AuraTheme';
import { auraChoice } from './auraChoices';
import { LocationPicker } from './LocationPicker';
import { date } from './ui';

export function AuraQuestion({ question, busy, onSend, onPrefill, onSearchLocations, onSelectLocation, showQuestion = true }: { question: Data; busy: boolean; onSend: (message?: string, body?: Data) => void; onPrefill: (text: string) => void; onSearchLocations?: (query: string) => Promise<Data[]>; onSelectLocation?: (place: Data) => void; showQuestion?: boolean }) {
  const [showDate, setShowDate] = useState(false);
  const [value, setValue] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [places, setPlaces] = useState<Data[]>([]);
  const [searching, setSearching] = useState(false);
  const [locationError, setLocationError] = useState('');
  const c = useAuraPalette();
  const options = question.options || [];
  const note = question.language === 'hi' ? 'चाहें तो यह देख लें — या अपना जवाब बोलें या लिखें।' : question.language === 'hinglish' ? 'Chahein to yeh dekh lein — ya apna jawab bolein ya likhein.' : 'A few ideas, if helpful. You can also speak or type your own answer.';
  useEffect(() => {
    let cancelled = false;
    const query = locationQuery.trim();
    setPlaces([]);
    setLocationError('');
    if (question.topic !== 'event.city' || query.length < 2 || !onSearchLocations) {
      setSearching(false);
      return () => { cancelled = true; };
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void onSearchLocations(query).then(result => { if (!cancelled) setPlaces(result); }).catch(() => { if (!cancelled) { setPlaces([]); setLocationError('Location search is unavailable right now. Please try again.'); } }).finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [locationQuery, question.topic, onSearchLocations]);
  return <AuraReveal><View style={{ gap: 8 }}>
    {showQuestion && !!question.question && <Text size={12} color={c.ink}>{question.question}</Text>}
    {options.some((option: Data | string) => typeof option === 'string' || !option.skipTopic) && <Text color={c.muted} size={10}>{note}</Text>}
    {(question.options || []).map((option: Data | string, index: number) => {
      const label = typeof option === 'string' ? option : option.label;
      const choice = auraChoice(option);
      return <AuraRow key={`${label}-${index}`} title={label || 'Suggestion'} disabled={busy} onPress={() => choice.prefill ? onPrefill(choice.prefill) : onSend(choice.message, choice.body)} />;
    })}
    {question.topic === 'event.city' && <View style={{ gap: 8 }}>
      <Text color={c.muted} size={10}>Search for and select the event town or area so nearby vendor coverage is accurate.</Text>
      <LocationPicker
        initialQuery={locationQuery}
        buttonTitle="Open location picker"
        onSelect={(place) => {
          setLocationQuery([place.locality, place.city].filter(Boolean).join(', '));
          onSelectLocation?.(place);
        }}
      />
      <AuraField label="Search town or area" placeholder="e.g. Kapkot, Bageshwar" value={locationQuery} onChangeText={setLocationQuery} autoCapitalize="words" returnKeyType="search" />
      {searching && <Text size={10} color={c.muted}>Searching locations…</Text>}
      {!!locationError && <Text size={10} color={c.danger}>{locationError}</Text>}
      {!searching && !locationError && locationQuery.trim().length >= 2 && places.length === 0 && <Text size={10} color={c.muted}>No places found. Try a nearby town or area name.</Text>}
      {places.map((place, index) => <AuraRow key={`${place.id || place.address}-${index}`} title={[place.name, [place.city, place.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')} icon="location-outline" disabled={busy} onPress={() => onSelectLocation?.(place)} />)}
    </View>}
    {question.topic === 'event.date' && <>
      {Platform.OS === 'web' ? <AuraField label="Event date (YYYY-MM-DD)" placeholder="YYYY-MM-DD" value={value} onChangeText={setValue} /> : <AuraRow title={value ? date(value) : 'When is the event?'} icon="calendar-outline" disabled={busy} onPress={() => setShowDate(true)} />}
      {showDate && <DateTimePicker value={value ? new Date(`${value}T12:00:00`) : new Date()} minimumDate={new Date()} mode="date" themeVariant={c.dark ? 'dark' : 'light'} onChange={(e, next) => {
        if (Platform.OS === 'android') setShowDate(false);
        if (e.type !== 'dismissed' && next) setValue(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`);
      }} />}
      {showDate && Platform.OS === 'ios' && <AuraRow title="Done choosing date" icon="checkmark-outline" onPress={() => setShowDate(false)} />}
      {!!value && <AuraButton title="Use this event date" busy={busy} onPress={() => onSend(value)} />}
    </>}
  </View></AuraReveal>;
}
