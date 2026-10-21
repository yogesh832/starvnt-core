import React, { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { customVendorServiceInput, searchVendorCategories, VENDOR_CATEGORY_VALUES } from '../../server/src/common/vendorCategories.js';
import { Icon, Txt, usePalette } from './ui';

export function VendorCategoryPicker({ value = '', onChange, label = 'Primary category', disabled = false }: { value?: string; onChange: (value: string) => void; label?: string; disabled?: boolean }) {
  const c = usePalette(), [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const other = value === 'Other' || /^Other\s*:/i.test(value);
  const results = searchVendorCategories(query);
  const choices = value && !VENDOR_CATEGORY_VALUES.includes(value) && (!query || value.toLowerCase().includes(query.toLowerCase())) ? [{ value, key: value, planKey: '', aliases: [] }, ...results] : results;
  function select(category: string) { onChange(category); setOpen(false); setQuery(''); }
  return <>
    <View style={{ gap: 7 }}><Txt size={12} bold>{label}</Txt>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value || 'Choose category'}`} accessibilityState={{ disabled, expanded: open }} disabled={disabled}
        onPress={() => { setQuery(''); setOpen(true); }} style={{ minHeight: 50, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, padding: 13, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: disabled ? .5 : 1 }}>
        <Txt style={{ flex: 1, color: value ? c.ink : c.muted }}>{other ? 'Other' : value || 'Search or choose a category'}</Txt><Icon name="chevron-down" size={17} />
      </Pressable>
    </View>
    {other && <View style={{ gap: 7 }}><Txt bold size={12}>What service do you provide? *</Txt>
      <TextInput accessibilityLabel="Your service" editable={!disabled} value={customVendorServiceInput(value)} maxLength={150}
        onChangeText={text => onChange(`Other: ${text}`)} placeholder="e.g. Pet care at events" placeholderTextColor={c.muted}
        style={{ minHeight: 50, color: c.ink, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 13, backgroundColor: c.card }} />
      <Txt muted size={12}>Enter your service name manually so customers know what you offer.</Txt>
    </View>}
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0009' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close category selection" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={['bottom']} style={{ maxHeight: '85%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, gap: 12, backgroundColor: c.card }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Txt bold size={18}>Choose your category</Txt><Pressable accessibilityRole="button" accessibilityLabel="Close categories" onPress={() => setOpen(false)} style={{ padding: 12 }}><Icon name="close" size={23} /></Pressable></View>
          <TextInput accessibilityLabel="Search vendor categories" value={query} onChangeText={setQuery} placeholder="Search services, e.g. pandit or sound" placeholderTextColor={c.muted} autoCorrect={false} style={{ color: c.ink, minHeight: 48, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 12, backgroundColor: c.bg }} />
          <Txt muted size={12}>{choices.length} matching · {VENDOR_CATEGORY_VALUES.length} categories available</Txt>
          <FlatList style={{ flexGrow: 0 }} data={choices} keyExtractor={item => item.value} keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Txt muted>No matching category. Try another term or choose Other.</Txt>}
            renderItem={({ item }) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: value === item.value }} onPress={() => select(item.value)} style={{ minHeight: 50, padding: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: value === item.value ? c.soft : c.card }}><Txt style={{ flex: 1 }} bold={value === item.value}>{item.value}</Txt>{value === item.value && <Icon name="checkmark" color={c.accent} />}</Pressable>} />
          {!choices.some(item => item.value === 'Other') && <Pressable accessibilityRole="button" onPress={() => select('Other')} style={{ padding: 14, borderTopWidth: 1, borderColor: c.line }}><Txt bold style={{ color: c.accent }}>Choose Other</Txt></Pressable>}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}
