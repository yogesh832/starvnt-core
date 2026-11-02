import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { Data } from './api/client';
import { AuraRow, AuraReveal } from './AuraUI';
import { AuraButton, AuraField, AuraText as Text, useAuraPalette } from './AuraTheme';
import { auraChoice } from './auraChoices';
import { date } from './ui';

export function AuraQuestion({ question, busy, onSend, onPrefill, showQuestion = true }: { question: Data; busy: boolean; onSend: (message?: string, body?: Data) => void; onPrefill: (text: string) => void; showQuestion?: boolean }) {
  const [showDate, setShowDate] = useState(false);
  const [value, setValue] = useState('');
  const c = useAuraPalette();
  const options = question.options || [];
  const note = question.language === 'hi' ? 'चाहें तो यह देख लें — या अपना जवाब बोलें या लिखें।' : question.language === 'hinglish' ? 'Chahein to yeh dekh lein — ya apna jawab bolein ya likhein.' : 'A few ideas, if helpful. You can also speak or type your own answer.';
  return <AuraReveal><View style={{ gap: 8 }}>
    {showQuestion && !!question.question && <Text size={12} color={c.ink}>{question.question}</Text>}
    {options.some((option: Data | string) => typeof option === 'string' || !option.skipTopic) && <Text color={c.muted} size={10}>{note}</Text>}
    {(question.options || []).map((option: Data | string, index: number) => {
      const label = typeof option === 'string' ? option : option.label;
      const choice = auraChoice(option);
      return <AuraRow key={`${label}-${index}`} title={label || 'Suggestion'} disabled={busy} onPress={() => choice.prefill ? onPrefill(choice.prefill) : onSend(choice.message, choice.body)} />;
    })}
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
